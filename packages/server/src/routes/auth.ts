import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { userRepo } from '@khinsider/core';
import { generateToken, authenticateToken, AuthenticatedRequest, blacklistToken } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { config, isProduction } from '../config/index.js';
import { generateCsrfToken } from '../middleware/security.js';

// SECURITY: Pre-computed dummy hash for timing attack prevention
// This hash is used when a user doesn't exist to ensure constant-time comparison
const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYE6dMGGjTxe';

// Cookie configuration
const COOKIE_NAME = 'auth_token';
const ANON_SESSION_COOKIE = 'anon_session';
const CSRF_SESSION_EXPIRY = 60 * 60 * 1000; // 1 hour for anonymous sessions

// SECURITY: Track issued anonymous sessions with timestamps for time-based expiration
// Only sessions issued by this server are valid for CSRF binding
// Map stores: sessionToken -> createdAt timestamp
const issuedAnonSessions = new Map<string, number>();
const MAX_ANON_SESSIONS = 50000;
const ANON_SESSION_TTL = 60 * 60 * 1000; // 1 hour session lifetime

// Periodic cleanup of expired anonymous sessions (every 5 minutes)
let anonSessionCleanupInterval: ReturnType<typeof setInterval> | null = null;

anonSessionCleanupInterval = setInterval(() => {
  const now = Date.now();
  // Time-based cleanup: remove sessions older than TTL
  for (const [token, createdAt] of issuedAnonSessions.entries()) {
    if (now - createdAt > ANON_SESSION_TTL) {
      issuedAnonSessions.delete(token);
    }
  }
  // Additional size-based cleanup if still over limit
  if (issuedAnonSessions.size > MAX_ANON_SESSIONS) {
    const entries = Array.from(issuedAnonSessions.entries())
      .sort((a, b) => a[1] - b[1]); // Sort by age (oldest first)
    const toRemove = entries.slice(0, entries.length - MAX_ANON_SESSIONS * 0.8);
    for (const [token] of toRemove) {
      issuedAnonSessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * Cleanup anonymous session interval (call on server shutdown)
 */
export function clearAnonSessionCleanup(): void {
  if (anonSessionCleanupInterval) {
    clearInterval(anonSessionCleanupInterval);
    anonSessionCleanupInterval = null;
  }
  issuedAnonSessions.clear();
}

// SECURITY: Timing-safe comparison for anonymous session validation
// Uses constant-time comparison to prevent timing attacks
export function isValidAnonSession(sessionToken: string): boolean {
  // First check if session exists in our map
  const createdAt = issuedAnonSessions.get(sessionToken);
  if (createdAt === undefined) {
    return false;
  }
  // Check if session has expired
  if (Date.now() - createdAt > ANON_SESSION_TTL) {
    issuedAnonSessions.delete(sessionToken);
    return false;
  }
  return true;
}

// Helper to add new session with timestamp
function addAnonSession(token: string): void {
  issuedAnonSessions.set(token, Date.now());
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction, // Only use secure in production (HTTPS)
  sameSite: 'strict' as const,
  maxAge: config.cookieMaxAge,
  path: '/',
  ...(config.cookieDomain && { domain: config.cookieDomain })
};

const ANON_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict' as const,
  maxAge: CSRF_SESSION_EXPIRY,
  path: '/'
};

const router = Router();

// Password strength validation
function validatePassword(password: string): { valid: boolean; error?: string } {
  // Minimum 12 characters for stronger security
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters' };
  }

  // Maximum length to prevent DoS
  if (password.length > 128) {
    return { valid: false, error: 'Password must be at most 128 characters' };
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    return {
      valid: false,
      error: 'Password must contain uppercase, lowercase, numbers, and special characters'
    };
  }

  // Check for common weak patterns
  const commonPatterns = ['password', '12345678', 'qwerty', 'abcdefgh'];
  const lowerPassword = password.toLowerCase();
  for (const pattern of commonPatterns) {
    if (lowerPassword.includes(pattern)) {
      return { valid: false, error: 'Password contains a common pattern' };
    }
  }

  return { valid: true };
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw createError('Username and password are required', 400);
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      throw createError('Invalid input types', 400);
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
      throw createError('Username must be between 3 and 50 characters', 400);
    }

    // Username format validation (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      throw createError('Username can only contain letters, numbers, and underscores', 400);
    }

    // Password strength validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw createError(passwordValidation.error || 'Invalid password', 400);
    }

    // Hash password and create user
    // Note: userRepo.create handles UNIQUE constraint violations, avoiding TOCTOU race condition
    const passwordHash = await bcrypt.hash(password, 12); // Use 12 rounds for better security

    let user;
    try {
      user = userRepo.create(trimmedUsername, passwordHash);
    } catch (err: unknown) {
      // Handle duplicate username (from database constraint)
      if (err instanceof Error && err.message === 'Username already exists') {
        throw createError('Username already exists', 409);
      }
      throw err;
    }

    const token = generateToken({ userId: user.id, username: user.username });

    // Set httpOnly cookie with token
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.status(201).json({
      message: 'User registered successfully',
      // Also return token for backwards compatibility and socket auth
      token,
      user: userRepo.getPublicInfo(user)
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw createError('Username and password are required', 400);
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      throw createError('Invalid input types', 400);
    }

    // Find user by username
    const user = userRepo.findByUsername(username.trim());

    // SECURITY: Timing attack prevention
    // Always perform password comparison even if user doesn't exist
    // This ensures constant-time response regardless of user existence
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const isValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !isValid) {
      // Use same error message to prevent user enumeration
      throw createError('Invalid username or password', 401);
    }

    const token = generateToken({ userId: user.id, username: user.username });

    // Set httpOnly cookie with token
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      message: 'Login successful',
      // Also return token for backwards compatibility and socket auth
      token,
      user: userRepo.getPublicInfo(user)
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.user
  });
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  // SECURITY: Blacklist the token to prevent reuse
  if (req.token) {
    // Calculate token expiry from JWT payload
    const expiry = req.user?.exp ? req.user.exp * 1000 : undefined;
    blacklistToken(req.token, expiry);
  }

  // Clear the httpOnly cookie
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/'
  });

  // Also clear anonymous session cookie
  res.clearCookie(ANON_SESSION_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/'
  });

  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/csrf-token - Get CSRF token for state-changing requests
// SECURITY: Use persistent session identifiers for proper CSRF token binding
// This ensures CSRF tokens remain valid across requests within a session
router.get('/csrf-token', (req: Request, res: Response) => {
  const authCookie = req.cookies?.[COOKIE_NAME];
  const anonSessionCookie = req.cookies?.[ANON_SESSION_COOKIE];

  let sessionId: string;

  if (authCookie) {
    // SECURITY: Hash full JWT to create unique session identifier
    // This prevents predictable session IDs from JWT structure
    const authHash = crypto.createHash('sha256').update(authCookie).digest('hex').slice(0, 32);
    sessionId = `auth:${authHash}`;
  } else if (anonSessionCookie && typeof anonSessionCookie === 'string' && anonSessionCookie.length === 64) {
    // SECURITY: Validate anonymous session was issued by this server and not expired
    // Prevents attackers from creating arbitrary session cookies
    if (/^[a-f0-9]{64}$/i.test(anonSessionCookie) && isValidAnonSession(anonSessionCookie)) {
      sessionId = `anon:${anonSessionCookie}`;
    } else {
      // Invalid, forged, or expired session - create new one
      const newSessionToken = crypto.randomBytes(32).toString('hex');
      addAnonSession(newSessionToken);
      res.cookie(ANON_SESSION_COOKIE, newSessionToken, ANON_COOKIE_OPTIONS);
      sessionId = `anon:${newSessionToken}`;
    }
  } else {
    // SECURITY: Create new persistent anonymous session and track it
    // This session cookie allows CSRF tokens to be validated across requests
    const newSessionToken = crypto.randomBytes(32).toString('hex');
    addAnonSession(newSessionToken);
    res.cookie(ANON_SESSION_COOKIE, newSessionToken, ANON_COOKIE_OPTIONS);
    sessionId = `anon:${newSessionToken}`;
  }

  const token = generateCsrfToken(sessionId);

  res.json({ token });
});

export default router;
