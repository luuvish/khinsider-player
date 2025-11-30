/**
 * 상수 모듈 재수출
 */

// 네트워크 관련
export * from './network.js';

// 타임아웃 관련
export * from './timeouts.js';

// 파일 시스템 관련
export * from './files.js';

// 기존 상수 (PlaybackState, PlaybackMode 등)
// Playback states
export const PlaybackState = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ERROR: 'error',
} as const;

// Playback modes
export const PlaybackMode = {
  IDLE: 'idle',
  ALBUM: 'album',
  YEAR_SEQUENTIAL: 'year_sequential',
} as const;

// Database settings keys
export const SettingsKey = {
  CREDENTIALS: 'khinsider_credentials',
  SESSION: 'khinsider_session',
  LAST_POSITION: 'last_position',
} as const;

// Download metadata version
export const METADATA_VERSION = 4;

// 캐시 관련 상수
export const CacheConfig = {
  /** 앨범 정보 캐시 TTL (1시간) */
  ALBUM_INFO_TTL: 60 * 60 * 1000,
  /** 년도 목록 캐시 TTL (24시간) */
  YEARS_LIST_TTL: 24 * 60 * 60 * 1000,
  /** 트랙 URL 캐시 TTL (30분) */
  TRACK_URL_TTL: 30 * 60 * 1000,
  /** 검색 결과 캐시 TTL (5분) */
  SEARCH_RESULTS_TTL: 5 * 60 * 1000,
  /** 최대 캐시 항목 수 */
  MAX_CACHE_SIZE: 500,
} as const;

// 재생 관련 상수
export const PlaybackConfig = {
  /** 연속 실패 시 중단할 최대 스킵 수 */
  MAX_CONSECUTIVE_FAILURES: 10,
  /** 자동 진행 딜레이 (ms) */
  AUTO_ADVANCE_DELAY: 100,
} as const;

// UI 관련 상수
export const UIConfig = {
  /** 트랙 번호 패딩 자릿수 */
  TRACK_NUMBER_PADDING: 2,
  /** 상태 바 높이 */
  STATUS_BAR_HEIGHT: 1,
  /** 최소 터미널 너비 */
  MIN_TERMINAL_WIDTH: 80,
  /** 최소 터미널 높이 */
  MIN_TERMINAL_HEIGHT: 24,
} as const;
