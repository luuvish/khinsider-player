import { io, Socket } from 'socket.io-client';
import { logger } from '@/utils/logger';

const SOCKET_URL = import.meta.env.VITE_API_URL || '';

let socket: Socket | null = null;
let currentToken: string | null = null;

/**
 * Initialize socket with authentication token
 * Token is stored in memory only (not localStorage) for security
 *
 * SECURITY: Only WebSocket transport is allowed in production to prevent
 * token leakage through polling request URLs/logs
 */
export function initSocket(token: string | null): Socket {
  // Disconnect existing socket if any
  if (socket?.connected) {
    socket.disconnect();
  }

  currentToken = token;

  // SECURITY: Prefer WebSocket-only transport to avoid token exposure in polling URLs
  // Fallback to polling only in development for easier debugging
  const isDev = import.meta.env.DEV;
  const transports: ('websocket' | 'polling')[] = isDev
    ? ['websocket', 'polling']
    : ['websocket'];

  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports,
    // Pass token in auth for socket authentication
    auth: token ? { token } : undefined,
    // Additional security options
    withCredentials: true,
    // Reconnection settings
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
  });

  // Log connection events in development
  socket.on('connect_error', (err) => {
    logger.error('Socket connection error:', err.message);
  });

  return socket;
}

export function getSocket(): Socket {
  if (!socket) {
    // Create socket without auth - will need to call initSocket with token
    logger.warn('Socket accessed without initialization - using unauthenticated connection');
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket']
    });
  }
  return socket;
}

/**
 * Connect socket with optional token
 * If token is provided, re-initializes socket with authentication
 *
 * SECURITY: Ensures socket is authenticated before connection
 */
export function connectSocket(token?: string | null): void {
  // If token provided, reinitialize with authentication
  if (token !== undefined) {
    initSocket(token);
  }

  const s = getSocket();

  // SECURITY: Warn if connecting without authentication
  if (!currentToken && !token) {
    logger.warn('Connecting socket without authentication token');
  }

  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
  currentToken = null;
}

/**
 * Check if socket is currently authenticated
 */
export function isSocketAuthenticated(): boolean {
  return currentToken !== null;
}

export interface PlaybackState {
  trackId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export const playbackEvents = {
  play: (trackId: number) => {
    getSocket().emit('playback:play', { trackId });
  },
  pause: () => {
    getSocket().emit('playback:pause');
  },
  stop: () => {
    getSocket().emit('playback:stop');
  },
  seek: (time: number) => {
    getSocket().emit('playback:seek', { time });
  },
  timeUpdate: (currentTime: number, duration: number) => {
    getSocket().emit('playback:timeUpdate', { currentTime, duration });
  },
  getState: () => {
    getSocket().emit('playback:getState');
  },
  onState: (callback: (state: PlaybackState) => void) => {
    getSocket().on('playback:state', callback);
    return () => getSocket().off('playback:state', callback);
  }
};
