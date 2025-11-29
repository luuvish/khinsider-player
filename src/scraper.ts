import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import type {
  LoginResult,
  SearchResult,
  AlbumInfo,
  ScrapedTrack,
  TrackUrls,
  BulkDownloadUrls,
  StreamResponse
} from './types/index.js';

// Rate limiting configuration
const RATE_LIMIT_DELAY = 500; // 500ms between requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds between retries

// Allowed domains for URL validation
const ALLOWED_DOMAINS = [
  'downloads.khinsider.com',
  'khinsider.com',
  'vgmtreasurechest.com'
];

interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  params?: Record<string, string>;
}

interface AxiosError {
  response?: {
    status: number;
  };
}

class KhinsiderScraper {
  baseUrl: string;
  forumUrl: string;
  userAgent: string;
  cookieJar: CookieJar;
  client: ReturnType<typeof wrapper>;
  isLoggedIn: boolean;
  lastRequestTime: number;
  _requestLock: Promise<void> | null;

  constructor() {
    this.baseUrl = 'https://downloads.khinsider.com';
    this.forumUrl = 'https://downloads.khinsider.com/forums';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Cookie jar for session management
    this.cookieJar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.cookieJar,
      withCredentials: true
    }));

    this.isLoggedIn = false;

    // Rate limiting
    this.lastRequestTime = 0;
    this._requestLock = null;
  }

  // Rate limiting helper using mutex pattern (avoids infinite promise chain)
  async rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for any pending request to complete
    while (this._requestLock) {
      await this._requestLock;
    }

    // Create a new lock with guaranteed releaseLock assignment
    let releaseLock: (() => void) | null = null;
    this._requestLock = new Promise<void>(resolve => { releaseLock = resolve; });

    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        await this.delay(RATE_LIMIT_DELAY - timeSinceLastRequest);
      }

      this.lastRequestTime = Date.now();
      return await fn();
    } finally {
      // Release lock before nullifying to prevent race condition
      // Check releaseLock exists to handle edge cases
      if (releaseLock) {
        releaseLock();
      }
      this._requestLock = null;
    }
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Validate URL domain against whitelist
  validateUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const isAllowed = ALLOWED_DOMAINS.some(domain =>
        parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
      );
      if (!isAllowed) {
        throw new Error(`URL domain not allowed: ${parsed.hostname}`);
      }
      return url;
    } catch (error: unknown) {
      // Safely check error message
      if (error instanceof Error && error.message.includes('not allowed')) {
        throw error;
      }
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  // Build and validate full URL from href
  buildUrl(href: string | null | undefined): string | null {
    if (!href || typeof href !== 'string') return null;
    const fullUrl = href.startsWith('http') ? href : this.baseUrl + href;
    return this.validateUrl(fullUrl);
  }

  // Validate HTTP response status
  validateResponse<T>(response: AxiosResponse<T>, url: string): AxiosResponse<T> {
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} error for ${url}`);
    }

    // Check for common error patterns in HTML
    if (typeof response.data === 'string') {
      if (response.data.includes('Access Denied') || response.data.includes('403 Forbidden')) {
        throw new Error('Access denied - you may be rate limited');
      }
      if (response.data.includes('404 Not Found') || response.data.includes('Page not found')) {
        throw new Error('Page not found');
      }
    }

    return response;
  }

  async makeRequest(url: string, options: RequestOptions = {}): Promise<AxiosResponse<string>> {
    const defaultHeaders = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Referer': this.baseUrl
    };

    return this.rateLimitedRequest(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await this.client.get<string>(url, {
            headers: { ...defaultHeaders, ...options.headers },
            timeout: 30000,
            validateStatus: () => true, // Don't throw on HTTP errors
            ...options
          });

          return this.validateResponse(response, url);
        } catch (error: unknown) {
          lastError = error;

          // Don't retry on client errors (4xx except 429)
          const axiosErr = error as AxiosError;
          if (axiosErr.response?.status && axiosErr.response.status >= 400 && axiosErr.response.status < 500 && axiosErr.response.status !== 429) {
            throw error;
          }

          // Wait before retry (with exponential backoff)
          if (attempt < MAX_RETRIES - 1) {
            await this.delay(RETRY_DELAY * (attempt + 1));
          }
        }
      }

      throw lastError || new Error('Request failed after all retries');
    });
  }

  async makePost(url: string, data: string, options: RequestOptions = {}): Promise<AxiosResponse<string>> {
    const defaultHeaders = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': this.forumUrl + '/index.php?login/'
    };

    return this.rateLimitedRequest(async () => {
      const response = await this.client.post<string>(url, data, {
        headers: { ...defaultHeaders, ...options.headers },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
        ...options
      });

      return this.validateResponse(response, url);
    });
  }

  // Rate-limited streaming request for file downloads
  async makeStreamRequest(url: string, options: RequestOptions = {}): Promise<StreamResponse> {
    const defaultHeaders = {
      'User-Agent': this.userAgent,
      'Accept': '*/*',
      'Referer': this.baseUrl
    };

    return this.rateLimitedRequest(async () => {
      const response = await this.client({
        method: 'GET',
        url: url,
        responseType: 'stream',
        headers: { ...defaultHeaders, ...options.headers },
        timeout: options.timeout || 60000,
        ...options
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status} error for ${url}`);
      }

      return {
        data: response.data,
        headers: response.headers as Record<string, string>,
        status: response.status
      };
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      // Step 1: Get login page to get CSRF token
      const loginPageUrl = `${this.forumUrl}/index.php?login/`;
      const loginPage = await this.makeRequest(loginPageUrl);
      const $ = cheerio.load(loginPage.data);

      // Extract CSRF token
      const csrfToken = $('input[name="_xfToken"]').val();
      if (!csrfToken) {
        throw new Error('Could not find CSRF token');
      }

      // Step 2: Submit login form
      const loginData = new URLSearchParams({
        login: username,
        password: password,
        remember: '1',
        _xfToken: String(csrfToken),
        _xfRedirect: this.baseUrl
      });

      const response = await this.makePost(
        `${this.forumUrl}/index.php?login/login`,
        loginData.toString()
      );

      // Check if login was successful by looking for error messages or user elements
      const $response = cheerio.load(response.data);
      const hasError = $response('.blockMessage--error').length > 0;
      const isLoggedIn = $response('a[href*="logout"]').length > 0 ||
                         response.data.includes('data-logged-in="true"');

      if (hasError) {
        const errorMsg = $response('.blockMessage--error').text().trim();
        throw new Error(errorMsg || 'Login failed');
      }

      this.isLoggedIn = isLoggedIn;
      return { success: isLoggedIn };

    } catch (error: unknown) {
      this.isLoggedIn = false;
      throw error;
    }
  }

  async checkLoginStatus(): Promise<boolean> {
    try {
      const response = await this.makeRequest(`${this.forumUrl}/`);
      const isLoggedIn = response.data.includes('data-logged-in="true"');
      this.isLoggedIn = isLoggedIn;
      return isLoggedIn;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    this.cookieJar = new CookieJar();
    this.client = wrapper(axios.create({
      jar: this.cookieJar,
      withCredentials: true
    }));
    this.isLoggedIn = false;
  }

  // Get album download ID from album page (for bulk download)
  async getAlbumDownloadId(albumUrl: string): Promise<string | null> {
    try {
      const response = await this.makeRequest(albumUrl);
      const $ = cheerio.load(response.data);

      // Look for the bulk download link: /cp/add_album/{id}
      const downloadLink = $('a[href*="/cp/add_album/"]').attr('href');
      if (downloadLink) {
        const match = downloadLink.match(/\/cp\/add_album\/(\d+)/);
        if (match) {
          return match[1];
        }
      }
      // No bulk download link found (normal for some albums)
      return null;
    } catch (error: unknown) {
      // Log network/parsing errors for debugging
      const message = error instanceof Error ? error.message : String(error);
      console.error(`getAlbumDownloadId error for ${albumUrl}:`, message);
      return null;
    }
  }

  // Get bulk download URLs for MP3 and FLAC (from album page)
  async getBulkDownloadUrls(albumUrl: string): Promise<BulkDownloadUrls> {
    try {
      const response = await this.makeRequest(albumUrl);
      const $ = cheerio.load(response.data);

      const urls = { mp3Url: null, flacUrl: null };

      // First, look for direct .zip links on the page
      $('a[href*=".zip"]').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().toLowerCase();

        if (!href) return;

        try {
          const fullUrl = this.buildUrl(href);
          if (text.includes('flac') || href.includes('flac')) {
            urls.flacUrl = fullUrl;
          } else if (text.includes('mp3') || href.includes('mp3')) {
            urls.mp3Url = fullUrl;
          }
        } catch {
          // Skip invalid URLs
        }
      });

      // If no direct ZIP links, try the /cp/add_album/ link (requires login)
      if (!urls.mp3Url && !urls.flacUrl) {
        const addAlbumLink = $('a[href*="/cp/add_album/"]').attr('href');
        if (addAlbumLink) {
          try {
            const addAlbumUrl = this.buildUrl(addAlbumLink);

            // Follow the add_album link to get to download page
            const downloadPageResponse = await this.makeRequest(addAlbumUrl);
            const $dl = cheerio.load(downloadPageResponse.data);

            // Look for ZIP links on the download page
            $dl('a[href*=".zip"]').each((_, el) => {
              const href = $dl(el).attr('href');
              const text = $dl(el).text().toLowerCase();

              if (!href) return;

              try {
                const fullUrl = this.buildUrl(href);
                if (text.includes('flac') || href.includes('flac')) {
                  urls.flacUrl = fullUrl;
                } else if (text.includes('mp3') || href.includes('mp3')) {
                  urls.mp3Url = fullUrl;
                } else if (!urls.mp3Url) {
                  // Fallback: use first zip link as mp3
                  urls.mp3Url = fullUrl;
                }
              } catch {
                // Skip invalid URLs
              }
            });
          } catch {
            // Skip if add_album link is invalid or request fails
          }
        }
      }

      return urls;
    } catch {
      return { mp3Url: null, flacUrl: null };
    }
  }

  async searchAlbums(query: string): Promise<SearchResult[]> {
    // Validate search query
    if (!query || typeof query !== 'string') {
      return [];
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }

    // Limit query length to prevent abuse (max 200 chars)
    const MAX_QUERY_LENGTH = 200;
    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
      throw new Error(`Search query too long (max ${MAX_QUERY_LENGTH} characters)`);
    }

    try {
      const response = await this.makeRequest(`${this.baseUrl}/search`, {
        params: { search: trimmedQuery }
      });

      const $ = cheerio.load(response.data);
      const albums: SearchResult[] = [];

      // Target the specific albumList table structure
      $('table.albumList tbody tr').each((index, element) => {
        const $row = $(element);
        const cells = $row.find('td');

        // Skip header rows or rows without enough cells
        if (cells.length < 4) return;

        // Find album links - there are usually multiple links per row
        // We want the one with meaningful text content
        const albumLinks = $row.find('a[href*="/game-soundtracks/album/"]');

        let bestLink: cheerio.Cheerio<Element> | null = null;
        let bestTitle = '';

        // Find the link with the most descriptive text (longest non-empty text)
        albumLinks.each((i, link) => {
          const $link = $(link);
          const text = $link.text().trim();

          if (text && text.length > bestTitle.length) {
            bestLink = $link;
            bestTitle = text;
          }
        });

        if (bestLink && bestTitle) {
          // Extract platform, type, and year from the remaining cells
          const platform = cells.eq(1).text().trim() || 'Unknown';
          const type = cells.eq(2).text().trim() || 'Soundtrack';
          const year = cells.eq(3).text().trim() || 'Unknown';

          albums.push({
            title: bestTitle,
            url: this.baseUrl + bestLink.attr('href'),
            platform: platform,
            type: type,
            year: year
          });
        }
      });

      return albums;

    } catch (error: unknown) {
      // Log error for debugging before returning empty results
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Search error for query "${trimmedQuery}":`, message);
      return [];
    }
  }

  async getAlbumInfo(albumUrl: string): Promise<AlbumInfo> {
    try {
      const response = await this.makeRequest(albumUrl);
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

      // Get album images from various sources
      const imageSet = new Set<string>();

      // Album art links - look for links to actual album images (vgmtreasurechest domain)
      $('a[href$=".jpg"], a[href$=".png"], a[href$=".gif"], a[href$=".jpeg"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          // Only include album art from vgmtreasurechest (actual album images)
          if (href.includes('vgmtreasurechest.com') || href.includes('/soundtracks/')) {
            try {
              const fullUrl = this.buildUrl(href);
              // Exclude thumbs
              if (!fullUrl.includes('/thumbs/')) {
                imageSet.add(fullUrl);
              }
            } catch {
              // Skip invalid URLs
            }
          }
        }
      });

      info.images = Array.from(imageSet);

      // Get metadata - preserve original format as array of {label, value}
      info.metadataLines = [];

      // Find the info section (between title and images/songlist)
      const pageContent = $('#pageContent');

      // Platform(s)
      const platformLinks = pageContent.find('a[href*="/browse/"], a[href*="/pc-"], a[href*="/nintendo-"], a[href*="/playstation-"], a[href*="/xbox-"], a[href*="/sega-"]');
      const platforms = [];
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

    } catch {
      return { images: [], metadata: {} };
    }
  }

  async getAlbumTracks(albumUrl: string): Promise<ScrapedTrack[]> {
    try {
      const response = await this.makeRequest(albumUrl);
      const $ = cheerio.load(response.data);
      const tracks: ScrapedTrack[] = [];

      // Detect if this is a multi-disc album by checking header row
      const headerRow = $('#songlist tr').first();
      const headers = headerRow.find('th');
      let hasDiscColumn = false;

      headers.each((_, th) => {
        const text = $(th).text().trim().toLowerCase();
        if (text === 'cd' || text === 'disc') {
          hasDiscColumn = true;
        }
      });

      // Column indices based on structure
      // Single disc: [play] [#] [name] [duration] [mp3] [flac] [download] [playlist]
      // Multi disc:  [play] [cd] [#] [name] [duration] [mp3] [flac] [download] [playlist]
      const nameIdx = hasDiscColumn ? 3 : 2;
      const durationIdx = hasDiscColumn ? 4 : 3;
      const mp3Idx = hasDiscColumn ? 5 : 4;
      const flacIdx = hasDiscColumn ? 6 : 5;

      // Target the songlist table - process all rows except header
      $('#songlist tr').each((index, element) => {
        const $row = $(element);
        const cells = $row.find('td');

        // Skip header row (has th elements) or rows without enough cells
        if (cells.length < 5) return;

        const trackNameCell = cells.eq(nameIdx);
        const durationCell = cells.eq(durationIdx);
        const mp3SizeCell = cells.eq(mp3Idx);
        const flacSizeCell = cells.eq(flacIdx);

        // Get track name - it's in a link
        const trackLink = trackNameCell.find('a').first();
        const trackName = trackLink.text().trim() || trackNameCell.text().trim();
        const trackHref = trackLink.attr('href');

        // Get duration
        const duration = durationCell.find('a').text().trim() || durationCell.text().trim();

        // Get file sizes
        const mp3Size = mp3SizeCell.find('a').text().trim() || mp3SizeCell.text().trim();
        const flacSize = flacSizeCell.find('a').text().trim() || flacSizeCell.text().trim();

        if (trackName && trackHref) {
          tracks.push({
            name: trackName,
            duration: duration || 'Unknown',
            size: mp3Size || 'Unknown',
            mp3Size: mp3Size || 'Unknown',
            flacSize: flacSize || 'Unknown',
            // The href is the track page URL
            pageUrl: this.baseUrl + trackHref
          });
        }
      });

      return tracks;

    } catch {
      return [];
    }
  }

  async getTrackDirectUrl(trackPageUrl: string): Promise<TrackUrls> {
    try {
      const response = await this.makeRequest(trackPageUrl);
      const $ = cheerio.load(response.data);

      // Look for various types of download links
      let mp3Url: string | null = null;
      let flacUrl: string | null = null;

      // Method 1: Look for audio source tags
      const audioSource = $('audio source').attr('src');
      if (audioSource) {
        try {
          mp3Url = this.buildUrl(audioSource);
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
            mp3Url = this.buildUrl(href);
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
          flacUrl = this.buildUrl(href);
        } catch {
          // Skip invalid URL
        }
      }

      return {
        mp3: mp3Url,
        flac: flacUrl
      };

    } catch {
      return { mp3: null, flac: null };
    }
  }

  async getYears(): Promise<string[]> {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/album-years`);
      const $ = cheerio.load(response.data);
      const years: string[] = [];

      // Find year links on the page
      $('a[href*="/game-soundtracks/year/"]').each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');

        // Extract year from href
        const yearMatch = href.match(/\/year\/(\d{4})\/?$/);
        if (yearMatch) {
          const year = yearMatch[1];
          if (!years.includes(year)) {
            years.push(year);
          }
        }
      });

      // Sort years descending (newest first), but keep 0000 at the end
      years.sort((a, b) => {
        if (a === '0000') return 1;
        if (b === '0000') return -1;
        return b.localeCompare(a);
      });

      return years;

    } catch {
      return [];
    }
  }

  async getAlbumsByYear(year: string): Promise<Array<{ title: string; url: string; platform: string; year: string }>> {
    try {
      const albums: Array<{ title: string; url: string; platform: string; year: string }> = [];
      let page = 1;

      while (true) {
        const url = page === 1
          ? `${this.baseUrl}/game-soundtracks/year/${year}/`
          : `${this.baseUrl}/game-soundtracks/year/${year}?page=${page}`;

        const response = await this.makeRequest(url);
        const $ = cheerio.load(response.data);
        const pageAlbums: Array<{ title: string; url: string; platform: string; year: string }> = [];

        // Try both tbody tr and direct tr (different page structures)
        $('table.albumList tr').each((index, element) => {
          const $row = $(element);
          const cells = $row.find('td');

          // Skip header rows
          if (cells.length === 0) return;

          const albumLinks = $row.find('a[href*="/game-soundtracks/album/"]');

          let bestLink: cheerio.Cheerio<Element> | null = null;
          let bestTitle = '';

          albumLinks.each((i, link) => {
            const $link = $(link);
            const text = $link.text().trim();

            // Skip image-only links (no text)
            if (text && text.length > bestTitle.length) {
              bestLink = $link;
              bestTitle = text;
            }
          });

          if (bestLink && bestTitle) {
            // Platform may be in second cell, or not present
            const platform = cells.length >= 2 ? cells.eq(1).text().trim() : '';

            pageAlbums.push({
              title: bestTitle,
              url: this.baseUrl + bestLink.attr('href'),
              platform: platform || 'Unknown',
              year: year
            });
          }
        });

        // No albums on this page - stop
        if (pageAlbums.length === 0) {
          break;
        }

        albums.push(...pageAlbums);

        // Check for next page link (various formats)
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

      // Sort albums alphabetically by title
      albums.sort((a, b) => a.title.localeCompare(b.title));

      return albums;

    } catch {
      return [];
    }
  }

  async getRecentAlbums(): Promise<Array<{ title: string; url: string }>> {
    try {
      const response = await this.makeRequest(this.baseUrl);
      const $ = cheerio.load(response.data);
      const albums: Array<{ title: string; url: string }> = [];
      
      // Look for recent albums on homepage
      $('.latestalbums a[href*="/game-soundtracks/album/"], .albumList a[href*="/game-soundtracks/album/"]').each((_, element) => {
        const $link = $(element);
        const title = $link.text().trim();
        
        if (title && title.length > 0) {
          albums.push({
            title: title,
            url: this.baseUrl + $link.attr('href')
          });
        }
      });

      return albums.slice(0, 20);

    } catch {
      return [];
    }
  }
}

export default KhinsiderScraper;