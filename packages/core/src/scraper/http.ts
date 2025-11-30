/**
 * HTTP 클라이언트 및 요청 유틸리티
 */

import axios, { type AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import type { StreamResponse } from '@khinsider/shared';
import type { RequestOptions, HttpContext, AxiosErrorLike, ScraperConfig, ScraperState } from './types.js';
import { DEFAULT_CONFIG, DEFAULT_HEADERS, POST_HEADERS, STREAM_HEADERS, TIMEOUTS } from './config.js';

/**
 * HTTP 컨텍스트 생성
 */
export function createHttpContext(config: Partial<ScraperConfig> = {}): HttpContext {
  const fullConfig: ScraperConfig = { ...DEFAULT_CONFIG, ...config };
  const cookieJar = new CookieJar();
  const client = wrapper(axios.create({
    jar: cookieJar,
    withCredentials: true
  }));

  const state: ScraperState = {
    isLoggedIn: false,
    lastRequestTime: 0,
    requestLock: null
  };

  return { config: fullConfig, state, cookieJar, client };
}

/**
 * HTTP 컨텍스트 리셋 (로그아웃 등)
 */
export function resetHttpContext(ctx: HttpContext): void {
  ctx.cookieJar = new CookieJar();
  ctx.client = wrapper(axios.create({
    jar: ctx.cookieJar,
    withCredentials: true
  }));
  ctx.state.isLoggedIn = false;
}

/**
 * 지연 함수
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Axios 에러 타입 가드
 */
function isAxiosErrorLike(error: unknown): error is AxiosErrorLike {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  return 'response' in err && typeof err.response === 'object';
}

/**
 * 재시도하지 않아야 하는 클라이언트 에러인지 확인
 */
function isNonRetryableClientError(error: unknown): boolean {
  if (!isAxiosErrorLike(error)) return false;
  const status = error.response?.status;
  return typeof status === 'number' &&
         status >= 400 &&
         status < 500 &&
         status !== 429;
}

/**
 * Rate limiting을 적용한 요청 실행
 */
export async function rateLimitedRequest<T>(
  ctx: HttpContext,
  fn: () => Promise<T>
): Promise<T> {
  // Wait for any pending request to complete
  while (ctx.state.requestLock) {
    await ctx.state.requestLock;
  }

  // Create a new lock
  let releaseLock!: () => void;
  ctx.state.requestLock = new Promise<void>(resolve => { releaseLock = resolve; });

  try {
    const now = Date.now();
    const timeSinceLastRequest = now - ctx.state.lastRequestTime;

    if (timeSinceLastRequest < ctx.config.rateLimitDelay) {
      await delay(ctx.config.rateLimitDelay - timeSinceLastRequest);
    }

    ctx.state.lastRequestTime = Date.now();
    return await fn();
  } finally {
    releaseLock();
    ctx.state.requestLock = null;
  }
}

/**
 * URL 유효성 검증 (SSRF 방지)
 */
export function validateUrl(url: string, allowedDomains: string[]): string {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS protocol
    if (parsed.protocol !== 'https:') {
      throw new Error(`Only HTTPS protocol allowed, got: ${parsed.protocol}`);
    }

    // Only allow standard HTTPS port
    if (parsed.port && parsed.port !== '443') {
      throw new Error(`Non-standard port not allowed: ${parsed.port}`);
    }

    // Check for IP addresses (prevent SSRF)
    const hostname = parsed.hostname;

    const isIPv4 = (ip: string): boolean => {
      const parts = ip.split('.');
      if (parts.length !== 4) return false;
      return parts.every(part => {
        if (!/^\d{1,3}$/.test(part)) return false;
        const num = parseInt(part, 10);
        if (part.length > 1 && part.startsWith('0')) return false;
        return num >= 0 && num <= 255;
      });
    };

    const isIPv6 = hostname.startsWith('[') && hostname.endsWith(']');

    if (isIPv4(hostname) || isIPv6) {
      throw new Error('IP addresses not allowed in URLs');
    }

    // Domain whitelist check
    const isAllowed = allowedDomains.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
    if (!isAllowed) {
      throw new Error(`URL domain not allowed: ${hostname}`);
    }

    return url;
  } catch (error: unknown) {
    if (error instanceof Error && (
      error.message.includes('not allowed') ||
      error.message.includes('Only HTTPS') ||
      error.message.includes('Non-standard port') ||
      error.message.includes('IP addresses')
    )) {
      throw error;
    }
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * 전체 URL 빌드 및 검증
 */
export function buildUrl(href: string | null | undefined, baseUrl: string, allowedDomains: string[]): string | null {
  if (!href || typeof href !== 'string') return null;
  const fullUrl = href.startsWith('http') ? href : baseUrl + href;
  return validateUrl(fullUrl, allowedDomains);
}

/**
 * HTTP 응답 유효성 검증
 */
export function validateResponse<T>(response: AxiosResponse<T>, url: string): AxiosResponse<T> {
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} error for ${url}`);
  }

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

/**
 * GET 요청
 */
export async function makeRequest(
  ctx: HttpContext,
  url: string,
  options: RequestOptions = {}
): Promise<AxiosResponse<string>> {
  const headers = {
    'User-Agent': ctx.config.userAgent,
    ...DEFAULT_HEADERS,
    'Referer': ctx.config.baseUrl,
    ...options.headers
  };

  return rateLimitedRequest(ctx, async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt < ctx.config.maxRetries; attempt++) {
      try {
        const response = await ctx.client.get<string>(url, {
          headers,
          timeout: TIMEOUTS.DEFAULT,
          validateStatus: () => true,
          ...options
        });

        return validateResponse(response, url);
      } catch (error: unknown) {
        lastError = error;

        // 4xx 에러 (429 제외)는 재시도하지 않음
        if (isNonRetryableClientError(error)) {
          throw error;
        }

        if (attempt < ctx.config.maxRetries - 1) {
          await delay(ctx.config.retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  });
}

/**
 * POST 요청
 */
export async function makePost(
  ctx: HttpContext,
  url: string,
  data: string,
  options: RequestOptions = {}
): Promise<AxiosResponse<string>> {
  const headers = {
    'User-Agent': ctx.config.userAgent,
    ...POST_HEADERS,
    'Referer': ctx.config.forumUrl + '/index.php?login/',
    ...options.headers
  };

  return rateLimitedRequest(ctx, async () => {
    const response = await ctx.client.post<string>(url, data, {
      headers,
      timeout: TIMEOUTS.DEFAULT,
      maxRedirects: 5,
      validateStatus: () => true,
      ...options
    });

    return validateResponse(response, url);
  });
}

/**
 * 스트리밍 요청 (파일 다운로드용)
 */
export async function makeStreamRequest(
  ctx: HttpContext,
  url: string,
  options: RequestOptions = {}
): Promise<StreamResponse> {
  validateUrl(url, ctx.config.allowedDomains);

  const headers = {
    'User-Agent': ctx.config.userAgent,
    ...STREAM_HEADERS,
    'Referer': ctx.config.baseUrl,
    ...options.headers
  };

  return rateLimitedRequest(ctx, async () => {
    const response = await ctx.client({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers,
      timeout: options.timeout || TIMEOUTS.STREAM,
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
