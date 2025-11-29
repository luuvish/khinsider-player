import path from 'path';
import fs from 'fs-extra';
import { PROJECT_ROOT } from '../data/database.js';
import { slugify, sanitizeFilename } from '../utils/index.js';
import type { AlbumMetadata } from '../types/index.js';

const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'downloads');

// Validate path component to prevent path traversal attacks
function validatePathComponent(component: unknown, name = 'path component'): string {
  if (component === null || component === undefined || typeof component !== 'string') {
    throw new Error(`Invalid ${name}: must be a non-empty string`);
  }

  // Trim whitespace and check for empty string
  const trimmed = component.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid ${name}: must be a non-empty string`);
  }

  // Block path traversal patterns
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Invalid ${name}: contains path traversal characters`);
  }

  // Block null bytes
  if (trimmed.includes('\0')) {
    throw new Error(`Invalid ${name}: contains null bytes`);
  }

  return trimmed;
}

export class StorageManager {
  downloadsDir: string;

  constructor() {
    this.downloadsDir = DOWNLOADS_DIR;
  }

  async ensureDirectories() {
    await fs.ensureDir(this.downloadsDir);
  }

  getAlbumPath(year: string | null, albumSlug: string): string {
    const yearDir = year || 'unknown';
    validatePathComponent(yearDir, 'year');
    validatePathComponent(albumSlug, 'albumSlug');
    return path.join(this.downloadsDir, yearDir, albumSlug);
  }

  getTracksPath(year: string | null, albumSlug: string): string {
    return path.join(this.getAlbumPath(year, albumSlug), 'tracks');
  }

  getImagesPath(year: string | null, albumSlug: string): string {
    return path.join(this.getAlbumPath(year, albumSlug), 'images');
  }

  getCoverPath(year: string | null, albumSlug: string): string {
    return path.join(this.getAlbumPath(year, albumSlug), 'cover.jpg');
  }

  getMetadataPath(year: string | null, albumSlug: string): string {
    return path.join(this.getAlbumPath(year, albumSlug), 'metadata.json');
  }

  getZipPath(year: string | null, albumSlug: string): string {
    const yearDir = year || 'unknown';
    validatePathComponent(yearDir, 'year');
    validatePathComponent(albumSlug, 'albumSlug');
    return path.join(this.downloadsDir, yearDir, `${albumSlug}.zip`);
  }

  getTrackFilename(trackNumber: number, trackName: string, extension = 'mp3'): string {
    const paddedNumber = String(trackNumber).padStart(2, '0');
    const safeName = slugify(trackName);
    return `${paddedNumber}-${safeName}.${extension}`;
  }

  getTrackPath(year: string | null, albumSlug: string, trackNumber: number, trackName: string, extension = 'mp3'): string {
    const filename = this.getTrackFilename(trackNumber, trackName, extension);
    return path.join(this.getTracksPath(year, albumSlug), filename);
  }

  async createAlbumDirectory(year: string | null, albumSlug: string): Promise<string> {
    const albumPath = this.getAlbumPath(year, albumSlug);
    await fs.ensureDir(albumPath);
    return albumPath;
  }

  async saveMetadata(year: string | null, albumSlug: string, metadata: AlbumMetadata, filename: string | null = null): Promise<string> {
    let metadataPath;
    if (filename) {
      validatePathComponent(filename, 'filename');
      metadataPath = path.join(this.getAlbumPath(year, albumSlug), filename);
    } else {
      metadataPath = this.getMetadataPath(year, albumSlug);
    }
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    return metadataPath;
  }

  async loadMetadata(year: string | null, albumSlug: string): Promise<AlbumMetadata | null> {
    const metadataPath = this.getMetadataPath(year, albumSlug);
    if (await fs.pathExists(metadataPath)) {
      try {
        return await fs.readJson(metadataPath) as AlbumMetadata;
      } catch (error: unknown) {
        // Return null if JSON is malformed
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse metadata at ${metadataPath}:`, message);
        return null;
      }
    }
    return null;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return await fs.pathExists(filePath);
  }

  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  async deleteAlbum(year: string | null, albumSlug: string): Promise<boolean> {
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

  async getDownloadedAlbums(year: string): Promise<string[]> {
    validatePathComponent(year, 'year');
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

    try {
      const years = await this.getDownloadedYears();
      for (const year of years) {
        try {
          const albums = await this.getDownloadedAlbums(year);
          albumCount += albums.length;

          for (const album of albums) {
            try {
              const tracksPath = this.getTracksPath(year, album);
              if (await fs.pathExists(tracksPath)) {
                const tracks = await fs.readdir(tracksPath);
                trackCount += tracks.filter(t => t.endsWith('.mp3') || t.endsWith('.flac')).length;

                for (const track of tracks) {
                  // getFileSize already handles errors and returns 0
                  totalSize += await this.getFileSize(path.join(tracksPath, track));
                }
              }

              const coverPath = this.getCoverPath(year, album);
              if (await fs.pathExists(coverPath)) {
                totalSize += await this.getFileSize(coverPath);
              }
            } catch {
              // Skip albums that can't be read (deleted mid-scan, permission issues)
            }
          }
        } catch {
          // Skip years that can't be read
        }
      }
    } catch {
      // If we can't read years at all, return zero stats
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
