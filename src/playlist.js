import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';

class PlaylistManager extends EventEmitter {
  constructor() {
    super();
    this.playlist = [];
    this.currentIndex = 0;
    this.repeatMode = 'none';
    this.shuffleMode = false;
    this.playlistPath = path.join(process.cwd(), 'data', 'playlists.json');
  }

  async loadPlaylists() {
    try {
      await fs.ensureDir(path.dirname(this.playlistPath));
      if (await fs.pathExists(this.playlistPath)) {
        const data = await fs.readJson(this.playlistPath);
        return data.playlists || [];
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
    return [];
  }

  async savePlaylists(playlists) {
    try {
      await fs.ensureDir(path.dirname(this.playlistPath));
      await fs.writeJson(this.playlistPath, { playlists }, { spaces: 2 });
    } catch (error) {
      console.error('Error saving playlists:', error);
    }
  }

  addTrack(track) {
    this.playlist.push({
      ...track,
      id: Date.now() + Math.random(),
      addedAt: new Date().toISOString()
    });
    this.emit('trackAdded', track);
  }

  addMultipleTracks(tracks) {
    tracks.forEach(track => this.addTrack(track));
    this.emit('playlistUpdated', this.playlist);
  }

  removeTrack(index) {
    if (index >= 0 && index < this.playlist.length) {
      const removed = this.playlist.splice(index, 1)[0];
      if (index < this.currentIndex) {
        this.currentIndex--;
      } else if (index === this.currentIndex && this.currentIndex >= this.playlist.length) {
        this.currentIndex = this.playlist.length - 1;
      }
      this.emit('trackRemoved', removed);
      return removed;
    }
    return null;
  }

  clearPlaylist() {
    this.playlist = [];
    this.currentIndex = 0;
    this.emit('playlistCleared');
  }

  getCurrentTrack() {
    if (this.playlist.length > 0 && this.currentIndex >= 0 && this.currentIndex < this.playlist.length) {
      return this.playlist[this.currentIndex];
    }
    return null;
  }

  nextTrack() {
    if (this.playlist.length === 0) return null;

    if (this.shuffleMode) {
      this.currentIndex = Math.floor(Math.random() * this.playlist.length);
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.playlist.length) {
        if (this.repeatMode === 'all') {
          this.currentIndex = 0;
        } else {
          this.currentIndex = this.playlist.length - 1;
          return null;
        }
      }
    }

    this.emit('trackChanged', this.getCurrentTrack());
    return this.getCurrentTrack();
  }

  previousTrack() {
    if (this.playlist.length === 0) return null;

    this.currentIndex--;
    if (this.currentIndex < 0) {
      if (this.repeatMode === 'all') {
        this.currentIndex = this.playlist.length - 1;
      } else {
        this.currentIndex = 0;
      }
    }

    this.emit('trackChanged', this.getCurrentTrack());
    return this.getCurrentTrack();
  }

  skipToTrack(index) {
    if (index >= 0 && index < this.playlist.length) {
      this.currentIndex = index;
      this.emit('trackChanged', this.getCurrentTrack());
      return this.getCurrentTrack();
    }
    return null;
  }

  setRepeatMode(mode) {
    this.repeatMode = mode;
    this.emit('repeatModeChanged', mode);
  }

  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    this.emit('shuffleModeChanged', this.shuffleMode);
    return this.shuffleMode;
  }

  getPlaylistInfo() {
    return {
      tracks: this.playlist,
      currentIndex: this.currentIndex,
      totalTracks: this.playlist.length,
      repeatMode: this.repeatMode,
      shuffleMode: this.shuffleMode
    };
  }

  async exportPlaylist(filename) {
    try {
      const exportPath = path.join(process.cwd(), 'data', 'exports', `${filename}.json`);
      await fs.ensureDir(path.dirname(exportPath));
      await fs.writeJson(exportPath, {
        name: filename,
        tracks: this.playlist,
        exportedAt: new Date().toISOString()
      }, { spaces: 2 });
      return exportPath;
    } catch (error) {
      console.error('Error exporting playlist:', error);
      throw error;
    }
  }

  async importPlaylist(filepath) {
    try {
      const data = await fs.readJson(filepath);
      this.playlist = data.tracks || [];
      this.currentIndex = 0;
      this.emit('playlistImported', data);
      return data;
    } catch (error) {
      console.error('Error importing playlist:', error);
      throw error;
    }
  }
}

export default PlaylistManager;