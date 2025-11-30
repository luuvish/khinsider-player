import { Router, Request, Response } from 'express';
import { trackRepo, KhinsiderScraper } from '@khinsider/core';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { isValidUrl } from '@khinsider/shared';

const router = Router();
const scraper = new KhinsiderScraper();

// SECURITY: Cache TTL for download URLs (24 hours in milliseconds)
// URLs older than this will be refreshed to ensure validity
const URL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// SECURITY: Whitelist of allowed stream URL domains
// Only URLs from these domains are allowed for audio streaming
const ALLOWED_STREAM_DOMAINS = [
  'downloads.khinsider.com',
  'vgmsite.com',
  'vgmtreasurechest.com'
];

/**
 * Validate that a URL is from an allowed streaming domain
 */
function isAllowedStreamDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_STREAM_DOMAINS.some(domain =>
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

// In-memory cache for URL timestamps (track_id -> cached_at timestamp)
// Note: In production with multiple instances, use Redis instead
const urlCacheTimestamps = new Map<number, number>();

// Cleanup old cache entries periodically (every hour)
let urlCacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

urlCacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [trackId, cachedAt] of urlCacheTimestamps.entries()) {
    if (now - cachedAt > URL_CACHE_TTL_MS * 2) {
      urlCacheTimestamps.delete(trackId);
    }
  }
}, 60 * 60 * 1000);

/**
 * Cleanup URL cache interval (call on server shutdown)
 */
export function clearUrlCacheCleanup(): void {
  if (urlCacheCleanupInterval) {
    clearInterval(urlCacheCleanupInterval);
    urlCacheCleanupInterval = null;
  }
  urlCacheTimestamps.clear();
}

// Validation helper
function validateId(id: string): number {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > Number.MAX_SAFE_INTEGER) {
    throw createError('Invalid ID format', 400);
  }
  return parsed;
}

// GET /api/tracks/:id
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const trackId = validateId(id);

    const track = trackRepo.getById(trackId);
    if (!track) {
      throw createError('Track not found', 404);
    }

    res.json({
      track: {
        id: track.id,
        albumId: track.album_id,
        trackNumber: track.track_number,
        name: track.name,
        duration: track.duration,
        pageUrl: track.page_url,
        fileSize: track.file_size,
        isPlayed: Boolean(track.is_played),
        isDownloaded: Boolean(track.is_downloaded)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tracks/:id/stream-url - Requires authentication
router.get('/:id/stream-url', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { refresh } = req.query;
    const trackId = validateId(id);
    const forceRefresh = refresh === 'true';

    const track = trackRepo.getById(trackId);
    if (!track) {
      throw createError('Track not found', 404);
    }

    // Check if cached URL is available and not expired
    const cachedAt = urlCacheTimestamps.get(trackId);
    const isCacheValid = cachedAt && (Date.now() - cachedAt) < URL_CACHE_TTL_MS;

    // Return cached URL if available, valid, and not forcing refresh
    if (track.download_url && isCacheValid && !forceRefresh) {
      // SECURITY: Validate cached URL format and domain before returning
      if (!isValidUrl(track.download_url, ['http:', 'https:']) || !isAllowedStreamDomain(track.download_url)) {
        // Invalid URL in cache - clear it and fetch fresh
        trackRepo.update(trackId, { downloadUrl: null });
        urlCacheTimestamps.delete(trackId);
      } else {
        res.json({
          trackId,
          url: track.download_url,
          cached: true,
          expiresIn: Math.max(0, URL_CACHE_TTL_MS - (Date.now() - cachedAt))
        });
        return;
      }
    }

    // Fetch direct URL from scraper
    if (!track.page_url) {
      throw createError('Track page URL not available', 404);
    }

    const urls = await scraper.getTrackDirectUrl(track.page_url);
    if (!urls?.mp3) {
      throw createError('Could not get stream URL', 404);
    }

    // SECURITY: Validate fetched URL format and domain before caching
    if (!isValidUrl(urls.mp3, ['http:', 'https:'])) {
      throw createError('Invalid stream URL received', 500);
    }

    if (!isAllowedStreamDomain(urls.mp3)) {
      throw createError('Stream URL from untrusted domain', 500);
    }

    // Cache the URL with timestamp
    trackRepo.update(trackId, { downloadUrl: urls.mp3 });
    urlCacheTimestamps.set(trackId, Date.now());

    res.json({
      trackId,
      url: urls.mp3,
      flacUrl: urls.flac,
      cached: false,
      expiresIn: URL_CACHE_TTL_MS
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tracks/:id/played - Requires authentication
router.post('/:id/played', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { played } = req.body;
    const trackId = validateId(id);

    const track = trackRepo.getById(trackId);
    if (!track) {
      throw createError('Track not found', 404);
    }

    const isPlayed = played !== undefined ? Boolean(played) : !track.is_played;
    trackRepo.setPlayed(trackId, isPlayed);

    res.json({
      trackId,
      isPlayed,
      message: isPlayed ? 'Marked as played' : 'Marked as unplayed'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
