/**
 * Scraper 설정 및 상수
 */

import type { ScraperConfig } from './types.js';

/**
 * 기본 Scraper 설정
 */
export const DEFAULT_CONFIG: ScraperConfig = {
  baseUrl: 'https://downloads.khinsider.com',
  forumUrl: 'https://downloads.khinsider.com/forums',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  rateLimitDelay: 500,
  maxRetries: 3,
  retryDelay: 2000,
  allowedDomains: [
    'downloads.khinsider.com',
    'khinsider.com',
    'vgmtreasurechest.com'
  ]
};

/**
 * HTTP 요청 기본 헤더
 */
export const DEFAULT_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
} as const;

/**
 * POST 요청 기본 헤더
 */
export const POST_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Content-Type': 'application/x-www-form-urlencoded'
} as const;

/**
 * 스트리밍 요청 기본 헤더
 */
export const STREAM_HEADERS = {
  'Accept': '*/*'
} as const;

/**
 * 타임아웃 설정
 */
export const TIMEOUTS = {
  DEFAULT: 30000,
  STREAM: 60000
} as const;

/**
 * 페이지네이션 설정
 */
export const PAGINATION = {
  MAX_PAGES: 100,
  MAX_EMPTY_PAGES: 3
} as const;

/**
 * 검색 제한
 */
export const SEARCH_LIMITS = {
  MAX_QUERY_LENGTH: 200
} as const;
