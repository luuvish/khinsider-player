/**
 * Production-safe logger utility
 * Only logs errors in development mode to prevent information disclosure
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  /**
   * Log error messages - only in development
   * In production, errors should be sent to a monitoring service instead
   */
  error: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.error(...args);
    }
    // In production, you could send to error monitoring service here
    // e.g., Sentry, LogRocket, etc.
  },

  /**
   * Log warning messages - only in development
   */
  warn: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log info messages - only in development
   */
  info: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  /**
   * Log debug messages - only in development
   */
  debug: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};
