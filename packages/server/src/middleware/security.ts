import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { isDevelopment, config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// CSRF token storage
// WARNING: In-memory storage is suitable for single-instance deployments only.
// For multi-instance/load-balanced production deployments, use Redis or database storage.
// This application is designed for single-instance use (local app or single server).
const csrfTokens = new Map<string, { token: string; expires: number }>();
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const MAX_CSRF_TOKENS = 10000; // Limit tokens to prevent memory exhaustion

// Log warning at startup for production multi-instance awareness
if (process.env.NODE_ENV === 'production') {
  console.warn(
    '[SECURITY] CSRF tokens stored in-memory. ' +
    'For multi-instance deployments, implement Redis-based token storage.'
  );
}

// Clean up expired tokens periodically
let csrfCleanupInterval: ReturnType<typeof setInterval> | null = null;

csrfCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (now > value.expires) {
      csrfTokens.delete(key);
    }
  }
}, 10 * 60 * 1000); // Every 10 minutes

/**
 * Cleanup CSRF token interval (call on server shutdown)
 */
export function clearCsrfCleanup(): void {
  if (csrfCleanupInterval) {
    clearInterval(csrfCleanupInterval);
    csrfCleanupInterval = null;
  }
  csrfTokens.clear();
}

/**
 * Middleware to enforce HTTPS in production
 * Redirects HTTP requests to HTTPS
 */
export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  // Skip in development
  if (isDevelopment()) {
    return next();
  }

  // Check for HTTPS via various headers (works behind load balancers/proxies)
  const isSecure = req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers['x-forwarded-ssl'] === 'on';

  if (!isSecure) {
    // Log the redirect attempt
    logger.warn('HTTP request redirected to HTTPS', {
      method: req.method,
      path: req.path,
      ip: req.ip
    });

    // Build the HTTPS URL
    const httpsUrl = `https://${req.headers.host}${req.url}`;

    // Redirect with 301 (permanent) for GET, 307 (temporary) for other methods
    // 307 preserves the request method
    const statusCode = req.method === 'GET' ? 301 : 307;
    res.redirect(statusCode, httpsUrl);
    return;
  }

  next();
}

/**
 * Middleware to set security headers
 * Complements helmet with additional security measures
 */
export function additionalSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent browsers from MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS filter in older browsers (deprecated but harmless)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (restrict browser features)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // HSTS (Strict Transport Security) - enforce HTTPS for 1 year
  // Only set in production to avoid development issues
  if (!isDevelopment()) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Cross-Origin Resource Policy - prevent loading by other origins
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // X-Permitted-Cross-Domain-Policies - prevent Adobe Flash/PDF from loading
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  next();
}

/**
 * Middleware to validate and sanitize request input
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  // Sanitize query parameters - remove null bytes and control characters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        // Remove null bytes and control characters (except newline, tab, carriage return)
        // eslint-disable-next-line no-control-regex
        req.query[key] = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      }
    }
  }

  // Sanitize body if it's an object
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  next();
}

/**
 * Recursively sanitize object values
 */
function sanitizeObject(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove null bytes and control characters
      // eslint-disable-next-line no-control-regex
      obj[key] = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'string') {
          // eslint-disable-next-line no-control-regex
          value[i] = value[i].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        } else if (value[i] && typeof value[i] === 'object') {
          sanitizeObject(value[i] as Record<string, unknown>);
        }
      }
    }
  }
}

/**
 * Generate a CSRF token for a session
 */
export function generateCsrfToken(sessionId: string): string {
  // Clean up if we have too many tokens
  if (csrfTokens.size >= MAX_CSRF_TOKENS) {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
      if (now > value.expires) {
        csrfTokens.delete(key);
      }
      if (csrfTokens.size < MAX_CSRF_TOKENS * 0.8) break;
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(sessionId, {
    token,
    expires: Date.now() + CSRF_TOKEN_EXPIRY
  });
  return token;
}

/**
 * Validate CSRF token
 */
export function validateCsrfToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  if (!stored) return false;
  if (Date.now() > stored.expires) {
    csrfTokens.delete(sessionId);
    return false;
  }
  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(stored.token, 'utf8'),
    Buffer.from(token, 'utf8')
  );
}

// Cookie names (must match auth.ts)
const AUTH_COOKIE_NAME = 'auth_token';
const ANON_SESSION_COOKIE = 'anon_session';

// Import from auth.ts for anonymous session validation
// Note: Lazy import to avoid circular dependency
let isValidAnonSessionFn: ((token: string) => boolean) | null = null;
async function getIsValidAnonSession(): Promise<(token: string) => boolean> {
  if (!isValidAnonSessionFn) {
    const authModule = await import('../routes/auth.js');
    isValidAnonSessionFn = authModule.isValidAnonSession;
  }
  return isValidAnonSessionFn;
}

/**
 * CSRF protection middleware
 * Uses Double Submit Cookie pattern combined with token validation
 *
 * NOTE: CSRF protection is ALWAYS enabled in production.
 * In development, set DISABLE_CSRF=true to disable for testing only.
 */
export async function csrfProtection(req: Request, res: Response, next: NextFunction): Promise<void> {
  // NEVER allow CSRF to be disabled in production
  const isProduction = process.env.NODE_ENV === 'production';

  if (process.env.DISABLE_CSRF === 'true') {
    if (isProduction) {
      // Log error and continue with CSRF protection enabled
      logger.error('CRITICAL: Attempted to disable CSRF protection in production. Request denied.');
      res.status(500).json({ error: 'Security configuration error' });
      return;
    }
    // Only allow in non-production environments
    logger.warn('CSRF protection is disabled via DISABLE_CSRF environment variable (development only)');
    return next();
  }

  // Skip for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Check Origin header matches expected origin
  const origin = req.headers.origin;
  const expectedOrigins = config.corsOrigin.split(',').map(o => o.trim());

  if (origin && !expectedOrigins.includes(origin)) {
    logger.warn('CSRF: Origin mismatch', {
      origin,
      expected: expectedOrigins,
      path: req.path
    });
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }

  // Get CSRF token from header
  const csrfToken = req.headers['x-csrf-token'] as string | undefined;
  const xRequestedWith = req.headers['x-requested-with'];

  // SECURITY: Validate actual CSRF token for state-changing requests
  // Session identifier must match the one used during token generation
  const authCookie = req.cookies?.[AUTH_COOKIE_NAME];
  const anonSessionCookie = req.cookies?.[ANON_SESSION_COOKIE];

  let sessionId: string | null = null;

  if (authCookie) {
    // SECURITY: Hash full JWT to create session identifier (matches auth.ts)
    // This prevents predictable session IDs from JWT structure
    const authHash = crypto.createHash('sha256').update(authCookie).digest('hex').slice(0, 32);
    sessionId = `auth:${authHash}`;
  } else if (anonSessionCookie && typeof anonSessionCookie === 'string' && anonSessionCookie.length === 64) {
    // SECURITY: Validate anonymous session was issued by this server
    // Prevents attackers from creating arbitrary session cookies
    if (/^[a-f0-9]{64}$/i.test(anonSessionCookie)) {
      const isValidAnonSession = await getIsValidAnonSession();
      if (isValidAnonSession(anonSessionCookie)) {
        sessionId = `anon:${anonSessionCookie}`;
      }
    }
  }

  // If no valid session identifier found, require X-Requested-With as fallback
  if (!sessionId) {
    if (!xRequestedWith) {
      logger.warn('CSRF: No session cookie and no X-Requested-With header', { path: req.path });
      res.status(403).json({ error: 'CSRF validation failed' });
      return;
    }
    // Skip CSRF token validation for requests without session but with X-Requested-With
    // Origin/Referer checks above still apply
    return next();
  }

  // If X-CSRF-Token header is provided, validate it
  if (csrfToken) {
    // SECURITY: Validate token length and format before comparison
    // Token must be exactly 64 hex characters (32 bytes from crypto.randomBytes)
    if (csrfToken.length !== 64 || !/^[a-f0-9]{64}$/i.test(csrfToken)) {
      logger.warn('CSRF: Invalid token format', { path: req.path, length: csrfToken.length });
      res.status(403).json({ error: 'CSRF validation failed' });
      return;
    }

    if (!validateCsrfToken(sessionId, csrfToken)) {
      logger.warn('CSRF: Token validation failed', { path: req.path, sessionId: sessionId.substring(0, 8) + '...' });
      res.status(403).json({ error: 'CSRF validation failed' });
      return;
    }

    // Token valid, proceed
    return next();
  }

  // Fallback: If no CSRF token but X-Requested-With header present, check referer
  if (xRequestedWith) {
    const referer = req.headers.referer;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
        if (expectedOrigins.includes(refererOrigin)) {
          // Valid referer with XMLHttpRequest header - allow (legacy compatibility)
          return next();
        }
      } catch {
        // Invalid referer URL
      }
    }
  }

  // No valid CSRF protection found
  logger.warn('CSRF: No valid token or origin verification', { path: req.path });
  res.status(403).json({ error: 'CSRF validation failed' });
}
