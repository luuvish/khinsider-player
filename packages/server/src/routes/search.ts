import { Router, Request, Response } from 'express';
import { KhinsiderScraper, albumRepo } from '@khinsider/core';
import { sanitizeInput } from '@khinsider/shared';
import { createError } from '../middleware/errorHandler.js';

const router = Router();
const scraper = new KhinsiderScraper();

// Maximum query length to prevent abuse
const MAX_QUERY_LENGTH = 200;
// SECURITY: Maximum search results to prevent DoS via large response payloads
const MAX_SEARCH_RESULTS = 100;

// GET /api/search?q=query
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      throw createError('Search query is required', 400);
    }

    // Sanitize and validate input
    const query = sanitizeInput(q, MAX_QUERY_LENGTH);

    if (query.length < 2) {
      throw createError('Search query must be at least 2 characters', 400);
    }

    // Search in scraper
    const results = await scraper.searchAlbums(query);

    // SECURITY: Limit results to prevent large response payloads
    const limitedResults = results.slice(0, MAX_SEARCH_RESULTS);

    // Save results to database and get IDs for routing
    const resultsWithIds = limitedResults.map(result => {
      const album = albumRepo.upsert({
        title: result.title,
        url: result.url,
        year: result.year,
        platform: result.platform
      });
      return {
        id: album?.id || null,
        title: result.title,
        url: result.url,
        year: result.year,
        platform: result.platform
      };
    }).filter(r => r.id !== null);

    res.json({
      query,
      results: resultsWithIds,
      totalFound: results.length,
      limited: results.length > MAX_SEARCH_RESULTS
    });
  } catch (error) {
    next(error);
  }
});

export default router;
