import dotenv from 'dotenv';
import crypto from 'crypto';
import os from 'os';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// JWT Secret validation - NEVER use default in production
if (!process.env.JWT_SECRET) {
  if (isProduction) {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production. Server cannot start without a secure secret.');
  }
  // Development warning - log to stderr to ensure visibility
  console.warn('\x1b[33m%s\x1b[0m', '⚠️  WARNING: JWT_SECRET not set. Using insecure development default. DO NOT use in production!');
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    throw new Error('FATAL: JWT_SECRET is required');
  }
}

// Additional production validations
if (isProduction && jwtSecret) {
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long in production');
  }
  if (jwtSecret.includes('dev') || jwtSecret.includes('change') || jwtSecret.includes('secret')) {
    throw new Error('JWT_SECRET appears to contain unsafe keywords. Please set a cryptographically secure secret.');
  }
}

// Use validated secret - production already throws above if missing
// Development gets a stable but insecure key derived from machine info (not time-based to prevent key rotation issues)
if (isProduction && !jwtSecret) {
  // This should never be reached due to checks above, but prevents empty string in production
  throw new Error('FATAL: JWT_SECRET validation bypass detected');
}

// SECURITY: For development, use a stable key derived from machine info instead of time-based
// This prevents session invalidation on server restart while still being development-only
function generateDevSecret(): string {
  const machineInfo = [
    os.hostname(),
    os.userInfo().username,
    os.homedir(),
    process.cwd(),
    'khinsider-dev-only'
  ].join(':');
  return crypto.createHash('sha256').update(machineInfo).digest('hex');
}

const finalJwtSecret = jwtSecret || generateDevSecret();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv,

  // JWT settings
  jwtSecret: finalJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Cookie settings
  cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  // CORS settings
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10), // Stricter for auth

  // Database path (for SQLite)
  dbPath: process.env.DB_PATH || undefined, // Uses default from core if not set

  // Storage path for downloads
  storagePath: process.env.STORAGE_PATH || undefined,

  // SECURITY: Proxy trust settings
  // Set TRUST_PROXY=true only when behind a trusted reverse proxy (nginx, cloudflare, etc.)
  // When true, X-Forwarded-For header will be trusted for rate limiting
  trustProxy: process.env.TRUST_PROXY === 'true',
};

// Khinsider credentials - accessed directly from env when needed, not exported in config
// Use getKhinsiderCredentials() function instead
export function getKhinsiderCredentials(): { username: string; password: string } | null {
  const username = process.env.KHINSIDER_USERNAME;
  const password = process.env.KHINSIDER_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

export function isDevelopment(): boolean {
  return config.nodeEnv === 'development';
}

export { isProduction };
