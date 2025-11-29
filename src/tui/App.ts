import blessed from 'blessed';
import { NavigationPanel, type NavigationSelectData } from './panels/NavigationPanel.js';
import { NowPlayingPanel } from './panels/NowPlayingPanel.js';
import { FavoritesPanel, type FavoritesSelectData } from './panels/FavoritesPanel.js';
import { HistoryPanel } from './panels/HistoryPanel.js';
import { StatusBar } from './panels/StatusBar.js';
import { TitleBar } from './panels/TitleBar.js';
import { helpText } from './utils/keyBindings.js';
import { showLoginForm } from './utils/loginForm.js';
import { settingsRepo } from '../data/repositories/settings-repo.js';
import type {
  IKhinsiderScraper,
  Album,
  AlbumInfo,
  YearInfo,
  TrackStartEventData,
  TrackCompletedEventData,
  AlbumEventData,
  AlbumLoadedEventData,
  YearEventData,
  YearLoadedEventData,
  ErrorEventData,
  DownloadEventData,
  DownloadProgressEventData,
  DownloadErrorEventData
} from '../types/index.js';
import type { PlaybackController } from '../playback/controller.js';
import type { AlbumRepository } from '../data/repositories/album-repo.js';
import type { TrackRepository } from '../data/repositories/track-repo.js';
import type { AlbumDownloader } from '../storage/downloader.js';

// Helper to safely extract error message from any error type
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

type EventListener = (...args: unknown[]) => void;

interface AppPanels {
  titleBar: TitleBar;
  navigation: NavigationPanel;
  nowPlaying: NowPlayingPanel;
  favorites: FavoritesPanel;
  history: HistoryPanel;
  statusBar: StatusBar;
}

interface AppOptions {
  scraper?: IKhinsiderScraper;
  playbackController?: PlaybackController;
  albumRepo?: AlbumRepository;
  trackRepo?: TrackRepository;
  downloader?: AlbumDownloader;
}

export class App {
  scraper!: IKhinsiderScraper;
  playbackController!: PlaybackController;
  albumRepo!: AlbumRepository;
  trackRepo!: TrackRepository;
  downloader!: AlbumDownloader;
  screen: blessed.Widgets.Screen | null;
  panels!: AppPanels;
  focusedPanel: string;
  isInitialized: boolean;
  dialogActive: boolean;
  _activeDialogCleanup: (() => void) | null;
  _globalKeyHandler: ((ch: string, key: blessed.Widgets.KeyEventData) => void) | null;
  _pcListeners: Record<string, EventListener> | null;
  _dlListeners: Record<string, EventListener> | null;
  _backgroundPromises: Promise<void>[];

  constructor(options: AppOptions = {}) {
    this.scraper = options.scraper!;
    this.playbackController = options.playbackController!;
    this.albumRepo = options.albumRepo!;
    this.trackRepo = options.trackRepo!;
    this.downloader = options.downloader!;

    this.screen = null;
    this.panels = {} as AppPanels;
    this.focusedPanel = 'navigation';
    this.isInitialized = false;
    this.dialogActive = false;
    this._activeDialogCleanup = null; // Track active dialog cleanup function
    this._globalKeyHandler = null;
    this._pcListeners = null;
    this._dlListeners = null;
    this._backgroundPromises = [];
  }

  async initialize() {
    this.createScreen();
    this.createPanels();
    this.setupKeyBindings();
    this.setupPlaybackEvents();
    await this.tryAutoLogin();
    await this.loadInitialData();
    this.isInitialized = true;
  }

  async tryAutoLogin() {
    const credentials = settingsRepo.getCredentials();
    if (credentials) {
      this.panels.statusBar.showInfo('Logging in...');
      try {
        await this.scraper.login(credentials.username, credentials.password);
        this.panels.statusBar.showSuccess('Logged in as ' + credentials.username);
        this.panels.history.logInfo('Logged in as ' + credentials.username);
        this.updateLoginStatus();
      } catch (error: unknown) {
        this.panels.statusBar.showError('Auto-login failed: ' + getErrorMessage(error));
        this.panels.history.logError('Auto-login failed');
      }
    }
  }

  updateLoginStatus(): void {
    const isLoggedIn = this.scraper.isLoggedIn;
    const credentials = settingsRepo.getCredentials();
    const username = credentials?.username || '';
    this.panels.titleBar.setLoginStatus(isLoggedIn, username);
  }

  createScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Khinsider Player',
      fullUnicode: true,
      warnings: false
    });
  }

  createPanels() {
    // Title Bar - top (100% x 1)
    this.panels.titleBar = new TitleBar(this.screen);

    // Navigation Panel - top left (50% x 50%-1)
    this.panels.navigation = new NavigationPanel(this.screen, {
      onYearSelect: (year) => this.handleYearSelect(year),
      onAlbumSelect: (album) => this.handleAlbumSelect(album),
      onSelect: (data) => this.handleNavigationSelect(data)
    });
    this.panels.navigation.box.top = 1;
    this.panels.navigation.box.left = 0;
    this.panels.navigation.box.width = '50%';
    this.panels.navigation.box.height = '50%-1';

    // Favorites Panel - top right (50% x 50%-1)
    this.panels.favorites = new FavoritesPanel(this.screen, {
      albumRepo: this.albumRepo,
      onSelect: (data) => this.handleFavoriteSelect(data),
      onAlbumSelect: (album) => this.handleFavoriteAlbumSelect(album)
    });
    this.panels.favorites.box.top = 1;
    this.panels.favorites.box.left = '50%';
    this.panels.favorites.box.width = '50%';
    this.panels.favorites.box.height = '50%-1';

    // Now Playing Panel - middle (100% x 15 lines)
    this.panels.nowPlaying = new NowPlayingPanel(this.screen);
    this.panels.nowPlaying.box.top = '50%';
    this.panels.nowPlaying.box.left = 0;
    this.panels.nowPlaying.box.width = '100%';
    this.panels.nowPlaying.box.height = 15;

    // History Panel - below now playing, above status bar
    this.panels.history = new HistoryPanel(this.screen);
    this.panels.history.box.top = '50%+15';
    this.panels.history.box.left = 0;
    this.panels.history.box.width = '100%';
    this.panels.history.box.bottom = 3;

    // Status Bar - bottom (100% x 3)
    this.panels.statusBar = new StatusBar(this.screen);

    // Initial focus
    this.focusPanel('navigation');
  }

  setupKeyBindings() {
    // Global keys - use program.on to capture before widgets
    // Store handler reference for cleanup
    this._globalKeyHandler = (ch, key) => {
      if (!key) return;

      // Skip global keys when dialog is active or textbox/input is focused
      if (this.dialogActive) {
        return;
      }
      const focused = this.screen.focused;
      if (focused && (focused.type === 'textbox' || focused.type === 'textarea')) {
        return;
      }

      // Quit: q or Ctrl-c
      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        this.quit();
        return;
      }

      // Help: ?
      if (ch === '?') {
        this.showHelp();
        return;
      }

      // Playback: space
      if (key.name === 'space') {
        this.togglePause();
        return;
      }

      // Favorite: f
      if (key.name === 'f') {
        this.toggleFavorite().catch(err => {
          this.panels.statusBar?.showError(`Favorite error: ${err?.message || 'Unknown error'}`);
        });
        return;
      }

      // Refresh: r
      if (key.name === 'r') {
        this.refreshCurrent().catch(err => {
          this.panels.statusBar?.showError(`Refresh error: ${err?.message || 'Unknown error'}`);
        });
        return;
      }

      // Toggle played: p
      if (key.name === 'p') {
        this.togglePlayed();
        return;
      }

      // Toggle images: i
      if (key.name === 'i') {
        this.panels.nowPlaying.toggleImages();
        return;
      }

      // Login: L (shift+l)
      if (ch === 'L' || (key.shift && key.name === 'l')) {
        this.showLoginDialog();
        return;
      }

      // Download: d
      if (key.name === 'd') {
        this.handleDownload().catch(err => {
          this.panels.statusBar?.showError(`Download error: ${err?.message || 'Unknown error'}`);
        });
        return;
      }

      // Tab to switch focus between panels
      if (key.name === 'tab' && !key.shift) {
        this.cycleFocus();
        return;
      }

      if (key.name === 'tab' && key.shift) {
        this.cycleFocusReverse();
        return;
      }
    };

    this.screen.program.on('keypress', this._globalKeyHandler);
  }

  focusPanel(panelName: string): void {
    // Blur current panel
    if (this.focusedPanel === 'navigation') {
      this.panels.navigation.blur();
    } else if (this.focusedPanel === 'favorites') {
      this.panels.favorites.blur();
    } else if (this.focusedPanel === 'history') {
      this.panels.history.blur();
    }

    // Focus new panel
    this.focusedPanel = panelName;
    if (panelName === 'navigation') {
      this.panels.navigation.focus();
    } else if (panelName === 'favorites') {
      this.panels.favorites.focus();
    } else if (panelName === 'history') {
      this.panels.history.focus();
    }

    this.screen.render();
  }

  cycleFocus() {
    const order = ['navigation', 'favorites'];
    const currentIndex = order.indexOf(this.focusedPanel);
    const nextIndex = (currentIndex + 1) % order.length;
    this.focusPanel(order[nextIndex]);
  }

  cycleFocusReverse() {
    const order = ['navigation', 'favorites'];
    const currentIndex = order.indexOf(this.focusedPanel);
    const prevIndex = (currentIndex - 1 + order.length) % order.length;
    this.focusPanel(order[prevIndex]);
  }

  setupPlaybackEvents() {
    const pc = this.playbackController;

    // Store bound listeners for cleanup
    this._pcListeners = {
      loading: () => {
        this.panels.nowPlaying.setLoading();
        this.panels.history.logInfo('Loading track...');
      },
      trackStart: (data: unknown) => {
        const d = data as TrackStartEventData;
        this.panels.nowPlaying.setPlaying(
          d.track,
          d.album,
          d.trackIndex,
          d.totalTracks
        );

        const status = pc.getStatus();
        if (status.mode === 'year_sequential') {
          this.panels.nowPlaying.update({
            year: status.currentYear,
            albumIndex: status.yearAlbumIndex,
            totalAlbums: status.totalYearAlbums
          });
        }

        this.panels.history.logPlay(`${d.track.name}`);
      },
      trackCompleted: (data: unknown) => {
        const d = data as TrackCompletedEventData;
        this.panels.navigation.markTrackCompleted(d.track.id, d.album?.id);
        this.panels.history.logInfo(`Completed: ${d.track.name}`);
      },
      paused: () => {
        this.panels.nowPlaying.setPaused();
        this.panels.history.logPause('Paused');
      },
      resumed: () => {
        this.panels.nowPlaying.update({ state: 'playing' });
        this.panels.history.logPlay('Resumed');
      },
      stopped: () => {
        this.panels.nowPlaying.setIdle();
        this.panels.history.logStop('Stopped');
      },
      error: (data: unknown) => {
        const d = data as ErrorEventData;
        this.panels.statusBar.showError(d.message || 'Playback error');
        this.panels.nowPlaying.setError(d.message || 'Playback error');
        this.panels.history.logError(d.message || 'Playback error');
      },
      albumChange: (data: unknown) => {
        const d = data as AlbumEventData;
        this.panels.nowPlaying.setAlbum(d.album);
        this.panels.statusBar.showInfo(`Now playing album: ${d.album.title}`);
        this.panels.history.logInfo(`Album: ${d.album.title}`);
      },
      albumComplete: (data: unknown) => {
        const d = data as AlbumEventData;
        this.panels.statusBar.showInfo(`Album complete: ${d.album.title}`);
      },
      yearComplete: (data: unknown) => {
        const d = data as YearEventData;
        this.panels.statusBar.showSuccess(`Year ${d.year} complete!`);
        this.panels.nowPlaying.setIdle();
      },
      loadingYear: (data: unknown) => {
        const d = data as YearEventData;
        this.panels.statusBar.showInfo(`Loading albums for ${d.year}...`);
      },
      yearLoaded: (data: unknown) => {
        const d = data as YearLoadedEventData;
        this.panels.statusBar.showInfo(`Loaded ${d.albumCount} albums for ${d.year}`);
      },
      loadingAlbum: (data: unknown) => {
        const d = data as AlbumEventData;
        this.panels.statusBar.showInfo(`Loading tracks for ${d.album.title}...`);
      },
      albumLoaded: (data: unknown) => {
        const d = data as AlbumLoadedEventData;
        this.panels.statusBar.showInfo(`Loaded ${d.trackCount} tracks`);
      }
    };

    // Register listeners
    for (const [event, handler] of Object.entries(this._pcListeners)) {
      pc.on(event, handler);
    }

    // Downloader events
    if (this.downloader) {
      this._dlListeners = {
        start: (data: unknown) => {
          const d = data as DownloadEventData;
          this.panels.statusBar.showInfo(`Downloading: ${d.album.title}`);
          this.panels.history.logDownload(`Started: ${d.album.title}`);
        },
        zipProgress: (data: unknown) => {
          const d = data as DownloadProgressEventData;
          const formatStr = d.format?.toUpperCase() || '';
          if (d.percent !== undefined) {
            this.panels.statusBar.showInfo(`Downloading ${formatStr}: ${d.percent}%`);
          }
        },
        zipComplete: (data: unknown) => {
          const d = data as DownloadProgressEventData;
          const formatStr = d.format?.toUpperCase() || '';
          this.panels.history.logDownload(`Downloaded: ${formatStr}.zip`);
        },
        complete: (data: unknown) => {
          const d = data as DownloadEventData;
          this.panels.statusBar.showSuccess(`Download complete: ${d.album.title}`);
          this.panels.favorites.refresh();
          this.panels.history.logDownload(`Complete: ${d.album.title}`);
        },
        error: (data: unknown) => {
          const d = data as DownloadErrorEventData;
          const errorMsg = d?.error?.message || 'Unknown error';
          this.panels.statusBar.showError(`Download failed: ${errorMsg}`);
          this.panels.history.logError(`Download failed: ${errorMsg}`);
        }
      };

      for (const [event, handler] of Object.entries(this._dlListeners)) {
        this.downloader.on(event, handler);
      }
    }
  }

  async loadInitialData() {
    this.panels.statusBar.showInfo('Loading years from web...');

    try {
      // Get years from database for album counts
      const dbYears = (this.albumRepo.getYears() || []) as YearInfo[];
      const dbYearMap = new Map(dbYears.map(y => [y.year, y.album_count]));

      // Fetch actual year list from web
      const webYears = await this.scraper.getYears();

      let years;
      if (webYears.length > 0) {
        years = webYears.map(y => ({
          year: y,
          album_count: dbYearMap.get(y) || 0
        }));
      } else {
        // Fallback: generate year list (current year to 1975 + 0000)
        const currentYear = new Date().getFullYear();
        years = [];
        for (let y = currentYear; y >= 1975; y--) {
          const yearStr = String(y);
          years.push({
            year: yearStr,
            album_count: dbYearMap.get(yearStr) || 0
          });
        }
        years.push({ year: '0000', album_count: dbYearMap.get('0000') || 0 });
      }

      this.panels.navigation.setYears(years);
      this.panels.favorites.refresh();
      this.panels.statusBar.reset();
      this.panels.history.logInfo('Application started');

      // Restore last position
      await this.panels.navigation.restoreLastPosition();
    } catch {
      this.panels.statusBar.showError('Failed to load years');
      this.panels.history.logError('Failed to load years');
    }
  }

  async handleYearSelect(year: string): Promise<void> {
    this.panels.statusBar.showInfo(`Loading albums for ${year}...`);

    try {
      // Check database first
      let albums = this.albumRepo.getByYear(year);

      // If no albums in DB, fetch from web (all pages)
      if (albums.length === 0) {
        this.panels.statusBar.showInfo(`Fetching all albums for ${year} (may take a moment)...`);
        const webAlbums = await this.scraper.getAlbumsByYear(year);
        for (const album of webAlbums) {
          this.albumRepo.upsert({
            title: album.title,
            url: album.url,
            year: year,
            platform: album.platform
          });
        }
        albums = this.albumRepo.getByYear(year);
        this.panels.statusBar.showSuccess(`Loaded ${albums.length} albums for ${year}`);
      }

      this.panels.navigation.setAlbumsForYear(year, albums);
      this.panels.navigation.updateYearAlbumCount(year, albums.length);
      this.panels.statusBar.reset();
    } catch {
      this.panels.statusBar.showError(`Failed to load albums for ${year}`);
    }
  }

  async handleAlbumSelect(album: Album): Promise<void> {
    this.panels.nowPlaying.setAlbum(album);
    this.panels.statusBar.showInfo(`Loading tracks for ${album.title}...`);

    try {
      // Check database first
      let tracks = this.trackRepo.getByAlbumId(album.id);

      // If no tracks in DB, fetch from web
      if (tracks.length === 0) {
        const webTracks = await this.scraper.getAlbumTracks(album.url);

        if (webTracks.length === 0) {
          this.panels.statusBar.showError('No tracks found - try refreshing with [r]');
          return;
        }

        const tracksToInsert = webTracks.map((t, i) => ({
          albumId: album.id,
          trackNumber: i + 1,
          name: t.name,
          duration: t.duration,
          pageUrl: t.pageUrl,
          fileSize: t.mp3Size
        }));
        this.trackRepo.createMany(tracksToInsert);
        tracks = this.trackRepo.getByAlbumId(album.id);

        // Update album track count
        this.albumRepo.update(album.id, { trackCount: tracks.length });
      }

      this.panels.navigation.setTracksForAlbum(album.id, tracks);

      // Fetch album info (images, metadata) in background
      const albumInfoPromise = this.scraper.getAlbumInfo(album.url).then((info: AlbumInfo) => {
        // Check if app is still initialized before updating UI
        if (this.isInitialized && this.panels?.nowPlaying) {
          try {
            this.panels.nowPlaying.setAlbumInfo(info);
          } catch {
            // Ignore UI update errors - panel may be in bad state
          }
        }
      }).catch((error: unknown) => {
        // Safely log error - don't let logging failure cause unhandled rejection
        if (this.isInitialized && this.panels?.history) {
          try {
            this.panels.history.logError(`Failed to load album info: ${getErrorMessage(error)}`);
          } catch {
            // Ignore logging errors - panel may be destroyed
          }
        }
      });
      this._backgroundPromises.push(albumInfoPromise);

      this.panels.statusBar.reset();
    } catch {
      this.panels.statusBar.showError(`Failed to load tracks`);
    }
  }

  async handleNavigationSelect(data: NavigationSelectData): Promise<void> {
    if (data.type === 'track') {
      // Play album starting from selected track
      await this.playbackController.playAlbum(data.album, data.trackIndex);
    }
  }

  async handleFavoriteSelect(data: FavoritesSelectData): Promise<void> {
    if (data.type === 'track' && data.track) {
      // Play album starting from selected track
      this.panels.statusBar.showInfo(`Playing: ${data.track.name}`);
      await this.playbackController.playAlbum(data.album, data.trackIndex);
    }
  }

  async handleFavoriteAlbumSelect(album: Album) {
    // Update Now Playing panel with album info
    this.panels.nowPlaying.setAlbum(album);

    // Fetch album info in background with proper tracking
    const albumInfoPromise = this.scraper.getAlbumInfo(album.url).then((info: AlbumInfo) => {
      // Check isInitialized to prevent updates after quit
      if (this.isInitialized && this.panels?.nowPlaying) {
        this.panels.nowPlaying.setAlbumInfo(info);
      }
    }).catch((error: unknown) => {
      if (this.isInitialized && this.panels?.history) {
        try {
          this.panels.history.logError(`Failed to load album info: ${getErrorMessage(error)}`);
        } catch {
          // Ignore logging errors during shutdown
        }
      }
    });

    // Track promise for cleanup during quit
    this._backgroundPromises.push(albumInfoPromise);
  }

  togglePause() {
    const status = this.playbackController.getStatus();
    if (status.isPlaying || status.isPaused) {
      this.playbackController.togglePause();
    }
  }

  togglePlayed() {
    const item = this.panels.navigation.getSelectedItem();
    if (!item) return;

    if (item.type === 'track') {
      const albumId = this.panels.navigation.selectedAlbum?.id;
      this.panels.navigation.toggleTrackPlayed(item.track.id, albumId);
      const isPlayed = this.panels.navigation.playedTracks.has(item.track.id);
      this.panels.statusBar.showInfo(
        isPlayed ? `Marked as played: ${item.track.name}` : `Unmarked: ${item.track.name}`
      );
    } else if (item.type === 'album') {
      this.panels.navigation.toggleAlbumPlayed(item.album.id);
      const isPlayed = this.panels.navigation.playedAlbums.has(item.album.id);
      this.panels.statusBar.showInfo(
        isPlayed ? `Marked album as played: ${item.album.title}` : `Unmarked album: ${item.album.title}`
      );
    }
  }

  async stop() {
    await this.playbackController.stop();
    this.panels.nowPlaying.setIdle();
  }

  async refreshCurrent() {
    // Handle refresh based on focused panel
    if (this.focusedPanel === 'favorites') {
      const item = this.panels.favorites.getSelectedItem();
      if (!item) return;

      if (item.type === 'album') {
        await this.refreshAlbum(item.album);
      } else if (item.type === 'track') {
        if (this.panels.favorites.selectedAlbum) {
          await this.refreshAlbum(this.panels.favorites.selectedAlbum);
        }
      }
      return;
    }

    // Default: navigation panel
    const nav = this.panels.navigation;
    const items = nav.getListItems();
    const index = nav.list.selected;
    const item = items[index];

    if (!item) return;

    if (item.type === 'year') {
      await this.refreshYear(item.year);
    } else if (item.type === 'album') {
      await this.refreshAlbum(item.album);
    } else if (item.type === 'track') {
      // Refresh parent album
      if (nav.selectedAlbum) {
        await this.refreshAlbum(nav.selectedAlbum);
      }
    }
  }

  async refreshYear(year: string): Promise<void> {
    this.panels.statusBar.showInfo(`Fetching all albums for ${year} (may take a moment)...`);

    try {
      const webAlbums = await this.scraper.getAlbumsByYear(year);
      for (const album of webAlbums) {
        this.albumRepo.upsert({
          title: album.title,
          url: album.url,
          year: year,
          platform: album.platform
        });
      }
      const albums = this.albumRepo.getByYear(year);
      this.panels.navigation.setAlbumsForYear(year, albums);
      this.panels.navigation.updateYearAlbumCount(year, albums.length);
      this.panels.statusBar.showSuccess(`Refreshed ${albums.length} albums for ${year}`);
    } catch {
      this.panels.statusBar.showError(`Failed to refresh albums for ${year}`);
    }
  }

  async refreshAlbum(album: Album): Promise<void> {
    this.panels.statusBar.showInfo(`Refreshing tracks for ${album.title}...`);

    try {
      // Fetch album info to get correct year
      const albumInfo = await this.scraper.getAlbumInfo(album.url);
      const yearLine = albumInfo.metadataLines?.find(l => l.label === 'Year');
      if (yearLine && yearLine.value) {
        const correctYear = yearLine.value;
        if (correctYear !== album.year) {
          this.albumRepo.update(album.id, { year: correctYear });
          this.panels.history.logInfo(`Updated year: ${album.year} → ${correctYear}`);
        }
      }

      const webTracks = await this.scraper.getAlbumTracks(album.url);

      if (webTracks.length === 0) {
        this.panels.statusBar.showError('No tracks found from web');
        return;
      }

      // Delete existing tracks and insert new ones
      this.trackRepo.deleteByAlbumId(album.id);
      const tracksToInsert = webTracks.map((t, i) => ({
        albumId: album.id,
        trackNumber: i + 1,
        name: t.name,
        duration: t.duration,
        pageUrl: t.pageUrl,
        fileSize: t.mp3Size
      }));
      this.trackRepo.createMany(tracksToInsert);
      const tracks = this.trackRepo.getByAlbumId(album.id);

      this.albumRepo.update(album.id, { trackCount: tracks.length });
      this.panels.navigation.setTracksForAlbum(album.id, tracks);
      this.panels.favorites.refresh();
      this.panels.statusBar.showSuccess(`Refreshed ${tracks.length} tracks`);
    } catch {
      this.panels.statusBar.showError(`Failed to refresh tracks`);
    }
  }

  async toggleFavorite() {
    let album = null;

    // First check focused panel for selected album
    if (this.focusedPanel === 'navigation') {
      const item = this.panels.navigation.getSelectedItem();
      if (item?.type === 'album') {
        album = item.album;
      } else if (item?.type === 'track') {
        album = this.panels.navigation.selectedAlbum;
      }
    } else if (this.focusedPanel === 'favorites') {
      const item = this.panels.favorites.getSelectedItem();
      if (item?.type === 'album') {
        album = item.album;
      } else if (item?.type === 'track') {
        album = this.panels.favorites.selectedAlbum;
      }
    }

    // Fall back to currently playing album
    if (!album) {
      const status = this.playbackController.getStatus();
      album = status.currentAlbum;
    }

    if (!album) {
      this.panels.statusBar.showError('No album selected');
      return;
    }

    // Get fresh album data from database to check current favorite status
    const freshAlbum = this.albumRepo.getById(album.id) as Album | undefined;
    const isFavorite = freshAlbum?.is_favorite === 1;
    const action = isFavorite ? 'Remove from' : 'Add to';
    const message = `${action} favorites?\n\n{cyan-fg}${album.title}{/cyan-fg}`;

    this.showConfirm(message, async (confirmed) => {
      if (!confirmed) {
        this.panels.statusBar.showInfo('Cancelled');
        return;
      }

      if (isFavorite) {
        // Remove favorite
        this.albumRepo.setFavorite(album.id, false);
        this.panels.nowPlaying.setFavorite(false);
        this.panels.statusBar.showInfo(`Removed from favorites: ${album.title}`);
        this.panels.history.logFavorite(`Removed: ${album.title}`);
      } else {
        // Add favorite (no auto download - use 'd' key)
        this.albumRepo.setFavorite(album.id, true);
        this.panels.nowPlaying.setFavorite(true);
        this.panels.statusBar.showInfo(`Added to favorites: ${album.title} (press 'd' to download)`);
        this.panels.history.logFavorite(`Added: ${album.title}`);
      }

      // Refresh both panels to update favorite status display
      this.panels.favorites.refresh();
      this.panels.navigation.refreshCurrentAlbum();
    });
  }

  async handleDownload() {
    let album = null;

    // Check which panel is focused and get selected album
    if (this.focusedPanel === 'navigation') {
      const item = this.panels.navigation.getSelectedItem();
      if (item?.type === 'album') {
        album = item.album;
      } else if (item?.type === 'track') {
        album = this.panels.navigation.selectedAlbum;
      }
    } else if (this.focusedPanel === 'favorites') {
      const item = this.panels.favorites.getSelectedItem();
      if (item?.type === 'album') {
        album = item.album;
      } else if (item?.type === 'track') {
        // Find parent album from favorites
        album = this.panels.favorites.selectedAlbum;
      }
    }

    if (!album) {
      this.panels.statusBar.showError('No album selected');
      return;
    }

    // Check if already downloading
    if (this.downloader?.isDownloading) {
      this.panels.statusBar.showError('Download already in progress');
      return;
    }

    this.showDownloadMenu(album);
  }

  showDownloadMenu(album: Album): void {
    const isDownloaded = album.is_downloaded;
    const credentials = settingsRepo.getCredentials();
    const downloadedText = isDownloaded ? ' (Re-download)' : '';

    showLoginForm({
      screen: this.screen,
      title: `Download Album${downloadedText}`,
      subtitle: album.title,
      credentials,
      setDialogActive: (active) => { this.dialogActive = active; },
      onSubmit: async (username, password) => {
        if (!username || !password) {
          this.panels.statusBar.showError('Username and password required');
          return;
        }

        this.panels.statusBar.showInfo('Logging in...');

        try {
          await this.scraper.login(username, password);
          settingsRepo.setCredentials(username, password);
          this.panels.statusBar.showSuccess('Logged in as ' + username);
          this.panels.history.logInfo('Logged in as ' + username);
          this.updateLoginStatus();

          // Now proceed with download (await to ensure errors are handled)
          await this.startDownload(album);
        } catch (error: unknown) {
          this.panels.statusBar.showError('Login failed: ' + getErrorMessage(error));
          this.panels.history.logError('Login failed: ' + getErrorMessage(error));
        }
      },
      onCancel: () => {
        this.panels.statusBar.showInfo('Download cancelled');
      }
    });
  }

  async startDownload(album: Album): Promise<void> {
    if (!this.downloader) {
      this.panels.statusBar.showError('Downloader not available');
      return;
    }
    this.panels.statusBar.showInfo(`Starting download: ${album.title}`);
    try {
      await this.downloader.downloadAlbum(album);
    } catch (error: unknown) {
      this.panels.statusBar.showError(`Download failed: ${getErrorMessage(error)}`);
    }
  }

  showConfirm(message: string, callback: (confirmed: boolean) => void): void {
    // Clean up any existing dialog first to prevent listener accumulation
    if (this._activeDialogCleanup) {
      try {
        this._activeDialogCleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    this.dialogActive = true;

    const confirmBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 9,
      content: `\n${message}\n\n\n  {green-fg}[Y]{/green-fg} Yes    {red-fg}[N]{/red-fg} No`,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      }
    });

    this.screen.render();

    let handled = false;

    const cleanup = () => {
      if (handled) return;
      handled = true;
      this.dialogActive = false;
      this._activeDialogCleanup = null;
      this.screen.removeListener('keypress', handleKey);
      // Safely destroy confirmBox (may be null if blessed.box() failed)
      if (confirmBox) {
        try {
          confirmBox.destroy();
        } catch {
          // Ignore destroy errors
        }
      }
      this.screen.render();
    };

    // Track cleanup for external shutdown
    this._activeDialogCleanup = cleanup;

    const handleKey = (ch, key) => {
      if (handled) return;
      if (key.name === 'y') {
        cleanup();
        // Handle both sync and async callbacks
        Promise.resolve().then(() => callback(true)).catch((error) => {
          this.panels.statusBar?.showError(`Error: ${getErrorMessage(error)}`);
        });
      } else if (key.name === 'n' || key.name === 'escape') {
        cleanup();
        // Handle both sync and async callbacks
        Promise.resolve().then(() => callback(false)).catch((error) => {
          this.panels.statusBar?.showError(`Error: ${getErrorMessage(error)}`);
        });
      }
    };

    this.screen.on('keypress', handleKey);
  }

  showLoginDialog() {
    // Clean up any existing dialog first to prevent listener accumulation
    if (this._activeDialogCleanup) {
      try {
        this._activeDialogCleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    const isLoggedIn = this.scraper.isLoggedIn;
    const credentials = settingsRepo.getCredentials();

    if (isLoggedIn) {
      // Show logout option
      this.dialogActive = true;

      const dialogBox = blessed.box({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: 50,
        height: 8,
        tags: true,
        border: { type: 'line' },
        style: {
          border: { fg: 'cyan' },
          bg: 'black'
        }
      });

      dialogBox.setContent(`
  {bold}Khinsider Login{/bold}

  Logged in as: {green-fg}${credentials?.username || 'Unknown'}{/green-fg}

  {gray-fg}[L] Logout    [Esc] Close{/gray-fg}
`);

      this.screen.render();

      let handled = false;

      const cleanup = () => {
        if (handled) return;
        handled = true;
        this.dialogActive = false;
        this._activeDialogCleanup = null;
        this.screen.removeListener('keypress', handleKey);
        dialogBox.destroy();
        this.screen.render();
      };

      // Track cleanup for external shutdown
      this._activeDialogCleanup = cleanup;

      const handleKey = (ch, key) => {
        if (handled) return;
        if (ch === 'L' || ch === 'l') {
          cleanup();
          this.handleLogout().catch(error => {
            this.panels.statusBar?.showError(`Logout error: ${getErrorMessage(error)}`);
          });
        } else if (key.name === 'escape') {
          cleanup();
        }
      };

      this.screen.on('keypress', handleKey);
    } else {
      // Show login form using common component
      showLoginForm({
        screen: this.screen,
        title: 'Khinsider Login',
        credentials,
        setDialogActive: (active) => { this.dialogActive = active; },
        onSubmit: async (username, password) => {
          if (!username || !password) {
            this.panels.statusBar.showError('Username and password required');
            return;
          }

          this.panels.statusBar.showInfo('Logging in...');

          try {
            await this.scraper.login(username, password);
            settingsRepo.setCredentials(username, password);
            this.panels.statusBar.showSuccess('Logged in as ' + username);
            this.panels.history.logInfo('Logged in as ' + username);
            this.updateLoginStatus();
          } catch (error: unknown) {
            this.panels.statusBar.showError('Login failed: ' + getErrorMessage(error));
            this.panels.history.logError('Login failed: ' + getErrorMessage(error));
          }
        },
        onCancel: () => {
          // Do nothing on cancel
        }
      });
    }
  }

  async handleLogout(): Promise<void> {
    await this.scraper.logout();
    settingsRepo.clearCredentials();
    settingsRepo.clearSession();
    this.panels.statusBar.showInfo('Logged out');
    this.panels.history.logInfo('Logged out');
    this.updateLoginStatus();
  }

  showHelp() {
    // Clean up any existing dialog first to prevent listener accumulation
    if (this._activeDialogCleanup) {
      try {
        this._activeDialogCleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    this.dialogActive = true;

    const helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 22,
      content: helpText,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      }
    });

    this.screen.render();

    let closed = false;

    const helpKeys = ['escape', 'q', '?', 'enter'];
    const closeHelp = () => {
      if (closed) return;
      closed = true;
      this.dialogActive = false;
      this._activeDialogCleanup = null;
      // Remove the onceKey listener to prevent memory leak
      this.screen.unkey(helpKeys, closeHelp);
      helpBox.destroy();
      this.screen.render();
    };

    // Track cleanup for external shutdown
    this._activeDialogCleanup = closeHelp;

    this.screen.onceKey(helpKeys, closeHelp);
  }

  async playYear(year: string): Promise<void> {
    this.panels.statusBar.showInfo(`Starting playback for year ${year}...`);
    await this.playbackController.playYear(year);
  }

  async quit() {
    // Mark as not initialized first to prevent background promises from updating UI
    this.isInitialized = false;

    // Clean up any active dialog
    if (this._activeDialogCleanup) {
      try {
        this._activeDialogCleanup();
      } catch (e) {
        // Log but don't fail on cleanup errors
        console.error('Dialog cleanup error:', e);
      }
      this._activeDialogCleanup = null;
    }

    // Clean up global keypress handler
    if (this._globalKeyHandler) {
      this.screen.program.removeListener('keypress', this._globalKeyHandler);
      this._globalKeyHandler = null;
    }

    // Save current position before quitting
    if (this.panels?.navigation) {
      this.panels.navigation.saveCurrentPosition();
    }

    // Wait for background promises to settle (with timeout)
    // Capture and clear immediately to prevent new promises from being added during wait
    const pendingPromises = this._backgroundPromises;
    this._backgroundPromises = []; // Clear immediately to prevent race condition

    if (pendingPromises.length > 0) {
      const BACKGROUND_TIMEOUT = 2000; // 2 seconds max
      await Promise.race([
        Promise.allSettled(pendingPromises),
        new Promise(resolve => setTimeout(resolve, BACKGROUND_TIMEOUT))
      ]);
    }

    // Stop playback first (before removing listeners)
    await this.playbackController.stop();

    // Clean up playback controller listeners (after stop completes)
    if (this._pcListeners) {
      for (const [event, handler] of Object.entries(this._pcListeners)) {
        this.playbackController.off(event, handler);
      }
      this._pcListeners = null;
    }
    this.playbackController.cleanup(); // Remove audioPlayer listeners

    // Clean up downloader listeners
    if (this._dlListeners && this.downloader) {
      for (const [event, handler] of Object.entries(this._dlListeners)) {
        this.downloader.off(event, handler);
      }
      this._dlListeners = null;
    }

    // Clean up StatusBar timer
    if (this.panels.statusBar) {
      this.panels.statusBar.destroy();
    }

    this.screen.destroy();
    process.exit(0);
  }

  run() {
    if (!this.isInitialized) {
      throw new Error('App not initialized. Call initialize() first.');
    }
    this.screen.render();
  }
}
