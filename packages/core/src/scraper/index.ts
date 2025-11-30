/**
 * Khinsider Scraper
 *
 * 모듈화된 scraper의 통합 인터페이스
 */

import type {
  LoginResult,
  SearchResult,
  AlbumInfo,
  ScrapedTrack,
  TrackUrls,
  BulkDownloadUrls,
  StreamResponse
} from '@khinsider/shared';
import type { HttpContext, AlbumListItem, RecentAlbum, ScraperConfig } from './types.js';
import { createHttpContext, makeStreamRequest, validateUrl, buildUrl } from './http.js';
import { login, checkLoginStatus, logout } from './auth.js';
import { searchAlbums } from './search.js';
import { getAlbumInfo, getAlbumTracks, getAlbumDownloadId, getBulkDownloadUrls, getRecentAlbums } from './album.js';
import { getYears, getAlbumsByYear } from './year.js';
import { getTrackDirectUrl } from './track.js';

/**
 * Khinsider Scraper 클래스
 *
 * 기존 API와 호환되면서 내부적으로 모듈화된 함수들을 사용
 */
class KhinsiderScraper {
  private ctx: HttpContext;

  constructor(config?: Partial<ScraperConfig>) {
    this.ctx = createHttpContext(config);
  }

  // Legacy property accessors for compatibility
  get baseUrl(): string {
    return this.ctx.config.baseUrl;
  }

  get forumUrl(): string {
    return this.ctx.config.forumUrl;
  }

  get isLoggedIn(): boolean {
    return this.ctx.state.isLoggedIn;
  }

  set isLoggedIn(value: boolean) {
    this.ctx.state.isLoggedIn = value;
  }

  // URL utilities
  validateUrl(url: string): string {
    return validateUrl(url, this.ctx.config.allowedDomains);
  }

  buildUrl(href: string | null | undefined): string | null {
    return buildUrl(href, this.ctx.config.baseUrl, this.ctx.config.allowedDomains);
  }

  // Authentication
  async login(username: string, password: string): Promise<LoginResult> {
    return login(this.ctx, username, password);
  }

  async checkLoginStatus(): Promise<boolean> {
    return checkLoginStatus(this.ctx);
  }

  async logout(): Promise<void> {
    logout(this.ctx);
  }

  // Search
  async searchAlbums(query: string): Promise<SearchResult[]> {
    return searchAlbums(this.ctx, query);
  }

  // Album
  async getAlbumInfo(albumUrl: string): Promise<AlbumInfo> {
    return getAlbumInfo(this.ctx, albumUrl);
  }

  async getAlbumTracks(albumUrl: string): Promise<ScrapedTrack[]> {
    return getAlbumTracks(this.ctx, albumUrl);
  }

  async getAlbumDownloadId(albumUrl: string): Promise<string | null> {
    return getAlbumDownloadId(this.ctx, albumUrl);
  }

  async getBulkDownloadUrls(albumUrl: string): Promise<BulkDownloadUrls> {
    return getBulkDownloadUrls(this.ctx, albumUrl);
  }

  async getRecentAlbums(): Promise<RecentAlbum[]> {
    return getRecentAlbums(this.ctx);
  }

  // Year
  async getYears(): Promise<string[]> {
    return getYears(this.ctx);
  }

  async getAlbumsByYear(year: string): Promise<AlbumListItem[]> {
    return getAlbumsByYear(this.ctx, year);
  }

  // Track
  async getTrackDirectUrl(trackPageUrl: string): Promise<TrackUrls> {
    return getTrackDirectUrl(this.ctx, trackPageUrl);
  }

  // Stream
  async makeStreamRequest(url: string, options?: { headers?: Record<string, string>; timeout?: number }): Promise<StreamResponse> {
    return makeStreamRequest(this.ctx, url, options);
  }
}

export default KhinsiderScraper;

// Re-export types for convenience
export type {
  HttpContext,
  AlbumListItem,
  RecentAlbum,
  ScraperConfig
} from './types.js';
