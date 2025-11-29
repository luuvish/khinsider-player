import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import { storageManager, slugify } from './manager.js';
import { albumRepo } from '../data/repositories/album-repo.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AlbumDownloader extends EventEmitter {
  constructor(scraper) {
    super();
    this.scraper = scraper;
    this.isDownloading = false;
    this.currentDownload = null;
    this.aborted = false;
  }

  async downloadFile(url, destPath, options = {}) {
    const { onProgress } = options;

    await fs.ensureDir(path.dirname(destPath));

    const response = await this.scraper.client({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const totalLength = parseInt(response.headers['content-length'], 10) || 0;
    let downloadedLength = 0;

    const writer = fs.createWriteStream(destPath);

    response.data.on('data', (chunk) => {
      downloadedLength += chunk.length;
      if (onProgress && totalLength > 0) {
        onProgress({
          downloaded: downloadedLength,
          total: totalLength,
          percent: Math.round((downloadedLength / totalLength) * 100)
        });
      }
    });

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve(destPath));
      writer.on('error', reject);
    });
  }

  async downloadCover(album, albumPath, albumSlug) {
    if (!album.cover_url && !album.coverUrl) {
      return null;
    }

    const coverUrl = album.cover_url || album.coverUrl;
    const coverName = `${albumSlug}-cover.jpg`;
    const coverPath = path.join(albumPath, coverName);

    try {
      await this.downloadFile(coverUrl, coverPath);
      this.emit('coverDownloaded', { album, path: coverPath });
      return coverName;
    } catch (error) {
      this.emit('coverError', { album, error });
      return null;
    }
  }

  async downloadBulkZips(album, albumPath, albumSlug) {
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
      } catch (error) {
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
      } catch (error) {
        this.emit('zipError', { album, format: 'flac', error });
      }
    }

    return results;
  }

  async downloadAlbumImages(album, albumPath, albumSlug) {
    // Get album info with images
    let albumInfo;
    try {
      albumInfo = await this.scraper.getAlbumInfo(album.url);
    } catch (error) {
      this.emit('imagesError', { album, error });
      return null;
    }

    if (!albumInfo.images || albumInfo.images.length === 0) {
      return null;
    }

    // Create temp directory for images
    const tempImagesPath = path.join(albumPath, '_images_temp');
    await fs.ensureDir(tempImagesPath);

    const downloadedImages = [];

    this.emit('imagesStart', { album, total: albumInfo.images.length });

    for (let i = 0; i < albumInfo.images.length; i++) {
      if (this.aborted) break;

      const imageUrl = albumInfo.images[i];
      const ext = path.extname(imageUrl) || '.jpg';
      const filename = `image-${String(i + 1).padStart(2, '0')}${ext}`;
      const imagePath = path.join(tempImagesPath, filename);

      try {
        this.emit('imageProgress', {
          album,
          current: i + 1,
          total: albumInfo.images.length,
          filename
        });

        await this.downloadFile(imageUrl, imagePath);
        downloadedImages.push({ filename, path: imagePath, url: imageUrl });
      } catch (error) {
        this.emit('imageError', { album, imageUrl, error });
      }
    }

    // Compress images to {albumSlug}-images.zip
    const imagesZipName = `${albumSlug}-images.zip`;
    if (downloadedImages.length > 0) {
      const imagesZipPath = path.join(albumPath, imagesZipName);
      try {
        await execAsync(`cd "${tempImagesPath}" && zip -r "${imagesZipPath}" .`);
        this.emit('imagesComplete', { album, count: downloadedImages.length, zipPath: imagesZipPath });
      } catch (error) {
        this.emit('imagesError', { album, error });
      }
    }

    // Clean up temp directory
    await fs.remove(tempImagesPath);

    return { images: downloadedImages, zipName: imagesZipName };
  }

  async downloadAlbum(album) {
    if (this.isDownloading) {
      throw new Error('Already downloading');
    }

    this.isDownloading = true;
    this.aborted = false;
    this.currentDownload = { album };

    const slug = slugify(album.title);
    const year = album.year || 'unknown';
    const albumPath = await storageManager.createAlbumDirectory(year, slug);

    this.emit('start', { album });

    try {
      // Download cover
      const coverName = await this.downloadCover(album, albumPath, slug);

      // Download MP3 and FLAC ZIPs
      const zipResults = await this.downloadBulkZips(album, albumPath, slug);

      // Download album images and compress to images.zip
      const imagesResult = await this.downloadAlbumImages(album, albumPath, slug);

      // Save metadata
      const metadataName = `${slug}-metadata.json`;
      const metadata = {
        version: 4,
        albumSlug: slug,
        title: album.title,
        url: album.url,
        year: year,
        platform: album.platform,
        coverUrl: album.cover_url || album.coverUrl,
        downloadedAt: new Date().toISOString(),
        files: {
          cover: coverName || null,
          mp3Zip: zipResults.mp3 || null,
          flacZip: zipResults.flac || null,
          imagesZip: imagesResult?.zipName || null
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
    } catch (error) {
      this.emit('error', { album, error });
      throw error;
    } finally {
      this.isDownloading = false;
      this.currentDownload = null;
    }
  }

  abort() {
    this.aborted = true;
    this.emit('aborted', this.currentDownload);
  }

  getStatus() {
    return {
      isDownloading: this.isDownloading,
      currentDownload: this.currentDownload
    };
  }
}

export function createDownloader(scraper) {
  return new AlbumDownloader(scraper);
}
