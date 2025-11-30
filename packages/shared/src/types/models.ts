import type { Readable } from 'stream';

// Database models (snake_case to match SQLite columns)

export interface Album {
  id: number;
  slug: string;
  title: string;
  url: string;
  year: string | null;
  platform: string | null;
  cover_url: string | null;
  local_path: string | null;
  is_favorite: number;
  is_downloaded: number;
  is_played: number;
  track_count: number;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: number;
  album_id: number;
  track_number: number | null;
  name: string;
  duration: string | null;
  page_url: string | null;
  download_url: string | null;
  local_path: string | null;
  file_size: string | null;
  is_downloaded: number;
  is_played: number;
  created_at: string;
}

export interface TrackWithAlbum extends Track {
  album_title: string;
  album_year: string | null;
  album_slug: string;
}

export interface PlayHistory {
  id: number;
  track_id: number | null;
  album_id: number | null;
  album_title: string;
  track_name: string;
  played_at: string;
}

export interface PlaybackStateRow {
  id: number;
  mode: string;
  current_year: string | null;
  current_album_id: number | null;
  current_track_id: number | null;
  year_album_index: number;
  album_track_index: number;
  nav_selected_index: number;
  nav_expanded_years: string | null;
  nav_expanded_albums: string | null;
  updated_at: string;
}

export interface UserSettings {
  key: string;
  value: string | null;
  updated_at: string;
}

export interface YearInfo {
  year: string;
  album_count: number;
}

export interface Credentials {
  username: string;
  password: string;
}

// Scraper response types

export interface SearchResult {
  title: string;
  url: string;
  platform: string;
  type: string;
  year: string;
}

export interface AlbumInfo {
  images: string[];
  metadata: Record<string, string>;
  metadataLines?: Array<{ label: string; value: string }>;
}

export interface ScrapedTrack {
  name: string;
  duration: string;
  size: string;
  mp3Size: string;
  flacSize: string;
  pageUrl: string;
}

export interface TrackUrls {
  mp3: string | null;
  flac: string | null;
}

export interface BulkDownloadUrls {
  mp3Url: string | null;
  flacUrl: string | null;
}

// Playback types

// Type-safe playback states (matches PlaybackState constant values)
export type PlaybackStateType = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// Type-safe playback modes (matches PlaybackMode constant values)
export type PlaybackModeType = 'idle' | 'album' | 'year_sequential';

export interface TrackInfo {
  id?: number;
  name: string;
  duration?: string | null;
  albumTitle?: string;
}

export interface PlaybackStatus {
  state: PlaybackStateType;
  mode: PlaybackModeType;
  currentYear: string | null;
  yearAlbumIndex: number;
  totalYearAlbums: number;
  currentAlbum: Album | null;
  currentTrackIndex: number;
  totalTracks: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  isPaused: boolean;
}

// Download types

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export interface DownloadedFiles {
  cover: string | null;
  mp3Zip: string | null;
  flacZip: string | null;
}

export interface AlbumMetadata {
  version: number;
  albumSlug: string;
  title: string;
  url: string;
  year: string;
  platform?: string;
  coverUrl?: string;
  downloadedAt: string;
  albumId?: number;
  files: DownloadedFiles;
}

// Navigation types

export interface NavItem {
  type: 'year' | 'album' | 'track';
  year?: string;
  album?: Album;
  track?: Track;
  trackIndex?: number;
  text: string;
}

export interface NavPosition {
  selectedIndex: number;
  expandedYears: string[];
  expandedAlbums: number[];
}

export interface LastPosition {
  year: string | null;
  albumId: number | null;
  trackId: number | null;
  yearAlbumIndex: number;
  albumTrackIndex: number;
}

// Count/ID result types for SQL queries

export interface CountRow {
  count: number;
}

export interface IdRow {
  id: number;
}

// Stream response type for downloads
export interface StreamResponse {
  data: Readable;
  headers: Record<string, string>;
  status: number;
}

// Login result type
export interface LoginResult {
  success: boolean;
}

// Scraper interface for dependency injection
export interface IKhinsiderScraper {
  baseUrl: string;
  isLoggedIn: boolean;
  login(username: string, password: string): Promise<LoginResult>;
  logout(): Promise<void>;
  checkLoginStatus(): Promise<boolean>;
  getYears(): Promise<string[]>;
  getAlbumsByYear(year: string): Promise<Array<{ title: string; url: string; platform?: string }>>;
  getAlbumInfo(albumUrl: string): Promise<AlbumInfo>;
  getAlbumTracks(albumUrl: string): Promise<ScrapedTrack[]>;
  getTrackDirectUrl(trackPageUrl: string): Promise<TrackUrls>;
  getBulkDownloadUrls(albumUrl: string): Promise<BulkDownloadUrls>;
  searchAlbums(query: string): Promise<SearchResult[]>;
  getRecentAlbums(): Promise<Array<{ title: string; url: string }>>;
  makeStreamRequest(url: string, options?: Record<string, unknown>): Promise<StreamResponse>;
}

// Listener types for event handling
export type EventListener = (...args: unknown[]) => void;

// Player event data types
export interface PlayEventData {
  track: TrackInfo;
}

export interface ErrorEventData {
  message: string;
  track?: TrackInfo;
  error?: Error;
}

// Playback controller event data types
export interface TrackStartEventData {
  track: Track;
  album: Album | null;
  trackIndex: number;
  totalTracks: number;
}

export interface TrackCompletedEventData {
  track: Track;
  album: Album | null;
}

export interface AlbumEventData {
  album: Album;
}

export interface AlbumLoadedEventData {
  album: Album;
  trackCount: number;
}

export interface YearEventData {
  year: string;
}

export interface YearLoadedEventData {
  year: string;
  albumCount: number;
}

// Download event data types
export interface DownloadEventData {
  album: Album;
}

export interface DownloadProgressEventData {
  album: Album;
  format: string;
  percent?: number;
}

export interface DownloadErrorEventData {
  album: Album;
  error: Error;
}
