import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { initializeDatabase, closeDatabase } from '@khinsider/core';
import { config, isDevelopment } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { enforceHttps, additionalSecurityHeaders, sanitizeInput, csrfProtection, clearCsrfCleanup } from './middleware/security.js';
import { clearTokenBlacklist } from './middleware/auth.js';
import { logger } from './utils/logger.js';
import authRoutes, { clearAnonSessionCleanup } from './routes/auth.js';
import albumRoutes from './routes/albums.js';
import trackRoutes, { clearUrlCacheCleanup } from './routes/tracks.js';
import searchRoutes from './routes/search.js';
import { createSocketServer, cleanupSocketResources } from './socket/index.js';

// Initialize database
initializeDatabase();

// Create Express app
const app = express();
const httpServer = createServer(app);

// SECURITY: Configure Express to trust proxy headers only when explicitly enabled
if (config.trustProxy) {
  app.set('trust proxy', 1);
  logger.info('Proxy trust enabled - X-Forwarded-For header will be trusted');
} else {
  app.set('trust proxy', false);
  logger.info('Proxy trust disabled - using direct connection IP');
}

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: isDevelopment() ? config.rateLimitMax * 10 : config.rateLimitMax,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  }
});

const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: isDevelopment() ? config.authRateLimitMax * 2 : config.authRateLimitMax,
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  }
});

const csrfTokenLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: isDevelopment() ? 60 : 30,
  message: { error: 'Too many CSRF token requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  }
});

// Socket.IO setup
const io = createSocketServer(httpServer);

// Security middleware (first)
app.use(enforceHttps);
app.use(additionalSecurityHeaders);
app.use(sanitizeInput);

// Middleware
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: isDevelopment() ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));

// Parse and validate CORS origins
const parseCorsOrigin = (): string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) => {
  const origins = config.corsOrigin.split(',').map(o => o.trim()).filter(Boolean);

  const validOrigins = origins.filter(origin => {
    try {
      const url = new URL(origin);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      logger.warn('Invalid CORS origin in config', { origin });
      return false;
    }
  });

  if (validOrigins.length === 0) {
    logger.warn('No valid CORS origins configured, using default');
    return 'http://localhost:5173';
  }

  if (validOrigins.length === 1) {
    return validOrigins[0];
  }

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      logger.warn('CORS: Request without Origin header rejected', {
        tip: 'Non-browser clients should use X-Requested-With header'
      });
      callback(new Error('Origin header required'));
      return;
    }
    if (validOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  };
};

app.use(cors({
  origin: parseCorsOrigin(),
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/csrf-token', csrfTokenLimiter);

// CSRF protection for state-changing requests
app.use('/api/', csrfProtection);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
httpServer.listen(config.port, () => {
  logger.info('Server started', {
    port: config.port,
    environment: config.nodeEnv,
    corsOrigin: config.corsOrigin
  });
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received, starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close((err) => {
    if (err) {
      logger.error('Error closing HTTP server', err);
    } else {
      logger.info('HTTP server closed');
    }
  });

  // Close Socket.IO connections
  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  // Clear all intervals and resources
  cleanupSocketResources();
  clearTokenBlacklist();
  clearCsrfCleanup();
  clearAnonSessionCleanup();
  clearUrlCacheCleanup();

  // Give existing connections time to finish
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Close database connection
  try {
    closeDatabase();
    logger.info('Database connection closed');
  } catch (err) {
    logger.error('Error closing database', err instanceof Error ? err : undefined);
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)), {
    promise: String(promise)
  });
  gracefulShutdown('unhandledRejection');
});

export { app, io };
