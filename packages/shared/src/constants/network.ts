/**
 * 네트워크 관련 상수
 */

/** Rate limiting 지연 시간 (ms) */
export const RATE_LIMIT_DELAY = 500;

/** 최대 재시도 횟수 */
export const MAX_RETRIES = 3;

/** 재시도 간 지연 시간 (ms) */
export const RETRY_DELAY = 2000;

/** 최대 페이지 수 (무한 루프 방지) */
export const MAX_PAGES = 100;

/** 기본 요청 타임아웃 (ms) */
export const REQUEST_TIMEOUT = 30000;

/** 다운로드 타임아웃 (ms) */
export const DOWNLOAD_TIMEOUT = 60000;

/** 스트리밍 타임아웃 (ms) */
export const STREAM_TIMEOUT = 120000;

/** 허용된 도메인 목록 */
export const ALLOWED_DOMAINS = [
  'downloads.khinsider.com',
  'khinsider.com',
  'vgmtreasurechest.com',
] as const;

/** 기본 User-Agent */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** HTTP 상태 코드 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

/** 재시도 가능한 HTTP 상태 코드 */
export const RETRYABLE_STATUS_CODES = [
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
  HttpStatus.BAD_GATEWAY,
  HttpStatus.SERVICE_UNAVAILABLE,
] as const;
