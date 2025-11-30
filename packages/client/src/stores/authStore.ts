import { create } from 'zustand';
import { authApi } from '@/api/client';

// SECURITY: Client-side rate limiting for login attempts
const LOGIN_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  lockoutMs: 5 * 60 * 1000, // 5 minute lockout after max attempts
};

interface RateLimitState {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

const rateLimitState: RateLimitState = {
  attempts: 0,
  firstAttemptAt: 0,
  lockedUntil: null,
};

/**
 * Check if login is rate limited
 * Returns remaining lockout time in seconds, or 0 if not limited
 */
function checkRateLimit(): number {
  const now = Date.now();

  // Check if currently locked out
  if (rateLimitState.lockedUntil && now < rateLimitState.lockedUntil) {
    return Math.ceil((rateLimitState.lockedUntil - now) / 1000);
  }

  // Clear lockout if expired
  if (rateLimitState.lockedUntil && now >= rateLimitState.lockedUntil) {
    rateLimitState.lockedUntil = null;
    rateLimitState.attempts = 0;
    rateLimitState.firstAttemptAt = 0;
  }

  // Reset window if expired
  if (rateLimitState.firstAttemptAt && now - rateLimitState.firstAttemptAt > LOGIN_RATE_LIMIT.windowMs) {
    rateLimitState.attempts = 0;
    rateLimitState.firstAttemptAt = 0;
  }

  return 0;
}

/**
 * Record a login attempt
 */
function recordLoginAttempt(): void {
  const now = Date.now();

  if (rateLimitState.attempts === 0) {
    rateLimitState.firstAttemptAt = now;
  }

  rateLimitState.attempts++;

  // Lock out if max attempts exceeded
  if (rateLimitState.attempts >= LOGIN_RATE_LIMIT.maxAttempts) {
    rateLimitState.lockedUntil = now + LOGIN_RATE_LIMIT.lockoutMs;
  }
}

/**
 * Clear rate limit state on successful login
 */
function clearRateLimit(): void {
  rateLimitState.attempts = 0;
  rateLimitState.firstAttemptAt = 0;
  rateLimitState.lockedUntil = null;
}

// SECURITY: Known safe error messages from server
// Only allow these exact messages to be displayed to prevent XSS
const SAFE_ERROR_MESSAGES = new Set([
  'Username and password are required',
  'Invalid input types',
  'Username must be between 3 and 50 characters',
  'Username can only contain letters, numbers, and underscores',
  'Password must be at least 12 characters',
  'Password must be at most 128 characters',
  'Password must contain uppercase, lowercase, numbers, and special characters',
  'Password contains a common pattern',
  'Username already exists',
  'Invalid username or password',
  'Login failed',
  'Registration failed',
  'Authentication required',
  'Token expired',
  'Invalid token',
  'Too many requests, please try again later',
  'Too many authentication attempts, please try again later'
]);

// SECURITY: Sanitize error messages to prevent XSS
function sanitizeErrorMessage(message: unknown): string {
  if (typeof message !== 'string') {
    return 'An error occurred';
  }

  // If it's a known safe message, return it directly
  if (SAFE_ERROR_MESSAGES.has(message)) {
    return message;
  }

  // For unknown messages, sanitize HTML entities and truncate
  const sanitized = message
    .replace(/[<>&"']/g, (char) => {
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[char] || char;
    })
    .slice(0, 200); // Truncate long messages

  return sanitized;
}

interface User {
  id: number;
  username: string;
}

interface AuthState {
  // Token stored in memory only - used for socket auth
  // Main auth is via httpOnly cookie (handled by browser automatically)
  socketToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  socketToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    // SECURITY: Check client-side rate limit before attempting login
    const lockoutSeconds = checkRateLimit();
    if (lockoutSeconds > 0) {
      const minutes = Math.ceil(lockoutSeconds / 60);
      set({
        error: `Too many login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        isLoading: false
      });
      throw new Error('Rate limited');
    }

    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.login(username, password);
      // Clear rate limit on successful login
      clearRateLimit();
      // Token stored in httpOnly cookie by server
      // Keep token in memory for socket authentication only
      set({
        socketToken: data.token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (err) {
      // Record failed attempt for rate limiting
      recordLoginAttempt();
      const rawMessage = (err as { response?: { data?: { error?: string } } })
        .response?.data?.error || 'Login failed';
      // SECURITY: Sanitize error message before displaying
      set({ error: sanitizeErrorMessage(rawMessage), isLoading: false });
      throw err;
    }
  },

  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.register(username, password);
      // Token stored in httpOnly cookie by server
      // Keep token in memory for socket authentication only
      set({
        socketToken: data.token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (err) {
      const rawMessage = (err as { response?: { data?: { error?: string } } })
        .response?.data?.error || 'Registration failed';
      // SECURITY: Sanitize error message before displaying
      set({ error: sanitizeErrorMessage(rawMessage), isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      // Call server to clear httpOnly cookie
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    set({
      socketToken: null,
      user: null,
      isAuthenticated: false
    });
  },

  checkAuth: async () => {
    try {
      // Server will validate httpOnly cookie automatically
      const { data } = await authApi.me();
      set({ user: data.user, isAuthenticated: true });
    } catch {
      // Not authenticated or invalid session
      set({ socketToken: null, user: null, isAuthenticated: false });
    }
  },

  clearError: () => set({ error: null })
}));
