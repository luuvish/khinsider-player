import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';

class FavoritesManager extends EventEmitter {
  constructor() {
    super();
    this.favoritesPath = path.join(process.cwd(), 'data', 'favorites.json');
    this.historyPath = path.join(process.cwd(), 'data', 'history.json');
    this.playHistoryPath = path.join(process.cwd(), 'data', 'play-history.json');
    this.favoriteAlbumsPath = path.join(process.cwd(), 'data', 'favorite-albums.json');
    this.downloadsPath = path.join(process.cwd(), 'downloads');
    this.favorites = [];
    this.history = [];
    this.playHistory = [];
    this.favoriteAlbums = [];
  }

  async initialize() {
    await fs.ensureDir(path.dirname(this.favoritesPath));
    await fs.ensureDir(path.dirname(this.historyPath));
    await fs.ensureDir(path.dirname(this.playHistoryPath));
    await fs.ensureDir(path.dirname(this.favoriteAlbumsPath));
    await fs.ensureDir(this.downloadsPath);
    await this.loadFavorites();
    await this.loadHistory();
    await this.loadPlayHistory();
    await this.loadFavoriteAlbums();
  }

  async loadFavorites() {
    try {
      if (await fs.pathExists(this.favoritesPath)) {
        const data = await fs.readJson(this.favoritesPath);
        this.favorites = data.favorites || [];
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
      this.favorites = [];
    }
  }

  async saveFavorites() {
    try {
      await fs.writeJson(this.favoritesPath, { 
        favorites: this.favorites,
        updatedAt: new Date().toISOString()
      }, { spaces: 2 });
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }

  async addToFavorites(track, downloadUrl = null) {
    const favorite = {
      ...track,
      id: Date.now() + Math.random(),
      favoritedAt: new Date().toISOString(),
      localPath: null
    };

    if (downloadUrl) {
      try {
        const extension = path.extname(downloadUrl) || '.mp3';
        const filename = `${track.name.replace(/[^a-z0-9]/gi, '_')}${extension}`;
        const localPath = path.join(this.downloadsPath, filename);
        
        favorite.localPath = localPath;
        favorite.downloadUrl = downloadUrl;
      } catch (error) {
        console.error('Error preparing download:', error);
      }
    }

    this.favorites.push(favorite);
    await this.saveFavorites();
    this.emit('favoriteAdded', favorite);
    return favorite;
  }

  async removeFromFavorites(trackId) {
    const index = this.favorites.findIndex(f => f.id === trackId);
    if (index !== -1) {
      const removed = this.favorites.splice(index, 1)[0];
      
      if (removed.localPath && await fs.pathExists(removed.localPath)) {
        try {
          await fs.remove(removed.localPath);
        } catch (error) {
          console.error('Error removing local file:', error);
        }
      }

      await this.saveFavorites();
      this.emit('favoriteRemoved', removed);
      return removed;
    }
    return null;
  }

  isFavorite(track) {
    return this.favorites.some(f => 
      f.name === track.name && f.albumTitle === track.albumTitle
    );
  }

  getFavorites() {
    return [...this.favorites];
  }

  async loadHistory() {
    try {
      if (await fs.pathExists(this.historyPath)) {
        const data = await fs.readJson(this.historyPath);
        this.history = data.history || [];
      }
    } catch (error) {
      console.error('Error loading history:', error);
      this.history = [];
    }
  }

  async saveHistory() {
    try {
      const maxHistoryItems = 100;
      if (this.history.length > maxHistoryItems) {
        this.history = this.history.slice(-maxHistoryItems);
      }

      await fs.writeJson(this.historyPath, { 
        history: this.history,
        updatedAt: new Date().toISOString()
      }, { spaces: 2 });
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }

  async addToHistory(track) {
    const historyItem = {
      ...track,
      playedAt: new Date().toISOString(),
      id: Date.now() + Math.random()
    };

    this.history.push(historyItem);
    await this.saveHistory();
    this.emit('historyAdded', historyItem);
    return historyItem;
  }

  getHistory(limit = 50) {
    return this.history.slice(-limit).reverse();
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.emit('historyCleared');
  }

  async getStatistics() {
    const stats = {
      totalFavorites: this.favorites.length,
      totalPlayed: this.history.length,
      mostPlayedTracks: this.getMostPlayedTracks(10),
      recentlyPlayed: this.getHistory(10),
      favoriteAlbums: this.getFavoriteAlbums(),
      localStorageSize: await this.getLocalStorageSize()
    };
    return stats;
  }

  getMostPlayedTracks(limit = 10) {
    const trackCounts = {};
    
    this.history.forEach(item => {
      const key = `${item.name}::${item.albumTitle}`;
      trackCounts[key] = (trackCounts[key] || 0) + 1;
    });

    return Object.entries(trackCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => {
        const [name, albumTitle] = key.split('::');
        return { name, albumTitle, playCount: count };
      });
  }

  getFavoriteAlbums() {
    const albums = {};
    
    this.favorites.forEach(track => {
      if (track.albumTitle) {
        albums[track.albumTitle] = (albums[track.albumTitle] || 0) + 1;
      }
    });

    return Object.entries(albums)
      .sort((a, b) => b[1] - a[1])
      .map(([albumTitle, trackCount]) => ({ albumTitle, trackCount }));
  }

  async getLocalStorageSize() {
    try {
      const files = await fs.readdir(this.downloadsPath);
      let totalSize = 0;

      for (const file of files) {
        const stats = await fs.stat(path.join(this.downloadsPath, file));
        totalSize += stats.size;
      }

      return {
        bytes: totalSize,
        mb: (totalSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      return { bytes: 0, mb: '0.00' };
    }
  }

  // Album play history methods
  async loadPlayHistory() {
    try {
      if (await fs.pathExists(this.playHistoryPath)) {
        const data = await fs.readJson(this.playHistoryPath);
        this.playHistory = data.playHistory || [];
      }
    } catch (error) {
      console.error('Error loading play history:', error);
      this.playHistory = [];
    }
  }

  async savePlayHistory() {
    try {
      await fs.writeJson(this.playHistoryPath, { 
        playHistory: this.playHistory,
        updatedAt: new Date().toISOString()
      }, { spaces: 2 });
    } catch (error) {
      console.error('Error saving play history:', error);
    }
  }

  async addAlbumToHistory(album) {
    const existingIndex = this.playHistory.findIndex(item => item.title === album.title);
    
    if (existingIndex !== -1) {
      // Update existing entry
      this.playHistory[existingIndex].lastPlayed = new Date().toISOString();
      this.playHistory[existingIndex].playCount = (this.playHistory[existingIndex].playCount || 1) + 1;
    } else {
      // Add new entry
      this.playHistory.push({
        ...album,
        lastPlayed: new Date().toISOString(),
        playCount: 1,
        id: Date.now() + Math.random()
      });
    }

    // Sort by last played (most recent first)
    this.playHistory.sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
    
    // Keep only last 50 albums
    if (this.playHistory.length > 50) {
      this.playHistory = this.playHistory.slice(0, 50);
    }

    await this.savePlayHistory();
    return this.playHistory[0];
  }

  getPlayHistory() {
    return [...this.playHistory];
  }

  // Favorite albums methods
  async loadFavoriteAlbums() {
    try {
      if (await fs.pathExists(this.favoriteAlbumsPath)) {
        const data = await fs.readJson(this.favoriteAlbumsPath);
        this.favoriteAlbums = data.favoriteAlbums || [];
      }
    } catch (error) {
      console.error('Error loading favorite albums:', error);
      this.favoriteAlbums = [];
    }
  }

  async saveFavoriteAlbums() {
    try {
      await fs.writeJson(this.favoriteAlbumsPath, { 
        favoriteAlbums: this.favoriteAlbums,
        updatedAt: new Date().toISOString()
      }, { spaces: 2 });
    } catch (error) {
      console.error('Error saving favorite albums:', error);
    }
  }

  async addAlbumToFavorites(album) {
    if (!this.isAlbumFavorite(album.title)) {
      const favoriteAlbum = {
        ...album,
        id: Date.now() + Math.random(),
        favoritedAt: new Date().toISOString()
      };
      
      this.favoriteAlbums.push(favoriteAlbum);
      await this.saveFavoriteAlbums();
      return favoriteAlbum;
    }
    return null;
  }

  async removeAlbumFromFavorites(albumTitle) {
    const index = this.favoriteAlbums.findIndex(album => album.title === albumTitle);
    if (index !== -1) {
      const removed = this.favoriteAlbums.splice(index, 1)[0];
      await this.saveFavoriteAlbums();
      return removed;
    }
    return null;
  }

  isAlbumFavorite(albumTitle) {
    return this.favoriteAlbums.some(album => album.title === albumTitle);
  }

  getFavoriteAlbums() {
    return [...this.favoriteAlbums];
  }
}

export default FavoritesManager;