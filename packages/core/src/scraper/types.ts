/**
 * Scraper 내부 타입 정의
 */

import type { AxiosInstance } from 'axios';
import type { CookieJar } from 'tough-cookie';

/**
 * HTTP 요청 옵션
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  params?: Record<string, string>;
}

/**
 * Axios 에러 타입 (간소화)
 */
export interface AxiosErrorLike {
  response?: {
    status: number;
  };
}

/**
 * Scraper 설정
 */
export interface ScraperConfig {
  baseUrl: string;
  forumUrl: string;
  userAgent: string;
  rateLimitDelay: number;
  maxRetries: number;
  retryDelay: number;
  allowedDomains: string[];
}

/**
 * Scraper 상태
 */
export interface ScraperState {
  isLoggedIn: boolean;
  lastRequestTime: number;
  requestLock: Promise<void> | null;
}

/**
 * HTTP 클라이언트 컨텍스트
 */
export interface HttpContext {
  config: ScraperConfig;
  state: ScraperState;
  cookieJar: CookieJar;
  client: AxiosInstance;
}

/**
 * 앨범 기본 정보 (목록용)
 */
export interface AlbumListItem {
  title: string;
  url: string;
  platform: string;
  year: string;
}

/**
 * 최근 앨범 정보
 */
export interface RecentAlbum {
  title: string;
  url: string;
}

