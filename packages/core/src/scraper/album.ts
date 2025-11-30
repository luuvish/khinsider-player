/**
 * 앨범 관련 기능
 */

import * as cheerio from 'cheerio';
import type { AlbumInfo, ScrapedTrack, BulkDownloadUrls } from '@khinsider/shared';
import type { HttpContext, RecentAlbum } from './types.js';
import { makeRequest, buildUrl } from './http.js';
import { logger } from '../utils/index.js';

/**
 * 앨범 정보 조회
 */
export async function getAlbumInfo(
  ctx: HttpContext,
  albumUrl: string
): Promise<AlbumInfo> {
  try {
    const response = await makeRequest(ctx, albumUrl);
    const $ = cheerio.load(response.data);

    const info: {
      images: string[];
      metadata: Record<string, string>;
      metadataLines: { label: string; value: string }[];
    } = {
      images: [],
      metadata: {},
      metadataLines: []
    };

    // Get album images
    const imageSet = new Set<string>();

    $('a[href$=".jpg"], a[href$=".png"], a[href$=".gif"], a[href$=".jpeg"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        if (href.includes('vgmtreasurechest.com') || href.includes('/soundtracks/')) {
          try {
            const fullUrl = buildUrl(href, ctx.config.baseUrl, ctx.config.allowedDomains);
            if (fullUrl && !fullUrl.includes('/thumbs/')) {
              imageSet.add(fullUrl);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      }
    });

    info.images = Array.from(imageSet);

    // Get metadata
    info.metadataLines = [];

    const pageContent = $('#pageContent');

    // Platform(s)
    const platformLinks = pageContent.find('a[href*="/browse/"], a[href*="/pc-"], a[href*="/nintendo-"], a[href*="/playstation-"], a[href*="/xbox-"], a[href*="/sega-"]');
    const platforms: string[] = [];
    platformLinks.each((_, el) => {
      const text = $(el).text().trim();
      if (text && !platforms.includes(text)) {
        platforms.push(text);
      }
    });
    if (platforms.length > 0) {
      info.metadataLines.push({ label: 'Platforms', value: platforms.join(', ') });
    }

    const text = pageContent.text();

    // Year
    const yearMatch = text.match(/Year:\s*(\d{4})/i);
    if (yearMatch) {
      info.metadataLines.push({ label: 'Year', value: yearMatch[1] });
    }

    // Catalog Number
    const catalogMatch = text.match(/Catalog(?:\s*Number)?:\s*([^\n]+?)(?=\s*(?:Published|Developed|Number|Total|Date|Album|$))/i);
    if (catalogMatch) {
      info.metadataLines.push({ label: 'Catalog', value: catalogMatch[1].trim() });
    }

    // Developer
    const developerLink = pageContent.find('a[href*="/developer/"]').first();
    if (developerLink.length) {
      info.metadataLines.push({ label: 'Developer', value: developerLink.text().trim() });
    }

    // Publisher
    const publisherLink = pageContent.find('a[href*="/publisher/"]').first();
    if (publisherLink.length) {
      info.metadataLines.push({ label: 'Publisher', value: publisherLink.text().trim() });
    }

    // Number of Files
    const filesMatch = text.match(/Number of Files:\s*(\d+)/i);
    if (filesMatch) {
      info.metadataLines.push({ label: 'Files', value: filesMatch[1] });
    }

    // Total Filesize
    const sizeMatch = text.match(/Total Filesize:\s*([^\n]+?)(?=\s*Date|\s*Album|\s*$)/i);
    if (sizeMatch) {
      info.metadataLines.push({ label: 'Size', value: sizeMatch[1].trim() });
    }

    // Date Added
    const dateMatch = text.match(/Date Added:\s*([A-Za-z]+ \d+[a-z]*, \d{4})/i);
    if (dateMatch) {
      info.metadataLines.push({ label: 'Added', value: dateMatch[1] });
    }

    // Album Type
    const typeLink = pageContent.find('a[href*="/ost"], a[href*="/gamerip"]').first();
    if (typeLink.length) {
      info.metadataLines.push({ label: 'Type', value: typeLink.text().trim() });
    }

    return info;

  } catch (error) {
    logger.error('Scraper', 'Failed to get album info', error, { albumUrl });
    return { images: [], metadata: {} };
  }
}

/**
 * 앨범 트랙 목록 조회
 */
export async function getAlbumTracks(
  ctx: HttpContext,
  albumUrl: string
): Promise<ScrapedTrack[]> {
  try {
    const response = await makeRequest(ctx, albumUrl);
    const $ = cheerio.load(response.data);
    const tracks: ScrapedTrack[] = [];

    // Detect multi-disc album
    const headerRow = $('#songlist tr').first();
    const headers = headerRow.find('th');
    let hasDiscColumn = false;

    headers.each((_, th) => {
      const text = $(th).text().trim().toLowerCase();
      if (text === 'cd' || text === 'disc') {
        hasDiscColumn = true;
      }
    });

    const nameIdx = hasDiscColumn ? 3 : 2;
    const durationIdx = hasDiscColumn ? 4 : 3;
    const mp3Idx = hasDiscColumn ? 5 : 4;
    const flacIdx = hasDiscColumn ? 6 : 5;

    $('#songlist tr').each((_, element) => {
      const $row = $(element);
      const cells = $row.find('td');

      if (cells.length < 5) return;

      const trackNameCell = cells.eq(nameIdx);
      const durationCell = cells.eq(durationIdx);
      const mp3SizeCell = cells.eq(mp3Idx);
      const flacSizeCell = cells.eq(flacIdx);

      const trackLink = trackNameCell.find('a').first();
      const trackName = trackLink.text().trim() || trackNameCell.text().trim();
      const trackHref = trackLink.attr('href');

      const duration = durationCell.find('a').text().trim() || durationCell.text().trim();
      const mp3Size = mp3SizeCell.find('a').text().trim() || mp3SizeCell.text().trim();
      const flacSize = flacSizeCell.find('a').text().trim() || flacSizeCell.text().trim();

      if (trackName && trackHref) {
        tracks.push({
          name: trackName,
          duration: duration || 'Unknown',
          size: mp3Size || 'Unknown',
          mp3Size: mp3Size || 'Unknown',
          flacSize: flacSize || 'Unknown',
          pageUrl: ctx.config.baseUrl + trackHref
        });
      }
    });

    return tracks;

  } catch (error) {
    logger.error('Scraper', 'Failed to get album tracks', error, { albumUrl });
    return [];
  }
}

/**
 * 앨범 다운로드 ID 조회 (벌크 다운로드용)
 */
export async function getAlbumDownloadId(
  ctx: HttpContext,
  albumUrl: string
): Promise<string | null> {
  try {
    const response = await makeRequest(ctx, albumUrl);
    const $ = cheerio.load(response.data);

    const downloadLink = $('a[href*="/cp/add_album/"]').attr('href');
    if (downloadLink) {
      const match = downloadLink.match(/\/cp\/add_album\/(\d+)/);
      if (match) {
        return match[1];
      }
    }
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`getAlbumDownloadId error for ${albumUrl}:`, message);
    return null;
  }
}

/**
 * 벌크 다운로드 URL 조회
 */
export async function getBulkDownloadUrls(
  ctx: HttpContext,
  albumUrl: string
): Promise<BulkDownloadUrls> {
  try {
    const response = await makeRequest(ctx, albumUrl);
    const $ = cheerio.load(response.data);

    const urls: { mp3Url: string | null, flacUrl: string | null } = { mp3Url: null, flacUrl: null };

    // Look for direct .zip links
    $('a[href*=".zip"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();

      if (!href) return;

      try {
        const fullUrl = buildUrl(href, ctx.config.baseUrl, ctx.config.allowedDomains);
        if (text.includes('flac') || href.includes('flac')) {
          urls.flacUrl = fullUrl;
        } else if (text.includes('mp3') || href.includes('mp3')) {
          urls.mp3Url = fullUrl;
        }
      } catch {
        // Skip invalid URLs
      }
    });

    // If no direct ZIP links, try the /cp/add_album/ link
    if (!urls.mp3Url && !urls.flacUrl) {
      const addAlbumLink = $('a[href*="/cp/add_album/"]').attr('href');
      if (addAlbumLink) {
        try {
          const addAlbumUrl = buildUrl(addAlbumLink, ctx.config.baseUrl, ctx.config.allowedDomains);

          if (!addAlbumUrl) throw new Error('Invalid add_album URL');
          const downloadPageResponse = await makeRequest(ctx, addAlbumUrl);
          const $dl = cheerio.load(downloadPageResponse.data);

          $dl('a[href*=".zip"]').each((_, el) => {
            const href = $dl(el).attr('href');
            const text = $dl(el).text().toLowerCase();

            if (!href) return;

            try {
              const fullUrl = buildUrl(href, ctx.config.baseUrl, ctx.config.allowedDomains);
              if (text.includes('flac') || href.includes('flac')) {
                urls.flacUrl = fullUrl;
              } else if (text.includes('mp3') || href.includes('mp3')) {
                urls.mp3Url = fullUrl;
              } else if (!urls.mp3Url) {
                urls.mp3Url = fullUrl;
              }
            } catch {
              // Skip invalid URLs
            }
          });
        } catch {
          // Skip if add_album link is invalid
        }
      }
    }

    return urls;
  } catch {
    return { mp3Url: null, flacUrl: null };
  }
}

/**
 * 최근 앨범 목록 조회
 */
export async function getRecentAlbums(ctx: HttpContext): Promise<RecentAlbum[]> {
  try {
    const response = await makeRequest(ctx, ctx.config.baseUrl);
    const $ = cheerio.load(response.data);
    const albums: RecentAlbum[] = [];

    $('.latestalbums a[href*="/game-soundtracks/album/"], .albumList a[href*="/game-soundtracks/album/"]').each((_, element) => {
      const $link = $(element);
      const title = $link.text().trim();

      if (title && title.length > 0) {
        albums.push({
          title: title,
          url: ctx.config.baseUrl + $link.attr('href')
        });
      }
    });

    return albums.slice(0, 20);

  } catch {
    return [];
  }
}
