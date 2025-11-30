/**
 * 검색 기능
 */

import * as cheerio from 'cheerio';
import type { SearchResult } from '@khinsider/shared';
import type { HttpContext } from './types.js';
import { makeRequest } from './http.js';
import { SEARCH_LIMITS } from './config.js';

/**
 * 앨범 검색
 */
export async function searchAlbums(
  ctx: HttpContext,
  query: string
): Promise<SearchResult[]> {
  // Validate search query
  if (!query || typeof query !== 'string') {
    return [];
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return [];
  }

  // Limit query length to prevent abuse
  if (trimmedQuery.length > SEARCH_LIMITS.MAX_QUERY_LENGTH) {
    throw new Error(`Search query too long (max ${SEARCH_LIMITS.MAX_QUERY_LENGTH} characters)`);
  }

  // Remove control characters
  // eslint-disable-next-line no-control-regex
  const sanitizedQuery = trimmedQuery.replace(/[\x00-\x1F\x7F]/g, '');
  if (sanitizedQuery.length === 0) {
    return [];
  }

  try {
    const response = await makeRequest(ctx, `${ctx.config.baseUrl}/search`, {
      params: { search: sanitizedQuery }
    });

    const $ = cheerio.load(response.data);
    const albums: SearchResult[] = [];

    $('table.albumList tbody tr').each((_, element) => {
      const $row = $(element);
      const cells = $row.find('td');

      if (cells.length < 4) return;

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
        const platform = cells.eq(1).text().trim() || 'Unknown';
        const type = cells.eq(2).text().trim() || 'Soundtrack';
        const year = cells.eq(3).text().trim() || 'Unknown';

        albums.push({
          title: bestTitle,
          url: ctx.config.baseUrl + bestLinkHref,
          platform: platform,
          type: type,
          year: year
        });
      }
    });

    return albums;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Search error for query "${trimmedQuery}":`, message);
    return [];
  }
}
