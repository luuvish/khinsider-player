import path from 'path';
import fs from 'fs-extra';
import { PROJECT_ROOT } from '../data/database.js';

const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'downloads');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 100);
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export class StorageManager {
  constructor() {
    this.downloadsDir = DOWNLOADS_DIR;
  }

  async ensureDirectories() {
    await fs.ensureDir(this.downloadsDir);
  }

  getAlbumPath(year, albumSlug) {
    const yearDir = year || 'unknown';
    return path.join(this.downloadsDir, yearDir, albumSlug);
  }

  getTracksPath(year, albumSlug) {
    return path.join(this.getAlbumPath(year, albumSlug), 'tracks');
  }

  getImagesPath(year, albumSlug) {
    return path.join(this.getAlbumPath(year, albumSlug), 'images');
  }

  getCoverPath(year, albumSlug) {
    return path.join(this.getAlbumPath(year, albumSlug), 'cover.jpg');
  }

  getMetadataPath(year, albumSlug) {
    return path.join(this.getAlbumPath(year, albumSlug), 'metadata.json');
  }

  getZipPath(year, albumSlug) {
    return path.join(this.downloadsDir, year || 'unknown', `${albumSlug}.zip`);
  }

  getTrackFilename(trackNumber, trackName, extension = 'mp3') {
    const paddedNumber = String(trackNumber).padStart(2, '0');
    const safeName = slugify(trackName);
    return `${paddedNumber}-${safeName}.${extension}`;
  }

  getTrackPath(year, albumSlug, trackNumber, trackName, extension = 'mp3') {
    const filename = this.getTrackFilename(trackNumber, trackName, extension);
    return path.join(this.getTracksPath(year, albumSlug), filename);
  }

  async createAlbumDirectory(year, albumSlug) {
    const albumPath = this.getAlbumPath(year, albumSlug);
    await fs.ensureDir(albumPath);
    return albumPath;
  }

  async saveMetadata(year, albumSlug, metadata, filename = null) {
    const metadataPath = filename
      ? path.join(this.getAlbumPath(year, albumSlug), filename)
      : this.getMetadataPath(year, albumSlug);
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    return metadataPath;
  }

  async loadMetadata(year, albumSlug) {
    const metadataPath = this.getMetadataPath(year, albumSlug);
    if (await fs.pathExists(metadataPath)) {
      return await fs.readJson(metadataPath);
    }
    return null;
  }

  async fileExists(filePath) {
    return await fs.pathExists(filePath);
  }

  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  async deleteAlbum(year, albumSlug) {
    const albumPath = this.getAlbumPath(year, albumSlug);
    if (await fs.pathExists(albumPath)) {
      await fs.remove(albumPath);
      return true;
    }
    return false;
  }

  async getDownloadedYears() {
    await this.ensureDirectories();
    const entries = await fs.readdir(this.downloadsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => /^\d{4}$/.test(name) || name === 'unknown')
      .sort((a, b) => b.localeCompare(a));
  }

  async getDownloadedAlbums(year) {
    const yearPath = path.join(this.downloadsDir, year);
    if (!await fs.pathExists(yearPath)) {
      return [];
    }
    const entries = await fs.readdir(yearPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  }

  async getStorageStats() {
    let totalSize = 0;
    let albumCount = 0;
    let trackCount = 0;

    const years = await this.getDownloadedYears();
    for (const year of years) {
      const albums = await this.getDownloadedAlbums(year);
      albumCount += albums.length;

      for (const album of albums) {
        const tracksPath = this.getTracksPath(year, album);
        if (await fs.pathExists(tracksPath)) {
          const tracks = await fs.readdir(tracksPath);
          trackCount += tracks.filter(t => t.endsWith('.mp3') || t.endsWith('.flac')).length;

          for (const track of tracks) {
            totalSize += await this.getFileSize(path.join(tracksPath, track));
          }
        }

        const coverPath = this.getCoverPath(year, album);
        if (await fs.pathExists(coverPath)) {
          totalSize += await this.getFileSize(coverPath);
        }
      }
    }

    return {
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      albumCount,
      trackCount
    };
  }
}

export const storageManager = new StorageManager();
export { slugify, sanitizeFilename, DOWNLOADS_DIR };
