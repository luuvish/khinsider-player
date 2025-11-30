/**
 * 애플리케이션 커스텀 에러 클래스
 *
 * 에러 타입 구분 및 일관된 에러 처리를 위한 에러 클래스
 */

/**
 * 기본 애플리케이션 에러
 */
export class AppError extends Error {
  readonly code: string;
  readonly isOperational: boolean;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code = 'APP_ERROR',
    options?: {
      cause?: Error;
      isOperational?: boolean;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.isOperational = options?.isOperational ?? true;
    this.timestamp = new Date();
    this.context = options?.context;

    // V8 스택 트레이스 유지
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * 네트워크 관련 에러
 */
export class NetworkError extends AppError {
  readonly statusCode?: number;
  readonly url?: string;
  readonly method?: string;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      statusCode?: number;
      url?: string;
      method?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'NETWORK_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'NetworkError';
    this.statusCode = options?.statusCode;
    this.url = options?.url;
    this.method = options?.method;
  }
}

/**
 * 연결 에러 (ECONNREFUSED, ENOTFOUND 등)
 */
export class ConnectionError extends NetworkError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
      url?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, { ...options, statusCode: undefined });
    this.name = 'ConnectionError';
  }
}

/**
 * 타임아웃 에러
 */
export class TimeoutError extends NetworkError {
  readonly timeoutMs?: number;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      url?: string;
      timeoutMs?: number;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, { ...options, statusCode: 408 });
    this.name = 'TimeoutError';
    this.timeoutMs = options?.timeoutMs;
  }
}

/**
 * HTTP 에러 (4xx, 5xx)
 */
export class HttpError extends NetworkError {
  readonly responseBody?: unknown;

  constructor(
    message: string,
    statusCode: number,
    options?: {
      cause?: Error;
      url?: string;
      method?: string;
      responseBody?: unknown;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, { ...options, statusCode });
    this.name = 'HttpError';
    this.responseBody = options?.responseBody;
  }

  get isClientError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 400 && this.statusCode < 500;
  }

  get isServerError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 500;
  }
}

/**
 * 인증 에러 (401, 403)
 */
export class AuthenticationError extends HttpError {
  constructor(
    message: string,
    statusCode: 401 | 403 = 401,
    options?: {
      cause?: Error;
      url?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, statusCode, options);
    this.name = 'AuthenticationError';
  }
}

/**
 * 파싱 에러 (HTML, JSON 등)
 */
export class ParseError extends AppError {
  readonly source?: string;
  readonly position?: { line?: number; column?: number };

  constructor(
    message: string,
    options?: {
      cause?: Error;
      source?: string;
      position?: { line?: number; column?: number };
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'PARSE_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'ParseError';
    this.source = options?.source;
    this.position = options?.position;
  }
}

/**
 * 유효성 검사 에러
 */
export class ValidationError extends AppError {
  readonly field?: string;
  readonly value?: unknown;
  readonly constraints?: string[];

  constructor(
    message: string,
    options?: {
      cause?: Error;
      field?: string;
      value?: unknown;
      constraints?: string[];
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'VALIDATION_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'ValidationError';
    this.field = options?.field;
    this.value = options?.value;
    this.constraints = options?.constraints;
  }
}

/**
 * 리소스 없음 에러
 */
export class NotFoundError extends AppError {
  readonly resourceType?: string;
  readonly resourceId?: string | number;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      resourceType?: string;
      resourceId?: string | number;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'NOT_FOUND', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'NotFoundError';
    this.resourceType = options?.resourceType;
    this.resourceId = options?.resourceId;
  }
}

/**
 * 파일 시스템 에러
 */
export class FileSystemError extends AppError {
  readonly path?: string;
  readonly operation?: 'read' | 'write' | 'delete' | 'create' | 'access';

  constructor(
    message: string,
    options?: {
      cause?: Error;
      path?: string;
      operation?: 'read' | 'write' | 'delete' | 'create' | 'access';
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'FILE_SYSTEM_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'FileSystemError';
    this.path = options?.path;
    this.operation = options?.operation;
  }
}

/**
 * 데이터베이스 에러
 */
export class DatabaseError extends AppError {
  readonly query?: string;
  readonly table?: string;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      query?: string;
      table?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'DATABASE_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'DatabaseError';
    this.query = options?.query;
    this.table = options?.table;
  }
}

/**
 * 설정 에러
 */
export class ConfigurationError extends AppError {
  readonly configKey?: string;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      configKey?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'CONFIGURATION_ERROR', {
      cause: options?.cause,
      isOperational: false, // 설정 에러는 보통 치명적
      context: options?.context,
    });
    this.name = 'ConfigurationError';
    this.configKey = options?.configKey;
  }
}

/**
 * 재생 관련 에러
 */
export class PlaybackError extends AppError {
  readonly trackId?: number;
  readonly albumId?: number;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      trackId?: number;
      albumId?: number;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'PLAYBACK_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'PlaybackError';
    this.trackId = options?.trackId;
    this.albumId = options?.albumId;
  }
}

/**
 * 스크래핑 에러
 */
export class ScraperError extends AppError {
  readonly url?: string;
  readonly selector?: string;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      url?: string;
      selector?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'SCRAPER_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'ScraperError';
    this.url = options?.url;
    this.selector = options?.selector;
  }
}

/**
 * 다운로드 에러
 */
export class DownloadError extends AppError {
  readonly url?: string;
  readonly destPath?: string;
  readonly bytesDownloaded?: number;
  readonly totalBytes?: number;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      url?: string;
      destPath?: string;
      bytesDownloaded?: number;
      totalBytes?: number;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'DOWNLOAD_ERROR', {
      cause: options?.cause,
      isOperational: true,
      context: options?.context,
    });
    this.name = 'DownloadError';
    this.url = options?.url;
    this.destPath = options?.destPath;
    this.bytesDownloaded = options?.bytesDownloaded;
    this.totalBytes = options?.totalBytes;
  }
}

/**
 * 에러 타입 확인 유틸리티
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

/**
 * 에러를 AppError로 래핑
 */
export function wrapError(
  error: unknown,
  message?: string,
  code?: string
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));

  return new AppError(message ?? originalError.message, code ?? 'UNKNOWN_ERROR', {
    cause: originalError,
    isOperational: false,
  });
}
