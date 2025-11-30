import { Router, Request, Response } from 'express';
import { albumRepo, trackRepo, userFavoritesRepo, KhinsiderScraper } from '@khinsider/core';
import { optionalAuth, authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';

const router = Router();
const scraper = new KhinsiderScraper();

// Validation helpers
function validateYear(year: string): boolean {
  // Allow 4-digit years (e.g., 2024) or special values like "0000" for unknown
  return /^\d{4}$/.test(year);
}

function validateId(id: string): number {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > Number.MAX_SAFE_INTEGER) {
    throw createError('Invalid ID format', 400);
  }
  return parsed;
}

// GET /api/albums/years
// SECURITY: Require authentication to prevent abuse of scraper endpoints
router.get('/years', authenticateToken, async (_req: AuthenticatedRequest, res: Response, next) => {
  try {
    // Try to get years from scraper
    const webYears = await scraper.getYears();

    // Get album counts from database
    const dbYears = albumRepo.getYears() || [];
    const dbYearMap = new Map(dbYears.map((y: { year: string; album_count: number }) => [y.year, y.album_count]));

    const years = webYears.map(year => ({
      year,
      albumCount: dbYearMap.get(year) || 0
    }));

    res.json({ years });
  } catch (error) {
    next(error);
  }
});

// GET /api/albums/year/:year
// SECURITY: Require authentication to prevent abuse of scraper endpoints
router.get('/year/:year', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { year } = req.params;
    const { refresh } = req.query;

    // Validate year format
    if (!validateYear(year)) {
      throw createError('Invalid year format. Expected 4-digit year (e.g., 2024)', 400);
    }

    // Check database first
    let albums = albumRepo.getByYear(year);

    // If no albums or refresh requested, fetch from web
    if (albums.length === 0 || refresh === 'true') {
      const webAlbums = await scraper.getAlbumsByYear(year);

      for (const album of webAlbums) {
        albumRepo.upsert({
          title: album.title,
          url: album.url,
          year: year,
          platform: album.platform
        });
      }

      albums = albumRepo.getByYear(year);
    }

    res.json({
      year,
      albums: albums.map(album => ({
        id: album.id,
        title: album.title,
        url: album.url,
        year: album.year,
        platform: album.platform,
        trackCount: album.track_count,
        isFavorite: Boolean(album.is_favorite),
        isDownloaded: Boolean(album.is_downloaded),
        slug: album.slug
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/albums/:id
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const albumId = validateId(id);

    const album = albumRepo.getById(albumId);
    if (!album) {
      throw createError('Album not found', 404);
    }

    // Get album info from scraper for metadata
    let albumInfo = null;
    try {
      albumInfo = await scraper.getAlbumInfo(album.url);
    } catch {
      // Ignore scraper errors, return basic album info
    }

    res.json({
      album: {
        id: album.id,
        title: album.title,
        url: album.url,
        year: album.year,
        platform: album.platform,
        trackCount: album.track_count,
        isFavorite: Boolean(album.is_favorite),
        isDownloaded: Boolean(album.is_downloaded),
        slug: album.slug
      },
      info: albumInfo
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/albums/:id/tracks - Requires authentication to prevent resource exhaustion
router.get('/:id/tracks', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { refresh } = req.query;
    const albumId = validateId(id);

    const album = albumRepo.getById(albumId);
    if (!album) {
      throw createError('Album not found', 404);
    }

    // Check database first
    let tracks = trackRepo.getByAlbumId(albumId);

    // If no tracks or refresh requested, fetch from web
    if (tracks.length === 0 || refresh === 'true') {
      const webTracks = await scraper.getAlbumTracks(album.url);

      if (webTracks.length > 0) {
        // Delete existing tracks if refreshing
        if (refresh === 'true') {
          trackRepo.deleteByAlbumId(albumId);
        }

        const tracksToInsert = webTracks.map((t, i) => ({
          albumId: albumId,
          trackNumber: i + 1,
          name: t.name,
          duration: t.duration,
          pageUrl: t.pageUrl,
          fileSize: t.mp3Size
        }));

        trackRepo.createMany(tracksToInsert);
        tracks = trackRepo.getByAlbumId(albumId);

        // Update album track count
        albumRepo.update(albumId, { trackCount: tracks.length });
      }
    }

    res.json({
      albumId,
      tracks: tracks.map(track => ({
        id: track.id,
        trackNumber: track.track_number,
        name: track.name,
        duration: track.duration,
        pageUrl: track.page_url,
        fileSize: track.file_size,
        isPlayed: Boolean(track.is_played),
        isDownloaded: Boolean(track.is_downloaded)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/albums/:id/favorite - Requires authentication
// SECURITY: Uses per-user favorites instead of global favorites
router.post('/:id/favorite', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const albumId = validateId(id);

    if (typeof req.user?.userId !== 'number' || req.user.userId <= 0) {
      throw createError('User authentication incomplete', 401);
    }
    const userId = req.user.userId;

    const album = albumRepo.getById(albumId);
    if (!album) {
      throw createError('Album not found', 404);
    }

    // SECURITY: Use per-user favorites instead of global
    const isFavorite = userFavoritesRepo.toggleFavorite(userId, albumId);

    res.json({
      albumId,
      isFavorite,
      message: isFavorite ? 'Added to favorites' : 'Removed from favorites'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/albums/favorites
// SECURITY: Require authentication and return per-user favorites
router.get('/favorites/list', authenticateToken, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (typeof req.user?.userId !== 'number' || req.user.userId <= 0) {
      throw createError('User authentication incomplete', 401);
    }
    const userId = req.user.userId;
    // SECURITY: Get per-user favorites instead of global
    const favorites = userFavoritesRepo.getFavorites(userId);

    res.json({
      albums: favorites.map(album => ({
        id: album.id,
        title: album.title,
        url: album.url,
        year: album.year,
        platform: album.platform,
        trackCount: album.track_count,
        isFavorite: true,
        isDownloaded: Boolean(album.is_downloaded),
        slug: album.slug
      }))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
