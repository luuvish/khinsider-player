/**
 * Custom error classes for better error categorization
 */

export class ScraperError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = 'ScraperError';
    this.code = code;
    this.retryable = retryable;
    Error.captureStackTrace(this, this.constructor);
  }

  static networkError(message: string): ScraperError {
    return new ScraperError(message, 'NETWORK_ERROR', true);
  }

  static parseError(message: string): ScraperError {
    return new ScraperError(message, 'PARSE_ERROR', false);
  }

  static authError(message: string): ScraperError {
    return new ScraperError(message, 'AUTH_ERROR', false);
  }

  static notFoundError(message: string): ScraperError {
    return new ScraperError(message, 'NOT_FOUND', false);
  }

  static rateLimitError(message: string): ScraperError {
    return new ScraperError(message, 'RATE_LIMIT', true);
  }

  static validationError(message: string): ScraperError {
    return new ScraperError(message, 'VALIDATION_ERROR', false);
  }
}

export class DatabaseError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'DATABASE_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class StorageError extends Error {
  public readonly code: string;

  constructor(message: string, code = 'STORAGE_ERROR') {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
