import { EventEmitter } from 'events';
import type { Readable } from 'stream';
import fs from 'fs-extra';
import path from 'path';
import { storageManager, slugify } from './manager.js';
import { albumRepo } from '../data/repositories/album-repo.js';
import { METADATA_VERSION } from '../constants.js';
import type { Album, IKhinsiderScraper, DownloadProgress, DownloadedFiles, AlbumMetadata } from '../types/index.js';

interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
}

interface DownloadStatus {
  isDownloading: boolean;
  currentDownload: { album: Album } | null;
}

interface DownloadResult {
  success: boolean;
  path: string;
  files: DownloadedFiles;
}

export class AlbumDownloader extends EventEmitter {
  scraper: IKhinsiderScraper;
  isDownloading: boolean;
  currentDownload: { album: Album } | null;
  aborted: boolean;
  currentStream: Readable | null;
  currentAlbumPath: string | null;

  constructor(scraper: IKhinsiderScraper) {
    super();
    this.scraper = scraper;
    this.isDownloading = false;
    this.currentDownload = null;
    this.aborted = false;
    this.currentStream = null;
    this.currentAlbumPath = null;
  }

  async downloadFile(url: string, destPath: string, options: DownloadOptions = {}): Promise<string> {
    const { onProgress } = options;

    // Check if aborted before starting
    if (this.aborted) {
      throw new Error('Download aborted');
    }

    await fs.ensureDir(path.dirname(destPath));

    // Use rate-limited streaming request
    const response = await this.scraper.makeStreamRequest(url);

    const totalLength = parseInt(response.headers['content-length'], 10) || 0;
    let downloadedLength = 0;

    const writer = fs.createWriteStream(destPath);
    this.currentStream = response.data;

    return new Promise((resolve, reject) => {
      let settled = false;
      let streamsDestroyed = false;

      // Centralized stream cleanup with duplicate call protection
      const destroyStreams = () => {
        if (streamsDestroyed) return;
        streamsDestroyed = true;
        try { response.data.destroy(); } catch { /* ignore */ }
        try { writer.destroy(); } catch { /* ignore */ }
      };

      const handleError = async (err: Error) => {
        if (settled) return;
        settled = true;
        this.currentStream = null;

        // Clean up both streams and partial file on error
        destroyStreams();
        await fs.unlink(destPath).catch(() => {});
        reject(err);
      };

      response.data.on('data', (chunk: Buffer) => {
        // Check for abort during download
        if (this.aborted) {
          handleError(new Error('Download aborted')).catch(() => {});
          return;
        }
        downloadedLength += chunk.length;
        if (onProgress && totalLength > 0) {
          try {
            onProgress({
              downloaded: downloadedLength,
              total: totalLength,
              percent: Math.round((downloadedLength / totalLength) * 100)
            });
          } catch {
            // Ignore progress callback errors
          }
        }
      });

      response.data.pipe(writer);

      writer.on('finish', () => {
        if (settled) return;
        settled = true;
        this.currentStream = null;
        resolve(destPath);
      });

      writer.on('error', (err: Error) => handleError(err).catch(() => {}));
      response.data.on('error', (err: Error) => handleError(err).catch(() => {}));
    });
  }

  async downloadCover(album: Album, albumPath: string, albumSlug: string): Promise<string | null> {
    if (!album.cover_url) {
      return null;
    }

    const coverUrl = album.cover_url;
    const coverName = `${albumSlug}-cover.jpg`;
    const coverPath = path.join(albumPath, coverName);

    try {
      await this.downloadFile(coverUrl, coverPath);
      this.emit('coverDownloaded', { album, path: coverPath });
      return coverName;
    } catch (error: unknown) {
      this.emit('coverError', { album, error });
      return null;
    }
  }

  async downloadBulkZips(album: Album, albumPath: string, albumSlug: string): Promise<{ mp3: string | null; flac: string | null }> {
    // Get bulk download URLs for MP3 and FLAC
    const urls = await this.scraper.getBulkDownloadUrls(album.url);

    if (!urls.mp3Url && !urls.flacUrl) {
      throw new Error('No download URLs found. Please login first (press L)');
    }

    const results = { mp3: null, flac: null };

    // Download MP3 ZIP if available
    if (urls.mp3Url) {
      const mp3ZipName = `${albumSlug}-mp3.zip`;
      const mp3ZipPath = path.join(albumPath, mp3ZipName);
      this.emit('zipProgress', { album, format: 'mp3', status: 'downloading' });

      try {
        await this.downloadFile(urls.mp3Url, mp3ZipPath, {
          onProgress: (progress) => {
            this.emit('zipProgress', { album, format: 'mp3', ...progress });
          }
        });
        results.mp3 = mp3ZipName;
        this.emit('zipComplete', { album, format: 'mp3', path: mp3ZipPath });
      } catch (error: unknown) {
        this.emit('zipError', { album, format: 'mp3', error });
      }
    }

    // Download FLAC ZIP if available
    if (urls.flacUrl) {
      const flacZipName = `${albumSlug}-flac.zip`;
      const flacZipPath = path.join(albumPath, flacZipName);
      this.emit('zipProgress', { album, format: 'flac', status: 'downloading' });

      try {
        await this.downloadFile(urls.flacUrl, flacZipPath, {
          onProgress: (progress) => {
            this.emit('zipProgress', { album, format: 'flac', ...progress });
          }
        });
        results.flac = flacZipName;
        this.emit('zipComplete', { album, format: 'flac', path: flacZipPath });
      } catch (error: unknown) {
        this.emit('zipError', { album, format: 'flac', error });
      }
    }

    return results;
  }

  async downloadAlbum(album: Album): Promise<DownloadResult> {
    if (this.isDownloading) {
      throw new Error('Already downloading');
    }

    this.isDownloading = true;
    this.aborted = false;
    this.currentDownload = { album };

    const slug = slugify(album.title);
    // Validate slug is not empty (could happen if title has only special chars)
    if (!slug || slug.length === 0) {
      throw new Error('Cannot create album directory: invalid album title');
    }
    const year = album.year || 'unknown';
    const albumPath = await storageManager.createAlbumDirectory(year, slug);
    this.currentAlbumPath = albumPath;

    this.emit('start', { album });

    try {
      // Download cover
      const coverName = await this.downloadCover(album, albumPath, slug);

      // Download MP3 and FLAC ZIPs
      const zipResults = await this.downloadBulkZips(album, albumPath, slug);

      // Save metadata
      const metadataName = `${slug}-metadata.json`;
      const metadata: AlbumMetadata = {
        version: METADATA_VERSION,
        albumSlug: slug,
        title: album.title,
        url: album.url,
        year: year,
        platform: album.platform || undefined,
        coverUrl: album.cover_url || undefined,
        downloadedAt: new Date().toISOString(),
        files: {
          cover: coverName || null,
          mp3Zip: zipResults.mp3 || null,
          flacZip: zipResults.flac || null
        }
      };

      await storageManager.saveMetadata(year, slug, metadata, metadataName);

      // Update album in database
      if (album.id) {
        albumRepo.setDownloaded(album.id, true, albumPath);
      }

      this.emit('complete', {
        album,
        path: albumPath,
        files: metadata.files
      });

      return {
        success: true,
        path: albumPath,
        files: metadata.files
      };
    } catch (error: unknown) {
      // Clean up partial download on any error
      if (this.currentAlbumPath) {
        try {
          await fs.remove(this.currentAlbumPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      this.emit('error', { album, error });
      throw error;
    } finally {
      this.isDownloading = false;
      this.currentDownload = null;
      this.currentAlbumPath = null;
      this.currentStream = null;
    }
  }

  async abort(): Promise<void> {
    this.aborted = true;

    // Destroy current stream if active
    if (this.currentStream) {
      this.currentStream.destroy();
      this.currentStream = null;
    }

    this.emit('aborted', this.currentDownload);

    // Clean up partial download directory
    if (this.currentAlbumPath) {
      try {
        await fs.remove(this.currentAlbumPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  getStatus(): DownloadStatus {
    return {
      isDownloading: this.isDownloading,
      currentDownload: this.currentDownload
    };
  }
}

export function createDownloader(scraper: IKhinsiderScraper): AlbumDownloader {
  return new AlbumDownloader(scraper);
}
