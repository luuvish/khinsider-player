import { EventEmitter } from 'events';
import { audioPlayer } from './player.js';
import { playbackRepo } from '../data/repositories/playback-repo.js';
import { albumRepo } from '../data/repositories/album-repo.js';
import { trackRepo } from '../data/repositories/track-repo.js';
import { historyRepo } from '../data/repositories/history-repo.js';
import { storageManager } from '../storage/manager.js';
import { PlaybackState, PlaybackMode } from '../constants.js';

export { PlaybackState, PlaybackMode };

// Maximum consecutive track failures before stopping playback
const MAX_SKIP = 10;

export class PlaybackController extends EventEmitter {
  constructor(scraper) {
    super();
    this.scraper = scraper;
    this.state = PlaybackState.IDLE;
    this.mode = PlaybackMode.IDLE;

    this.currentYear = null;
    this.yearAlbums = [];
    this.yearAlbumIndex = 0;

    this.currentAlbum = null;
    this.currentTracks = [];
    this.currentTrackIndex = 0;

    // Bound listener references for cleanup
    this._boundListeners = {};
    this._isStopping = false;

    // Mutex lock for navigation operations
    this._isAdvancing = false;

    this.setupPlayerEvents();
  }

  setupPlayerEvents() {
    // Store bound listeners for later cleanup
    this._boundListeners.play = (data) => {
      this.state = PlaybackState.PLAYING;
      this.emit('trackStart', {
        track: data.track,
        album: this.currentAlbum,
        trackIndex: this.currentTrackIndex,
        totalTracks: this.currentTracks.length
      });
    };

    this._boundListeners.ended = async () => {
      // Check if we're stopping or already advancing - prevent race condition
      if (this._isStopping || this.state === PlaybackState.IDLE || this._isAdvancing) {
        return;
      }

      try {
        // Record history and mark as completed
        const track = this.currentTracks[this.currentTrackIndex];
        if (track) {
          historyRepo.addTrackPlay(track, this.currentAlbum);
          this.emit('trackCompleted', {
            track,
            album: this.currentAlbum
          });
        }

        // Auto advance to next track with mutex (call playTrackByIndex directly)
        if (this.currentTracks.length === 0) return;
        this._isAdvancing = true;
        try {
          await this.playTrackByIndex(this.currentTrackIndex + 1);
        } finally {
          this._isAdvancing = false;
        }
      } catch (error) {
        this.emit('error', { message: `Track ended error: ${error.message}` });
      }
    };

    this._boundListeners.pause = () => {
      this.state = PlaybackState.PAUSED;
      this.emit('paused');
    };

    this._boundListeners.resume = () => {
      this.state = PlaybackState.PLAYING;
      this.emit('resumed');
    };

    this._boundListeners.stop = () => {
      const track = this.currentTracks[this.currentTrackIndex];
      const album = this.currentAlbum;
      this.state = PlaybackState.IDLE;
      this.emit('stopped', { track, album });
    };

    this._boundListeners.error = (data) => {
      this.state = PlaybackState.ERROR;
      this.emit('error', data);
    };

    this._boundListeners.loading = () => {
      this.state = PlaybackState.LOADING;
      this.emit('loading');
    };

    // Register listeners
    audioPlayer.on('play', this._boundListeners.play);
    audioPlayer.on('ended', this._boundListeners.ended);
    audioPlayer.on('pause', this._boundListeners.pause);
    audioPlayer.on('resume', this._boundListeners.resume);
    audioPlayer.on('stop', this._boundListeners.stop);
    audioPlayer.on('error', this._boundListeners.error);
    audioPlayer.on('loading', this._boundListeners.loading);
  }

  // Cleanup method to remove all listeners
  cleanup() {
    if (this._boundListeners.play) {
      audioPlayer.off('play', this._boundListeners.play);
      audioPlayer.off('ended', this._boundListeners.ended);
      audioPlayer.off('pause', this._boundListeners.pause);
      audioPlayer.off('resume', this._boundListeners.resume);
      audioPlayer.off('stop', this._boundListeners.stop);
      audioPlayer.off('error', this._boundListeners.error);
      audioPlayer.off('loading', this._boundListeners.loading);
      this._boundListeners = {};
    }
  }

  async playYear(year, startAlbumIndex = 0) {
    this.mode = PlaybackMode.YEAR_SEQUENTIAL;
    this.currentYear = year;
    this.yearAlbumIndex = startAlbumIndex;

    // Fetch albums for year
    this.emit('loadingYear', { year });
    const albums = await this.scraper.getAlbumsByYear(year);

    if (!albums || albums.length === 0) {
      this.emit('error', { message: `No albums found for year ${year}` });
      return false;
    }

    // Cache albums in database
    this.yearAlbums = [];
    for (const album of albums) {
      const dbAlbum = albumRepo.upsert({
        title: album.title,
        url: album.url,
        year: year,
        platform: album.platform
      });
      this.yearAlbums.push(dbAlbum);
    }

    // Save state
    playbackRepo.setYearMode(year, startAlbumIndex);

    this.emit('yearLoaded', {
      year,
      albumCount: this.yearAlbums.length
    });

    // Start playing first album
    return await this.playAlbumByIndex(startAlbumIndex);
  }

  async playAlbum(album, startTrackIndex = 0) {
    this.mode = PlaybackMode.ALBUM;
    this.currentAlbum = album;
    this.currentTrackIndex = 0;

    // Fetch tracks
    this.emit('loadingAlbum', { album });

    let tracks;

    // Check if we have tracks in DB
    const dbTracks = trackRepo.getByAlbumId(album.id);
    if (dbTracks && dbTracks.length > 0) {
      tracks = dbTracks;
    } else {
      // Fetch from web
      const webTracks = await this.scraper.getAlbumTracks(album.url);
      if (!webTracks || webTracks.length === 0) {
        this.emit('error', { message: `No tracks found for album: ${album.title}` });
        return false;
      }

      // Save tracks to DB
      const tracksToInsert = webTracks.map((t, i) => ({
        albumId: album.id,
        trackNumber: i + 1,
        name: t.name,
        duration: t.duration,
        pageUrl: t.pageUrl,
        fileSize: t.mp3Size
      }));

      trackRepo.createMany(tracksToInsert);
      tracks = trackRepo.getByAlbumId(album.id);

      // Update album track count
      albumRepo.update(album.id, { trackCount: tracks.length });
    }

    this.currentTracks = tracks;

    // Save state
    playbackRepo.setAlbumMode(album.id);

    this.emit('albumLoaded', {
      album,
      trackCount: tracks.length
    });

    // Start playing specified track
    return await this.playTrackByIndex(startTrackIndex);
  }

  async playAlbumByIndex(index) {
    // Bounds check
    if (index < 0 || index >= this.yearAlbums.length) {
      if (index >= this.yearAlbums.length) {
        this.emit('yearComplete', { year: this.currentYear });
      }
      this.mode = PlaybackMode.IDLE;
      playbackRepo.setIdleMode();
      return false;
    }

    this.yearAlbumIndex = index;
    const album = this.yearAlbums[index];
    this.currentAlbum = album;

    // Update state
    playbackRepo.updateState({
      yearAlbumIndex: index,
      currentAlbumId: album.id
    });

    this.emit('albumChange', {
      album,
      albumIndex: index,
      totalAlbums: this.yearAlbums.length
    });

    // Fetch and play album tracks
    return await this.playAlbum(album);
  }

  async playTrackByIndex(index, skipCount = 0) {
    // Use iteration instead of recursion to prevent stack overflow
    let currentIndex = index < 0 ? 0 : index;
    let currentSkipCount = skipCount;

    while (currentSkipCount < MAX_SKIP) {
      // Bounds check
      if (currentIndex >= this.currentTracks.length) {
        // Album complete
        if (this.mode === PlaybackMode.YEAR_SEQUENTIAL) {
          // Move to next album in year
          this.emit('albumComplete', {
            album: this.currentAlbum,
            albumIndex: this.yearAlbumIndex
          });
          return await this.playAlbumByIndex(this.yearAlbumIndex + 1);
        } else {
          // Single album mode - stop
          this.emit('albumComplete', { album: this.currentAlbum });
          this.state = PlaybackState.IDLE;
          return false;
        }
      }

      this.currentTrackIndex = currentIndex;
      const track = this.currentTracks[currentIndex];

      // Null check for track
      if (!track) {
        this.emit('error', { message: `Invalid track at index ${currentIndex}` });
        return false;
      }

      // Update state
      playbackRepo.setCurrentTrack(track.id, currentIndex);

      // Get audio source
      let audioSource;

      // Check local file first
      if (track.local_path && await storageManager.fileExists(track.local_path)) {
        audioSource = track.local_path;
      } else if (track.is_downloaded && this.currentAlbum) {
        // Try to find local file
        const slug = this.currentAlbum.slug;
        const year = this.currentAlbum.year || 'unknown';
        const localPath = storageManager.getTrackPath(
          year,
          slug,
          track.track_number || currentIndex + 1,
          track.name
        );
        if (await storageManager.fileExists(localPath)) {
          audioSource = localPath;
        }
      }

      // Fallback to streaming
      if (!audioSource) {
        if (track.download_url) {
          audioSource = track.download_url;
        } else if (track.page_url) {
          try {
            const urls = await this.scraper.getTrackDirectUrl(track.page_url);
            if (urls?.mp3) {
              audioSource = urls.mp3;
              // Cache URL (non-critical, don't let failure stop playback)
              try {
                trackRepo.update(track.id, { downloadUrl: urls.mp3 });
              } catch {
                // Ignore cache update errors
              }
            }
          } catch (error) {
            this.emit('error', { message: `Failed to get URL for: ${track.name}` });
          }
        }
      }

      if (!audioSource) {
        this.emit('error', { message: `Cannot find audio source for: ${track.name}` });
        // Skip to next track
        currentIndex++;
        currentSkipCount++;
        continue;
      }

      // Play
      try {
        await audioPlayer.play(audioSource, {
          id: track.id,
          name: track.name,
          duration: track.duration,
          albumTitle: this.currentAlbum?.title
        });
        return true;
      } catch (error) {
        // Handle play errors and try next track
        currentIndex++;
        currentSkipCount++;
        continue;
      }
    }

    // Too many failed tracks
    this.emit('error', { message: `Too many failed tracks (${MAX_SKIP}), stopping playback` });
    this.state = PlaybackState.IDLE;
    return false;
  }

  async next() {
    if (this._isAdvancing || this.currentTracks.length === 0) return false;
    this._isAdvancing = true;
    try {
      return await this.playTrackByIndex(this.currentTrackIndex + 1);
    } finally {
      this._isAdvancing = false;
    }
  }

  async previous() {
    if (this._isAdvancing || this.currentTracks.length === 0) return false;
    this._isAdvancing = true;
    try {
      const newIndex = Math.max(0, this.currentTrackIndex - 1);
      return await this.playTrackByIndex(newIndex);
    } finally {
      this._isAdvancing = false;
    }
  }

  async nextAlbum() {
    if (this._isAdvancing || this.mode !== PlaybackMode.YEAR_SEQUENTIAL) return false;
    this._isAdvancing = true;
    try {
      return await this.playAlbumByIndex(this.yearAlbumIndex + 1);
    } finally {
      this._isAdvancing = false;
    }
  }

  async previousAlbum() {
    if (this._isAdvancing || this.mode !== PlaybackMode.YEAR_SEQUENTIAL) return false;
    this._isAdvancing = true;
    try {
      const newIndex = Math.max(0, this.yearAlbumIndex - 1);
      return await this.playAlbumByIndex(newIndex);
    } finally {
      this._isAdvancing = false;
    }
  }

  togglePause() {
    return audioPlayer.togglePause();
  }

  async stop() {
    this._isStopping = true;
    try {
      await audioPlayer.stop();
      this.state = PlaybackState.IDLE;
      playbackRepo.setIdleMode();
    } finally {
      this._isStopping = false;
    }
  }

  getStatus() {
    const currentTrack = (this.currentTrackIndex >= 0 && this.currentTrackIndex < this.currentTracks.length)
      ? this.currentTracks[this.currentTrackIndex]
      : null;

    return {
      state: this.state,
      mode: this.mode,
      currentYear: this.currentYear,
      yearAlbumIndex: this.yearAlbumIndex,
      totalYearAlbums: this.yearAlbums.length,
      currentAlbum: this.currentAlbum,
      currentTrackIndex: this.currentTrackIndex,
      totalTracks: this.currentTracks.length,
      currentTrack,
      isPlaying: audioPlayer.isPlaying,
      isPaused: audioPlayer.isPaused
    };
  }

  async restoreSession() {
    const state = playbackRepo.getState();
    if (!state || state.mode === 'idle') {
      return false;
    }

    if (state.mode === 'year_sequential' && state.current_year) {
      return await this.playYear(state.current_year, state.year_album_index || 0);
    } else if (state.mode === 'album' && state.current_album_id) {
      const album = albumRepo.getById(state.current_album_id);
      if (album) {
        return await this.playAlbum(album);
      }
    }

    return false;
  }
}

export function createPlaybackController(scraper) {
  return new PlaybackController(scraper);
}
