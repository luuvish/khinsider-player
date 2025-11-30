import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface JwtPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  token?: string;
}

const COOKIE_NAME = 'auth_token';

// SECURITY: Token blacklist for logout invalidation
// Stores SHA256 hash (truncated to 32 chars) of full token with expiration timestamps
// Using cryptographic hash prevents collision attacks while maintaining uniqueness
const tokenBlacklist = new Map<string, number>();
const MAX_BLACKLIST_ENTRIES = 10000;
const BLACKLIST_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// SECURITY: Hash full token using SHA256 to prevent collision attacks
// Truncate to 32 chars for storage efficiency while maintaining 128-bit security
function getTokenSignature(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

/**
 * Add token to blacklist (call on logout)
 */
export function blacklistToken(token: string, expiresAt?: number): void {
  // Clean up if blacklist is too large
  if (tokenBlacklist.size >= MAX_BLACKLIST_ENTRIES) {
    const now = Date.now();
    for (const [sig, exp] of tokenBlacklist.entries()) {
      if (now > exp) {
        tokenBlacklist.delete(sig);
      }
      if (tokenBlacklist.size < MAX_BLACKLIST_ENTRIES * 0.8) break;
    }
  }

  const signature = getTokenSignature(token);
  // Use token expiry or default to 7 days
  const expiry = expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000;
  tokenBlacklist.set(signature, expiry);
  logger.debug('Token blacklisted', { signaturePrefix: signature.substring(0, 4) + '...' });
}

/**
 * Check if token is blacklisted
 */
export function isTokenBlacklisted(token: string): boolean {
  const signature = getTokenSignature(token);
  const expiry = tokenBlacklist.get(signature);
  if (!expiry) return false;

  // Check if blacklist entry has expired
  if (Date.now() > expiry) {
    tokenBlacklist.delete(signature);
    return false;
  }

  return true;
}

// Periodic cleanup of expired blacklist entries
const blacklistCleanupInterval = setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [sig, exp] of tokenBlacklist.entries()) {
    if (now > exp) {
      tokenBlacklist.delete(sig);
      removed++;
    }
  }
  if (removed > 0) {
    logger.debug('Token blacklist cleanup completed', {
      removed,
      remaining: tokenBlacklist.size
    });
  }
}, BLACKLIST_CLEANUP_INTERVAL);

// Export for graceful shutdown - clears both the blacklist and stops cleanup interval
export function clearTokenBlacklist(): void {
  clearInterval(blacklistCleanupInterval);
  tokenBlacklist.clear();
}

/**
 * Extract token from request - checks both Authorization header and httpOnly cookie
 */
function extractToken(req: Request): string | null {
  // First check Authorization header (for API clients and socket auth)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  // Then check httpOnly cookie (for browser clients)
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // SECURITY: Check if token has been blacklisted (logout)
  if (isTokenBlacklisted(token)) {
    res.status(403).json({ error: 'Token has been invalidated' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'] // SECURITY: Explicitly specify algorithm to prevent algorithm confusion
    }) as JwtPayload;
    req.user = decoded;
    req.token = token; // Store token for potential blacklisting on logout
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (token && !isTokenBlacklisted(token)) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256']
      }) as JwtPayload;
      req.user = decoded;
      req.token = token;
    } catch {
      // Token invalid, but continue without auth
    }
  }

  next();
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256', // SECURITY: Explicitly specify algorithm
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn']
  });
}
