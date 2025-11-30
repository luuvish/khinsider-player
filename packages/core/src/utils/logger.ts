/**
 * Simple logger for core package
 * Uses debug levels for granular control
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class CoreLogger {
  private level: LogLevel;
  private isDev: boolean;

  constructor() {
    this.isDev = process.env.NODE_ENV !== 'production';
    this.level = (process.env.LOG_LEVEL as LogLevel) || (this.isDev ? 'debug' : 'info');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private format(level: LogLevel, component: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${contextStr}`;
  }

  debug(component: string, message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', component, message, context));
    }
  }

  info(component: string, message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(this.format('info', component, message, context));
    }
  }

  warn(component: string, message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', component, message, context));
    }
  }

  error(component: string, message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorInfo = error instanceof Error
        ? { errorName: error.name, errorMessage: error.message, stack: this.isDev ? error.stack : undefined }
        : undefined;
      console.error(this.format('error', component, message, { ...context, ...errorInfo }));
    }
  }
}

export const logger = new CoreLogger();
