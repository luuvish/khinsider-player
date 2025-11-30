import axios, { AxiosError } from 'axios';
import { logger } from '@/utils/logger';

const API_URL = import.meta.env.VITE_API_URL || '';

// CSRF token storage (in-memory only for security)
let csrfToken: string | null = null;
let csrfTokenInitialized = false;

// SECURITY: In-memory redirect path storage (not sessionStorage to prevent XSS manipulation)
let pendingRedirectPath: string | null = null;

// SECURITY: Strict regex patterns for allowed redirect paths
const ALLOWED_REDIRECT_PATTERNS = [
  /^\/$/,                           // Home
  /^\/year\/\d{4}$/,                // Year pages (4-digit year only)
  /^\/album\/\d+$/,                 // Album pages (numeric ID only)
  /^\/search$/,                     // Search page
  /^\/favorites$/,                  // Favorites page
];

/**
 * Validate redirect path to prevent open redirect attacks
 * Uses strict regex patterns instead of prefix matching
 */
function isValidRedirectPath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  // Must start with / and not be protocol-relative
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false;
  }

  // Block URLs with protocols or suspicious characters
  if (path.includes(':') || path.includes('\\') || path.includes('\0')) {
    return false;
  }

  // Must match one of the strict patterns
  return ALLOWED_REDIRECT_PATTERNS.some(pattern => pattern.test(path));
}

/**
 * Get pending redirect path (memory-only, XSS-safe)
 */
export function getPendingRedirectPath(): string | null {
  const path = pendingRedirectPath;
  pendingRedirectPath = null; // Clear after retrieval
  return path;
}

/**
 * Check if CSRF token is available
 */
export function hasCsrfToken(): boolean {
  return csrfToken !== null && csrfTokenInitialized;
}

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  },
  // Enable cookies for httpOnly token authentication
  withCredentials: true,
  // Request timeout to prevent hanging
  timeout: 30000
});

// Request interceptor to add CSRF token to state-changing requests
api.interceptors.request.use(
  (config) => {
    // Add CSRF token to POST, PUT, PATCH, DELETE requests
    if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    // Also add X-Requested-With for additional CSRF protection
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error: string }>) => {
    if (error.response?.status === 401) {
      // Clear CSRF token on auth failure
      csrfToken = null;
      csrfTokenInitialized = false;
      // Store current location for redirect after login (in-memory, not sessionStorage)
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
        // SECURITY: Only store validated paths to prevent open redirect
        if (isValidRedirectPath(currentPath)) {
          pendingRedirectPath = currentPath;
        }
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Initialize CSRF token from server with retry logic
 * Should be called on app initialization
 */
export async function initializeCsrfToken(): Promise<void> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await api.get('/auth/csrf-token');
      const token = response.data?.token;

      // SECURITY: Validate CSRF token format before storing
      if (!token || typeof token !== 'string' || token.length !== 64) {
        logger.error('Invalid CSRF token format received');
        if (attempt === MAX_RETRIES) {
          csrfToken = null;
          csrfTokenInitialized = true; // Mark as initialized even on failure
          return;
        }
        continue;
      }

      // Validate token contains only hex characters
      if (!/^[a-f0-9]+$/i.test(token)) {
        logger.error('CSRF token contains invalid characters');
        if (attempt === MAX_RETRIES) {
          csrfToken = null;
          csrfTokenInitialized = true;
          return;
        }
        continue;
      }

      csrfToken = token;
      csrfTokenInitialized = true;
      logger.debug('CSRF token initialized');
      return;
    } catch (err) {
      logger.error(`Failed to initialize CSRF token (attempt ${attempt}/${MAX_RETRIES}):`, err);
      if (attempt < MAX_RETRIES) {
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }
    }
  }

  // All retries failed
  csrfToken = null;
  csrfTokenInitialized = true;
  logger.error('CSRF token initialization failed after all retries');
}

/**
 * Clear CSRF token (call on logout)
 */
export function clearCsrfToken(): void {
  csrfToken = null;
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  register: (username: string, password: string) =>
    api.post('/auth/register', { username, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout')
};

// Albums API
export const albumsApi = {
  getYears: (signal?: AbortSignal) => api.get('/albums/years', { signal }),
  getByYear: (year: string, refresh = false, signal?: AbortSignal) =>
    api.get(`/albums/year/${year}`, { params: { refresh: refresh ? 'true' : undefined }, signal }),
  getById: (id: number, signal?: AbortSignal) => api.get(`/albums/${id}`, { signal }),
  getTracks: (id: number, refresh = false, signal?: AbortSignal) =>
    api.get(`/albums/${id}/tracks`, { params: { refresh: refresh ? 'true' : undefined }, signal }),
  toggleFavorite: (id: number) => api.post(`/albums/${id}/favorite`),
  getFavorites: (signal?: AbortSignal) => api.get('/albums/favorites/list', { signal })
};

// Tracks API
export const tracksApi = {
  getById: (id: number) => api.get(`/tracks/${id}`),
  getStreamUrl: (id: number) => api.get(`/tracks/${id}/stream-url`),
  setPlayed: (id: number, played?: boolean) =>
    api.post(`/tracks/${id}/played`, { played })
};

// Search API
export const searchApi = {
  search: (query: string) => api.get('/search', { params: { q: query } })
};
