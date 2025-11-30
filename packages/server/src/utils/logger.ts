/**
 * Structured logger for consistent log formatting
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDev: boolean;

  constructor() {
    this.isDev = process.env.NODE_ENV !== 'production';
  }

  private formatEntry(entry: LogEntry): string {
    if (this.isDev) {
      // Human-readable format for development
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? `\n  ${entry.error.name}: ${entry.error.message}${entry.error.stack ? `\n${entry.error.stack}` : ''}` : '';
      return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}${errorStr}`;
    }
    // JSON format for production (better for log aggregation)
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDev ? error.stack : undefined,
      };
    }

    const formatted = this.formatEntry(entry);

    switch (level) {
      case 'debug':
        if (this.isDev) console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    this.log('error', message, context, err);
  }

  // Specialized log methods
  request(method: string, path: string, statusCode: number, durationMs: number, context?: LogContext): void {
    this.info('HTTP Request', {
      method,
      path,
      statusCode,
      durationMs,
      ...context,
    });
  }

  socketEvent(event: string, socketId: string, context?: LogContext): void {
    this.debug('Socket.IO Event', {
      event,
      socketId,
      ...context,
    });
  }
}

export const logger = new Logger();
