/**
 * 트랙 관련 기능
 */

import * as cheerio from 'cheerio';
import type { TrackUrls } from '@khinsider/shared';
import type { HttpContext } from './types.js';
import { makeRequest, buildUrl } from './http.js';
import { logger } from '../utils/index.js';

/**
 * 트랙 직접 다운로드 URL 조회
 */
export async function getTrackDirectUrl(
  ctx: HttpContext,
  trackPageUrl: string
): Promise<TrackUrls> {
  try {
    const response = await makeRequest(ctx, trackPageUrl);
    const $ = cheerio.load(response.data);

    let mp3Url: string | null = null;
    let flacUrl: string | null = null;

    // Method 1: Look for audio source tags
    const audioSource = $('audio source').attr('src');
    if (audioSource) {
      try {
        mp3Url = buildUrl(audioSource, ctx.config.baseUrl, ctx.config.allowedDomains);
      } catch {
        // Skip invalid URL
      }
    }

    // Method 2: Look for download links
    if (!mp3Url) {
      const downloadLinks = $('a[href*=".mp3"]');
      if (downloadLinks.length > 0) {
        const href = downloadLinks.first().attr('href');
        try {
          mp3Url = buildUrl(href, ctx.config.baseUrl, ctx.config.allowedDomains);
        } catch {
          // Skip invalid URL
        }
      }
    }

    // Look for FLAC
    const flacLinks = $('a[href*=".flac"]');
    if (flacLinks.length > 0) {
      const href = flacLinks.first().attr('href');
      try {
        flacUrl = buildUrl(href, ctx.config.baseUrl, ctx.config.allowedDomains);
      } catch {
        // Skip invalid URL
      }
    }

    return {
      mp3: mp3Url,
      flac: flacUrl
    };

  } catch (error) {
    logger.error('Scraper', 'Failed to get track direct URL', error, { trackPageUrl });
    return { mp3: null, flac: null };
  }
}
