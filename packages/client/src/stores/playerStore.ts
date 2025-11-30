import { create } from 'zustand';
import { tracksApi } from '@/api/client';
import { connectSocket, playbackEvents } from '@/api/socket';
import { logger } from '@/utils/logger';

// SECURITY: Allowed hosts for stream URLs
const ALLOWED_STREAM_HOSTS = [
  'downloads.khinsider.com',
  'vgmsite.com'
];

// SECURITY: Validate stream URL to prevent loading from untrusted sources
function isValidStreamUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Validate against allowed hosts
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_STREAM_HOSTS.some(
      host => hostname === host || hostname.endsWith(`.${host}`)
    );

    if (!isAllowed) {
      logger.warn('Stream URL from untrusted host:', hostname);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// SECURITY: Known safe error messages from API
// Only allow these exact messages to be displayed to prevent XSS
const SAFE_PLAYER_ERROR_MESSAGES = new Set([
  'Failed to play track',
  'Track not found',
  'Could not get stream URL',
  'Invalid stream URL received',
  'Authentication required',
  'Too many requests, please try again later'
]);

// SECURITY: Sanitize error messages to prevent XSS
function sanitizeErrorMessage(message: unknown): string {
  if (typeof message !== 'string') {
    return 'An error occurred';
  }

  // If it's a known safe message, return it directly
  if (SAFE_PLAYER_ERROR_MESSAGES.has(message)) {
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
    .slice(0, 200);

  return sanitized;
}

interface Track {
  id: number;
  trackNumber: number;
  name: string;
  duration: string;
  pageUrl: string;
  fileSize: string;
  isPlayed: boolean;
  isDownloaded: boolean;
}

interface Album {
  id: number;
  title: string;
  url: string;
  year: string;
  platform: string;
  trackCount: number;
  isFavorite: boolean;
  isDownloaded: boolean;
  slug: string;
}

interface PlayerState {
  currentTrack: Track | null;
  currentAlbum: Album | null;
  playlist: Track[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  audioUrl: string | null;
  isLoading: boolean;
  error: string | null;
  audioElement: HTMLAudioElement | null;
  playRequestId: number; // Track current play request to prevent race conditions

  setAudioElement: (element: HTMLAudioElement | null) => void;
  play: (track: Track, album?: Album, playlist?: Track[]) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  updateTime: (currentTime: number, duration: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  currentAlbum: null,
  playlist: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  audioUrl: null,
  isLoading: false,
  error: null,
  audioElement: null,
  playRequestId: 0,

  setAudioElement: (element) => set({ audioElement: element }),

  play: async (track, album, playlist) => {
    const { audioElement } = get();

    // Generate unique request ID for this play request
    const requestId = Date.now();
    set({ isLoading: true, error: null, playRequestId: requestId });

    try {
      // Connect socket if not already connected
      connectSocket();

      // Get stream URL
      const { data } = await tracksApi.getStreamUrl(track.id);

      // Check if this request is still current (prevents race condition)
      if (get().playRequestId !== requestId) {
        return; // A newer play request has been made, abort this one
      }

      // SECURITY: Validate API response structure and stream URL
      if (!data || !isValidStreamUrl(data.url)) {
        throw new Error('Invalid stream URL received');
      }

      const streamUrl = data.url;

      set({
        currentTrack: track,
        currentAlbum: album ?? get().currentAlbum,
        playlist: playlist ?? get().playlist,
        audioUrl: streamUrl,
        isLoading: false
      });

      // Play audio
      if (audioElement) {
        audioElement.src = streamUrl;
        await audioElement.play();

        // Check again after play() completes
        if (get().playRequestId !== requestId) {
          audioElement.pause();
          return;
        }

        set({ isPlaying: true });
        playbackEvents.play(track.id);
      }

      // Mark as played
      tracksApi.setPlayed(track.id, true);
    } catch (err) {
      // Only set error if this is still the current request
      if (get().playRequestId === requestId) {
        const rawMessage = (err as { response?: { data?: { error?: string } } })
          .response?.data?.error || 'Failed to play track';
        // SECURITY: Sanitize error message before displaying
        set({ error: sanitizeErrorMessage(rawMessage), isLoading: false });
      }
    }
  },

  pause: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      set({ isPlaying: false });
      playbackEvents.pause();
    }
  },

  resume: async () => {
    const { audioElement, currentTrack } = get();
    if (audioElement && currentTrack) {
      try {
        await audioElement.play();
        // Verify the track hasn't changed during async operation
        if (get().currentTrack?.id === currentTrack.id) {
          set({ isPlaying: true });
          playbackEvents.play(currentTrack.id);
        }
      } catch (err) {
        // Handle play() rejection (e.g., user hasn't interacted with page yet)
        logger.error('Resume failed:', err instanceof Error ? err.message : err);
      }
    }
  },

  stop: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      set({
        isPlaying: false,
        currentTime: 0,
        currentTrack: null,
        audioUrl: null
      });
      playbackEvents.stop();
    }
  },

  next: () => {
    const { playlist, currentTrack } = get();
    if (!currentTrack || playlist.length === 0) return;

    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];

    if (nextTrack) {
      get().play(nextTrack);
    }
  },

  previous: () => {
    const { playlist, currentTrack, currentTime } = get();
    if (!currentTrack || playlist.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      get().seek(0);
      return;
    }

    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    const prevIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    const prevTrack = playlist[prevIndex];

    if (prevTrack) {
      get().play(prevTrack);
    }
  },

  seek: (time) => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.currentTime = time;
      set({ currentTime: time });
      playbackEvents.seek(time);
    }
  },

  setVolume: (volume) => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.volume = volume;
    }
    set({ volume });
  },

  updateTime: (currentTime, duration) => {
    set({ currentTime, duration });
    playbackEvents.timeUpdate(currentTime, duration);
  }
}));
