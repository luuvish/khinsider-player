import { EventEmitter } from 'events';
import { audioPlayer } from './player.js';
import { playbackRepo } from '../data/repositories/playback-repo.js';
import { albumRepo } from '../data/repositories/album-repo.js';
import { trackRepo } from '../data/repositories/track-repo.js';
import { historyRepo } from '../data/repositories/history-repo.js';
import { storageManager } from '../storage/manager.js';

export const PlaybackState = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ERROR: 'error'
};

export const PlaybackMode = {
  IDLE: 'idle',
  ALBUM: 'album',
  YEAR_SEQUENTIAL: 'year_sequential'
};

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

    this.setupPlayerEvents();
  }

  setupPlayerEvents() {
    audioPlayer.on('play', (data) => {
      this.state = PlaybackState.PLAYING;
      this.emit('trackStart', {
        track: data.track,
        album: this.currentAlbum,
        trackIndex: this.currentTrackIndex,
        totalTracks: this.currentTracks.length
      });
    });

    audioPlayer.on('ended', async () => {
      // Record history and mark as completed
      const track = this.currentTracks[this.currentTrackIndex];
      if (track) {
        historyRepo.addTrackPlay(track, this.currentAlbum);
        // Emit track completed event
        this.emit('trackCompleted', {
          track,
          album: this.currentAlbum
        });
      }

      // Auto advance to next track
      await this.next();
    });

    audioPlayer.on('pause', () => {
      this.state = PlaybackState.PAUSED;
      this.emit('paused');
    });

    audioPlayer.on('resume', () => {
      this.state = PlaybackState.PLAYING;
      this.emit('resumed');
    });

    audioPlayer.on('stop', () => {
      const track = this.currentTracks[this.currentTrackIndex];
      const album = this.currentAlbum;
      this.state = PlaybackState.IDLE;
      this.emit('stopped', { track, album });
    });

    audioPlayer.on('error', (data) => {
      this.state = PlaybackState.ERROR;
      this.emit('error', data);
    });

    audioPlayer.on('loading', () => {
      this.state = PlaybackState.LOADING;
      this.emit('loading');
    });
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
    if (index >= this.yearAlbums.length) {
      this.emit('yearComplete', { year: this.currentYear });
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

  async playTrackByIndex(index) {
    if (index >= this.currentTracks.length) {
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

    this.currentTrackIndex = index;
    const track = this.currentTracks[index];

    // Update state
    playbackRepo.setCurrentTrack(track.id, index);

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
        track.track_number || index + 1,
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
        const urls = await this.scraper.getTrackDirectUrl(track.page_url);
        if (urls?.mp3) {
          audioSource = urls.mp3;
          // Cache URL
          trackRepo.update(track.id, { downloadUrl: urls.mp3 });
        }
      }
    }

    if (!audioSource) {
      this.emit('error', { message: `Cannot find audio source for: ${track.name}` });
      // Skip to next track
      return await this.playTrackByIndex(index + 1);
    }

    // Play
    await audioPlayer.play(audioSource, {
      id: track.id,
      name: track.name,
      duration: track.duration,
      albumTitle: this.currentAlbum?.title
    });

    return true;
  }

  async next() {
    if (this.currentTracks.length === 0) return false;
    return await this.playTrackByIndex(this.currentTrackIndex + 1);
  }

  async previous() {
    if (this.currentTracks.length === 0) return false;
    const newIndex = Math.max(0, this.currentTrackIndex - 1);
    return await this.playTrackByIndex(newIndex);
  }

  async nextAlbum() {
    if (this.mode !== PlaybackMode.YEAR_SEQUENTIAL) return false;
    return await this.playAlbumByIndex(this.yearAlbumIndex + 1);
  }

  async previousAlbum() {
    if (this.mode !== PlaybackMode.YEAR_SEQUENTIAL) return false;
    const newIndex = Math.max(0, this.yearAlbumIndex - 1);
    return await this.playAlbumByIndex(newIndex);
  }

  togglePause() {
    return audioPlayer.togglePause();
  }

  async stop() {
    await audioPlayer.stop();
    this.state = PlaybackState.IDLE;
    playbackRepo.setIdleMode();
  }

  getStatus() {
    return {
      state: this.state,
      mode: this.mode,
      currentYear: this.currentYear,
      yearAlbumIndex: this.yearAlbumIndex,
      totalYearAlbums: this.yearAlbums.length,
      currentAlbum: this.currentAlbum,
      currentTrackIndex: this.currentTrackIndex,
      totalTracks: this.currentTracks.length,
      currentTrack: this.currentTracks[this.currentTrackIndex] || null,
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
