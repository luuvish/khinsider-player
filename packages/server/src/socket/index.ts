/**
 * Socket.IO 서버 설정 및 핸들러
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config, isDevelopment } from '../config/index.js';
import { isTokenBlacklisted } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  playbackPlaySchema,
  playbackSeekSchema,
  playbackTimeUpdateSchema,
  validateSocketData
} from '../validation/socketSchemas.js';

// Types
interface PlaybackState {
  trackId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface SocketData {
  authenticated: boolean;
  user: { userId: number; username: string; exp?: number };
  authToken: string;
  tokenExp?: number;
  revalidationInterval?: ReturnType<typeof setInterval>;
}

interface JwtPayload {
  userId: number;
  username: string;
  exp?: number;
}

/**
 * JWT 페이로드 런타임 검증
 */
function isValidJwtPayload(payload: unknown): payload is JwtPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.userId === 'number' &&
    p.userId > 0 &&
    typeof p.username === 'string' &&
    p.username.length > 0 &&
    (p.exp === undefined || typeof p.exp === 'number')
  );
}

// Constants
const SOCKET_RATE_LIMIT = 100;
const SOCKET_RATE_WINDOW_MS = 60000;
const MAX_SOCKET_PAYLOAD_SIZE = 1024;
const MAX_CONNECTIONS_PER_USER = 5;
const RATE_LIMIT_CLEANUP_THRESHOLD = 1000;
const TOKEN_REVALIDATION_INTERVAL = 60 * 1000;

// State
const userPlaybackState = new Map<string, PlaybackState>();
const socketRateLimits = new Map<string, RateLimitEntry>();
const userConnections = new Map<number, Set<string>>();

let rateLimitCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Rate limit 만료 엔트리 정리
 */
function cleanupExpiredRateLimits(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of socketRateLimits.entries()) {
    if (now > entry.resetTime) {
      socketRateLimits.delete(key);
      removed++;
    }
  }
  return removed;
}

/**
 * Socket rate limit 체크
 */
function checkSocketRateLimit(userId: number): boolean {
  const rateLimitKey = `user:${userId}`;
  const now = Date.now();
  let entry = socketRateLimits.get(rateLimitKey);

  if (!entry || now > entry.resetTime) {
    if (socketRateLimits.size >= RATE_LIMIT_CLEANUP_THRESHOLD) {
      cleanupExpiredRateLimits();
    }

    entry = { count: 1, resetTime: now + SOCKET_RATE_WINDOW_MS };
    socketRateLimits.set(rateLimitKey, entry);
    return true;
  }

  entry.count++;
  return entry.count <= SOCKET_RATE_LIMIT;
}

/**
 * Socket.IO 서버 생성
 */
export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  const allowedOrigins = config.corsOrigin.split(',').map(o => o.trim()).filter(Boolean);

  // Authentication middleware
  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;

    if (!origin) {
      if (!isDevelopment()) {
        logger.warn('Socket.IO connection without Origin header rejected', {
          socketId: socket.id,
          userAgent: socket.handshake.headers['user-agent']
        });
        return next(new Error('Origin header required'));
      }
      logger.debug('Socket.IO connection without Origin header (allowed in development)', {
        socketId: socket.id
      });
    } else if (!allowedOrigins.includes(origin)) {
      logger.warn('Socket.IO origin mismatch rejected', {
        socketId: socket.id,
        origin,
        allowedOrigins
      });
      return next(new Error('Origin not allowed'));
    }

    const token = socket.handshake.auth.token;

    if (!token) {
      logger.warn('Unauthenticated socket connection rejected', {
        socketId: socket.id
      });
      return next(new Error('Authentication required'));
    }

    if (typeof token !== 'string') {
      logger.warn('Invalid socket token type rejected', {
        socketId: socket.id,
        tokenType: typeof token
      });
      return next(new Error('Invalid token format'));
    }

    if (token.length > 2048) {
      logger.warn('Socket token too long', {
        socketId: socket.id,
        tokenLength: token.length
      });
      return next(new Error('Invalid token format'));
    }

    if (isTokenBlacklisted(token)) {
      logger.warn('Socket connection with blacklisted token rejected', {
        socketId: socket.id
      });
      return next(new Error('Token has been invalidated'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256']
      });

      // Runtime validation of JWT payload
      if (!isValidJwtPayload(decoded)) {
        logger.warn('Invalid JWT payload structure', {
          socketId: socket.id
        });
        return next(new Error('Invalid token payload'));
      }

      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        logger.warn('Socket connection with expired token rejected', {
          socketId: socket.id,
          expiredAt: new Date(decoded.exp * 1000).toISOString()
        });
        return next(new Error('Token has expired'));
      }

      const userId = decoded.userId;
      const connections = userConnections.get(userId) || new Set();
      if (connections.size >= MAX_CONNECTIONS_PER_USER) {
        logger.warn('Too many connections for user', { userId, count: connections.size });
        return next(new Error('Too many connections'));
      }

      socket.data.authenticated = true;
      socket.data.user = decoded;
      socket.data.authToken = token;
      socket.data.tokenExp = decoded.exp;
      next();
    } catch {
      logger.warn('Invalid socket authentication token', {
        socketId: socket.id
      });
      return next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    setupSocketHandlers(socket);
  });

  // Start rate limit cleanup interval
  rateLimitCleanupInterval = setInterval(() => {
    const removed = cleanupExpiredRateLimits();
    if (removed > 0) {
      logger.debug('Rate limit cleanup completed', {
        removed,
        remaining: socketRateLimits.size
      });
    }
  }, 30000);

  return io;
}

/**
 * SocketData 런타임 검증
 */
function isValidSocketData(data: unknown): data is SocketData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.authenticated === true &&
    typeof d.user === 'object' &&
    d.user !== null &&
    typeof (d.user as Record<string, unknown>).userId === 'number' &&
    typeof (d.user as Record<string, unknown>).username === 'string' &&
    typeof d.authToken === 'string'
  );
}

/**
 * Socket 이벤트 핸들러 설정
 */
function setupSocketHandlers(socket: Socket): void {
  // Runtime validation of socket data
  if (!isValidSocketData(socket.data)) {
    logger.error('Socket handler called with invalid authentication data', {
      socketId: socket.id
    });
    socket.disconnect(true);
    return;
  }

  const socketData = socket.data;
  const userId = socketData.user.userId;

  // Store token values as constants to prevent race conditions in revalidation
  const authToken = socketData.authToken;
  const tokenExp = socketData.tokenExp;

  // Track connection
  const connections = userConnections.get(userId) || new Set();
  connections.add(socket.id);
  userConnections.set(userId, connections);

  logger.info('Client connected', {
    socketId: socket.id,
    userId,
    username: socketData.user.username,
    connectionCount: connections.size
  });

  // Token re-validation interval using stored constants
  const revalidationInterval = setInterval(() => {
    if (authToken && isTokenBlacklisted(authToken)) {
      logger.info('Socket disconnected: token blacklisted', {
        socketId: socket.id,
        userId
      });
      socket.emit('auth:invalidated', { reason: 'Token has been invalidated' });
      socket.disconnect(true);
      return;
    }

    if (tokenExp && Date.now() >= tokenExp * 1000) {
      logger.info('Socket disconnected: token expired', {
        socketId: socket.id,
        userId
      });
      socket.emit('auth:invalidated', { reason: 'Token has expired' });
      socket.disconnect(true);
      return;
    }
  }, TOKEN_REVALIDATION_INTERVAL);

  socketData.revalidationInterval = revalidationInterval;

  // Initialize playback state
  userPlaybackState.set(socket.id, {
    trackId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0
  });

  // Payload size validation
  const validatePayloadSize = (data: unknown): boolean => {
    try {
      const dataStr = JSON.stringify(data);
      return dataStr.length <= MAX_SOCKET_PAYLOAD_SIZE;
    } catch (error) {
      logger.warn('Socket payload serialization failed', {
        socketId: socket.id,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  };

  // Event handler wrapper
  const handleEvent = <T>(
    handler: (data: T) => void
  ) => (data: T, callback?: (response: { success: boolean; error?: string }) => void) => {
    if (!validatePayloadSize(data)) {
      logger.warn('Socket payload too large', { socketId: socket.id, userId });
      callback?.({ success: false, error: 'Payload too large' });
      return;
    }

    if (!checkSocketRateLimit(userId)) {
      logger.warn('Socket rate limit exceeded', {
        socketId: socket.id,
        userId
      });
      callback?.({ success: false, error: 'Rate limit exceeded' });
      return;
    }

    try {
      handler(data);
      callback?.({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Socket.IO event error', error instanceof Error ? error : undefined, {
        socketId: socket.id,
        userId
      });
      callback?.({ success: false, error: message });
    }
  };

  // Playback events - use immutable state updates
  socket.on('playback:play', handleEvent((data: unknown) => {
    const validated = validateSocketData(playbackPlaySchema, data);
    const state = userPlaybackState.get(socket.id);
    if (state) {
      const newState = { ...state, trackId: validated.trackId, isPlaying: true };
      userPlaybackState.set(socket.id, newState);
      socket.emit('playback:state', newState);
    }
  }));

  socket.on('playback:pause', handleEvent(() => {
    const state = userPlaybackState.get(socket.id);
    if (state) {
      const newState = { ...state, isPlaying: false };
      userPlaybackState.set(socket.id, newState);
      socket.emit('playback:state', newState);
    }
  }));

  socket.on('playback:stop', handleEvent(() => {
    const state = userPlaybackState.get(socket.id);
    if (state) {
      const newState = { ...state, trackId: null, isPlaying: false, currentTime: 0 };
      userPlaybackState.set(socket.id, newState);
      socket.emit('playback:state', newState);
    }
  }));

  socket.on('playback:seek', handleEvent((data: unknown) => {
    const validated = validateSocketData(playbackSeekSchema, data);
    const state = userPlaybackState.get(socket.id);
    if (state) {
      const newState = { ...state, currentTime: validated.time };
      userPlaybackState.set(socket.id, newState);
      socket.emit('playback:state', newState);
    }
  }));

  socket.on('playback:timeUpdate', handleEvent((data: unknown) => {
    const validated = validateSocketData(playbackTimeUpdateSchema, data);
    const state = userPlaybackState.get(socket.id);
    if (state) {
      const newState = { ...state, currentTime: validated.currentTime, duration: validated.duration };
      userPlaybackState.set(socket.id, newState);
    }
  }));

  socket.on('playback:getState', handleEvent(() => {
    const state = userPlaybackState.get(socket.id);
    socket.emit('playback:state', state ? { ...state } : null);
  }));

  socket.on('disconnect', (reason) => {
    if (socketData.revalidationInterval) {
      clearInterval(socketData.revalidationInterval);
    }

    const userConns = userConnections.get(userId);
    if (userConns) {
      userConns.delete(socket.id);
      if (userConns.size === 0) {
        userConnections.delete(userId);
      }
    }

    logger.info('Client disconnected', {
      socketId: socket.id,
      userId,
      reason,
      remainingConnections: userConns?.size || 0
    });
    userPlaybackState.delete(socket.id);
  });

  socket.on('error', (error) => {
    logger.error('Socket error', error, {
      socketId: socket.id,
      userId
    });
  });
}

/**
 * Socket 리소스 정리
 */
export function cleanupSocketResources(): void {
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = null;
  }
  socketRateLimits.clear();
  userPlaybackState.clear();
  userConnections.clear();
}
