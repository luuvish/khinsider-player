/**
 * 연도별 앨범 조회 기능
 */

import * as cheerio from 'cheerio';
import type { HttpContext, AlbumListItem } from './types.js';
import { makeRequest } from './http.js';
import { PAGINATION } from './config.js';
import { logger } from '../utils/index.js';

/**
 * 연도 목록 조회
 */
export async function getYears(ctx: HttpContext): Promise<string[]> {
  try {
    const response = await makeRequest(ctx, `${ctx.config.baseUrl}/album-years`);
    const $ = cheerio.load(response.data);
    const years: string[] = [];

    $('a[href*="/game-soundtracks/year/"]').each((_, element) => {
      const $link = $(element);
      const href = $link.attr('href');

      if (!href) return;
      const yearMatch = href.match(/\/year\/(\d{4})\/?$/);
      if (yearMatch) {
        const year = yearMatch[1];
        if (!years.includes(year)) {
          years.push(year);
        }
      }
    });

    // Sort years descending, but keep 0000 at the end
    years.sort((a, b) => {
      if (a === '0000') return 1;
      if (b === '0000') return -1;
      return b.localeCompare(a);
    });

    return years;

  } catch (error) {
    logger.error('Scraper', 'Failed to get years', error);
    return [];
  }
}

/**
 * 연도별 앨범 목록 조회
 */
export async function getAlbumsByYear(
  ctx: HttpContext,
  year: string
): Promise<AlbumListItem[]> {
  try {
    const albums: AlbumListItem[] = [];
    let page = 1;
    let emptyPageCount = 0;

    while (page <= PAGINATION.MAX_PAGES) {
      const url = page === 1
        ? `${ctx.config.baseUrl}/game-soundtracks/year/${year}/`
        : `${ctx.config.baseUrl}/game-soundtracks/year/${year}?page=${page}`;

      const response = await makeRequest(ctx, url);
      const $ = cheerio.load(response.data);
      const pageAlbums: AlbumListItem[] = [];

      $('table.albumList tr').each((_, element) => {
        const $row = $(element);
        const cells = $row.find('td');

        if (cells.length === 0) return;

        const albumLinks = $row.find('a[href*="/game-soundtracks/album/"]');

        let bestLinkHref: string | undefined = undefined;
        let bestTitle = '';

        albumLinks.each((_, link) => {
          const $link = $(link);
          const text = $link.text().trim();
          const href = $link.attr('href');

          if (text && text.length > bestTitle.length && href) {
            bestLinkHref = href;
            bestTitle = text;
          }
        });

        if (bestLinkHref && bestTitle) {
          const platform = cells.length >= 2 ? cells.eq(1).text().trim() : '';

          pageAlbums.push({
            title: bestTitle,
            url: ctx.config.baseUrl + bestLinkHref,
            platform: platform || 'Unknown',
            year: year
          });
        }
      });

      // Track empty pages
      if (pageAlbums.length === 0) {
        emptyPageCount++;
        if (emptyPageCount >= PAGINATION.MAX_EMPTY_PAGES) {
          break;
        }
      } else {
        emptyPageCount = 0;
        albums.push(...pageAlbums);
      }

      // Check for next page link
      const hasNextPage =
        $(`a[href*="year/${year}?page=${page + 1}"]`).length > 0 ||
        $(`a[href*="year/${year}/?page=${page + 1}"]`).length > 0 ||
        $(`.pagination a:contains("${page + 1}")`).length > 0 ||
        $(`.pagination a:contains("Next")`).length > 0 ||
        $(`.pagination a:contains(">")`).length > 0;

      if (!hasNextPage) {
        break;
      }

      page++;
    }

    if (page > PAGINATION.MAX_PAGES) {
      console.warn(`[Scraper] Reached max page limit (${PAGINATION.MAX_PAGES}) for year ${year}`);
    }

    // Sort albums alphabetically
    albums.sort((a, b) => a.title.localeCompare(b.title));

    return albums;

  } catch (error) {
    console.error(`[Scraper] Error fetching albums for year ${year}:`, error instanceof Error ? error.message : error);
    return [];
  }
}
