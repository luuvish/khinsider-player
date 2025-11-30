import { EventEmitter } from 'events';
import { audioPlayer } from './player.js';
import {
  playbackRepo,
  albumRepo,
  trackRepo,
  historyRepo,
  storageManager
} from '@khinsider/core';
import {
  PlaybackState,
  PlaybackMode,
  type Album,
  type Track,
  type IKhinsiderScraper,
  type PlaybackStatus,
  type PlayEventData,
  type ErrorEventData,
  type PlaybackStateType,
  type PlaybackModeType
} from '@khinsider/shared';

export { PlaybackState, PlaybackMode };

// Maximum consecutive track failures before stopping playback
const MAX_SKIP = 10;

export class PlaybackController extends EventEmitter {
  scraper: IKhinsiderScraper;
  state: PlaybackStateType;
  mode: PlaybackModeType;
  currentYear: string | null;
  yearAlbums: Album[];
  yearAlbumIndex: number;
  currentAlbum: Album | null;
  currentTracks: Track[];
  currentTrackIndex: number;
  _boundListeners: Record<string, (...args: unknown[]) => void>;
  _isStopping: boolean;
  _isAdvancing: boolean;

  constructor(scraper: IKhinsiderScraper) {
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
    this._boundListeners.play = (data: unknown) => {
      const eventData = data as PlayEventData;
      this.state = PlaybackState.PLAYING;
      this.emit('trackStart', {
        track: eventData.track,
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

      // Record history and mark as completed (non-critical, don't block playback)
      try {
        const track = this.currentTracks[this.currentTrackIndex];
        if (track) {
          try {
            historyRepo.addTrackPlay(track, this.currentAlbum);
          } catch {
            // Ignore history recording errors - non-critical
          }

          // SECURITY: Emit with error handling to prevent unhandled rejections
          try {
            this.emit('trackCompleted', {
              track,
              album: this.currentAlbum
            });
          } catch (emitError: unknown) {
            const emitMsg = emitError instanceof Error ? emitError.message : String(emitError);
            console.error('Track completed event error:', emitMsg);
          }
        }
      } catch (error: unknown) {
        // Log but don't stop playback for history/emit errors
        const message = error instanceof Error ? error.message : String(error);
        console.error('Track completion error:', message);
      }

      // Auto advance to next track with mutex
      if (this.currentTracks.length === 0) return;
      this._isAdvancing = true;
      try {
        await this.playTrackByIndex(this.currentTrackIndex + 1);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.emit('error', { message: `Track advance error: ${msg}` });
      } finally {
        this._isAdvancing = false;
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

    this._boundListeners.error = (data: unknown) => {
      this.state = PlaybackState.ERROR;
      this.emit('error', data as ErrorEventData);
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
    if (this._boundListeners && this._boundListeners.play) {
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

  async playYear(year: string, startAlbumIndex = 0): Promise<boolean> {
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
      }) as Album;
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

  async playAlbum(album: Album, startTrackIndex = 0): Promise<boolean> {
    // Validate album
    if (!album || !album.id) {
      this.emit('error', { message: 'Invalid album' });
      return false;
    }

    // Prevent concurrent playback operations
    if (this._isAdvancing) return false;
    this._isAdvancing = true;

    try {
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

      // Start playing specified track (don't use lock again - we already hold it)
      return await this.playTrackByIndex(startTrackIndex);
    } finally {
      this._isAdvancing = false;
    }
  }

  async playAlbumByIndex(index: number): Promise<boolean> {
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

  async playTrackByIndex(index: number, skipCount = 0): Promise<boolean> {
    // Check if stopping - exit early
    if (this._isStopping) {
      return false;
    }

    // Use iteration instead of recursion to prevent stack overflow
    let currentIndex = index < 0 ? 0 : index;
    let currentSkipCount = skipCount;

    // Capture current state to prevent race conditions during async operations
    const capturedAlbum = this.currentAlbum;
    const capturedTracks = this.currentTracks;
    const capturedMode = this.mode;
    const capturedYearAlbumIndex = this.yearAlbumIndex;

    while (currentSkipCount < MAX_SKIP) {
      // Check if stopping during iteration
      if (this._isStopping) {
        return false;
      }

      // Bounds check using captured tracks
      if (currentIndex >= capturedTracks.length) {
        // Album complete
        if (capturedMode === PlaybackMode.YEAR_SEQUENTIAL) {
          // Move to next album in year
          this.emit('albumComplete', {
            album: capturedAlbum,
            albumIndex: capturedYearAlbumIndex
          });
          return await this.playAlbumByIndex(capturedYearAlbumIndex + 1);
        } else {
          // Single album mode - stop
          this.emit('albumComplete', { album: capturedAlbum });
          this.state = PlaybackState.IDLE;
          return false;
        }
      }

      this.currentTrackIndex = currentIndex;
      const track = capturedTracks[currentIndex];

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
      } else if (track.is_downloaded && capturedAlbum?.slug) {
        // Try to find local file using captured album reference
        const slug = capturedAlbum.slug;
        const year = capturedAlbum.year || 'unknown';
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
          } catch {
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

      // Play with captured album title (with fallback)
      try {
        await audioPlayer.play(audioSource, {
          id: track.id,
          name: track.name,
          duration: track.duration,
          albumTitle: capturedAlbum?.title || 'Unknown Album'
        });
        return true;
      } catch {
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

  async next(): Promise<boolean> {
    if (this._isAdvancing || this.currentTracks.length === 0) return false;
    this._isAdvancing = true;
    try {
      return await this.playTrackByIndex(this.currentTrackIndex + 1);
    } finally {
      this._isAdvancing = false;
    }
  }

  async previous(): Promise<boolean> {
    if (this._isAdvancing || this.currentTracks.length === 0) return false;
    this._isAdvancing = true;
    try {
      const newIndex = Math.max(0, this.currentTrackIndex - 1);
      return await this.playTrackByIndex(newIndex);
    } finally {
      this._isAdvancing = false;
    }
  }

  async nextAlbum(): Promise<boolean> {
    if (this._isAdvancing || this.mode !== PlaybackMode.YEAR_SEQUENTIAL) return false;
    this._isAdvancing = true;
    try {
      return await this.playAlbumByIndex(this.yearAlbumIndex + 1);
    } finally {
      this._isAdvancing = false;
    }
  }

  async previousAlbum(): Promise<boolean> {
    if (this._isAdvancing || this.mode !== PlaybackMode.YEAR_SEQUENTIAL) return false;
    this._isAdvancing = true;
    try {
      const newIndex = Math.max(0, this.yearAlbumIndex - 1);
      return await this.playAlbumByIndex(newIndex);
    } finally {
      this._isAdvancing = false;
    }
  }

  togglePause(): boolean {
    return audioPlayer.togglePause();
  }

  async stop(): Promise<void> {
    this._isStopping = true;
    try {
      await audioPlayer.stop();
      this.state = PlaybackState.IDLE;
      playbackRepo.setIdleMode();
    } finally {
      this._isStopping = false;
    }
  }

  getStatus(): PlaybackStatus {
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

  async restoreSession(): Promise<boolean> {
    const state = playbackRepo.getState();
    if (!state) {
      return false;
    }

    // Type assertion after null check
    const typedState = state as {
      mode: string;
      current_year: string | null;
      year_album_index: number;
      current_album_id: number | null;
    };

    if (typedState.mode === 'idle') {
      return false;
    }

    if (typedState.mode === 'year_sequential' && typedState.current_year) {
      return await this.playYear(typedState.current_year, typedState.year_album_index || 0);
    } else if (typedState.mode === 'album' && typedState.current_album_id) {
      const album = albumRepo.getById(typedState.current_album_id) as Album | undefined;
      if (album) {
        return await this.playAlbum(album);
      }
    }

    return false;
  }
}

export function createPlaybackController(scraper: IKhinsiderScraper): PlaybackController {
  return new PlaybackController(scraper);
}
