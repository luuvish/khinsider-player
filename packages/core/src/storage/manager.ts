import path from 'path';
import fs from 'fs-extra';
import { getProjectRoot } from '../data/database.js';
import { slugify, sanitizeFilename } from '@khinsider/shared';
import type { AlbumMetadata } from '@khinsider/shared';

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

// Validate that a resolved path is within the allowed base directory
function validatePathWithinBase(resolvedPath: string, baseDir: string, name = 'path'): void {
  const normalizedResolved = path.resolve(resolvedPath);
  const normalizedBase = path.resolve(baseDir);

  if (!normalizedResolved.startsWith(normalizedBase + path.sep) && normalizedResolved !== normalizedBase) {
    throw new Error(`Invalid ${name}: path escapes base directory`);
  }
}

// Check if a path is a symlink (potential symlink attack)
async function checkNotSymlink(targetPath: string): Promise<void> {
  try {
    const stats = await fs.lstat(targetPath);
    if (stats.isSymbolicLink()) {
      throw new Error('Symlinks are not allowed in download paths');
    }
  } catch (error: unknown) {
    // Path doesn't exist yet, which is fine
    if (error instanceof Error && error.message.includes('Symlinks')) {
      throw error;
    }
    // ENOENT is expected for new paths
  }
}

// Check parent directories for symlinks
async function checkParentNotSymlink(targetPath: string, baseDir: string): Promise<void> {
  let current = path.dirname(targetPath);
  const normalizedBase = path.resolve(baseDir);

  while (current.length >= normalizedBase.length && current !== normalizedBase) {
    await checkNotSymlink(current);
    const parent = path.dirname(current);
    if (parent === current) break; // Reached root
    current = parent;
  }
}

export class StorageManager {
  downloadsDir: string;

  constructor(downloadsDir?: string) {
    this.downloadsDir = downloadsDir || path.join(getProjectRoot(), 'downloads');
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

    // Validate the resolved path is within downloads directory
    validatePathWithinBase(albumPath, this.downloadsDir, 'album path');

    // Check for symlink attacks in parent directories
    await checkParentNotSymlink(albumPath, this.downloadsDir);

    await fs.ensureDir(albumPath);

    // Verify the created directory is not a symlink
    await checkNotSymlink(albumPath);

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

    // SECURITY: Validate final path is within base directory (defense-in-depth)
    validatePathWithinBase(metadataPath, this.downloadsDir, 'metadata path');

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
    try {
      const years = await this.getDownloadedYears();

      // Process years in parallel
      const yearStatsPromises = years.map(async (year) => {
        try {
          const albums = await this.getDownloadedAlbums(year);

          // Process albums in parallel within each year
          const albumStatsPromises = albums.map(async (album) => {
            try {
              let albumSize = 0;
              let albumTrackCount = 0;

              const tracksPath = this.getTracksPath(year, album);
              const [tracksExist, coverPath] = await Promise.all([
                fs.pathExists(tracksPath),
                Promise.resolve(this.getCoverPath(year, album))
              ]);

              if (tracksExist) {
                const tracks = await fs.readdir(tracksPath);
                const audioTracks = tracks.filter(t => t.endsWith('.mp3') || t.endsWith('.flac'));
                albumTrackCount = audioTracks.length;

                // Get all file sizes in parallel
                const sizes = await Promise.all(
                  tracks.map(track => this.getFileSize(path.join(tracksPath, track)))
                );
                albumSize = sizes.reduce((sum, size) => sum + size, 0);
              }

              // Check cover size
              if (await fs.pathExists(coverPath)) {
                albumSize += await this.getFileSize(coverPath);
              }

              return { size: albumSize, trackCount: albumTrackCount };
            } catch {
              return { size: 0, trackCount: 0 };
            }
          });

          const albumStats = await Promise.all(albumStatsPromises);
          return {
            albumCount: albums.length,
            trackCount: albumStats.reduce((sum, s) => sum + s.trackCount, 0),
            size: albumStats.reduce((sum, s) => sum + s.size, 0)
          };
        } catch {
          return { albumCount: 0, trackCount: 0, size: 0 };
        }
      });

      const yearStats = await Promise.all(yearStatsPromises);

      const totalSize = yearStats.reduce((sum, s) => sum + s.size, 0);
      const albumCount = yearStats.reduce((sum, s) => sum + s.albumCount, 0);
      const trackCount = yearStats.reduce((sum, s) => sum + s.trackCount, 0);

      return {
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        albumCount,
        trackCount
      };
    } catch {
      return {
        totalSize: 0,
        totalSizeMB: '0.00',
        albumCount: 0,
        trackCount: 0
      };
    }
  }
}

export const storageManager = new StorageManager();
export { slugify, sanitizeFilename };
