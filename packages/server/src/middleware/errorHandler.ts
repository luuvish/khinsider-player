import { Request, Response, NextFunction } from 'express';
import { isDevelopment } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Error codes for better error categorization
export enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SCRAPER_ERROR = 'SCRAPER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly _isApiError = true as const; // Brand for type guard

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.name = 'ApiError';

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Type guard for ApiError - works across package boundaries
   */
  static isApiError(error: unknown): error is ApiError {
    if (!error || typeof error !== 'object') return false;
    const e = error as Record<string, unknown>;
    return (
      e._isApiError === true &&
      typeof e.statusCode === 'number' &&
      typeof e.message === 'string'
    );
  }

  static badRequest(message: string, code: ErrorCode = ErrorCode.VALIDATION_ERROR): ApiError {
    return new ApiError(message, 400, code);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(message, 401, ErrorCode.AUTHENTICATION_ERROR);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(message, 403, ErrorCode.AUTHORIZATION_ERROR);
  }

  static notFound(message = 'Not Found'): ApiError {
    return new ApiError(message, 404, ErrorCode.NOT_FOUND);
  }

  static internal(message = 'Internal Server Error', code: ErrorCode = ErrorCode.INTERNAL_ERROR): ApiError {
    return new ApiError(message, 500, code);
  }
}

export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Determine if this is an operational error (expected) or programming error (unexpected)
  // Use type guard instead of instanceof for cross-package compatibility
  const isApiErrorType = ApiError.isApiError(err);
  const statusCode = isApiErrorType ? err.statusCode : 500;
  const code = isApiErrorType ? err.code : ErrorCode.INTERNAL_ERROR;
  const message = isApiErrorType ? err.message : 'Internal Server Error';
  const isOperational = isApiErrorType ? err.isOperational : false;

  // Sanitize query parameters before logging (remove sensitive data)
  const sanitizedQuery = { ...req.query };
  const sensitiveKeys = ['password', 'token', 'authorization', 'auth', 'key', 'secret', 'credential'];
  for (const key of Object.keys(sanitizedQuery)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitizedQuery[key] = '[REDACTED]';
    }
  }

  // Log error with context
  logger.error('Request error', err, {
    method: req.method,
    path: req.path,
    statusCode,
    code,
    isOperational,
    query: sanitizedQuery,
    ip: req.ip,
  });

  // Don't expose internal error details in production
  const responseMessage = statusCode >= 500 && !isDevelopment()
    ? 'Internal Server Error'
    : message;

  res.status(statusCode).json({
    error: responseMessage,
    code,
    ...(isDevelopment() && {
      stack: err.stack,
      originalMessage: message
    })
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  // Don't expose path in response to prevent information disclosure
  res.status(404).json({
    error: 'Not Found',
    code: ErrorCode.NOT_FOUND
  });
}

// Helper function for backward compatibility
export function createError(message: string, statusCode = 500, code?: string): ApiError {
  const errorCode = (code as ErrorCode) || (statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR);
  return new ApiError(message, statusCode, errorCode);
}
