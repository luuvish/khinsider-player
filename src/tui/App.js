import blessed from 'blessed';
import { NavigationPanel } from './panels/NavigationPanel.js';
import { NowPlayingPanel } from './panels/NowPlayingPanel.js';
import { FavoritesPanel } from './panels/FavoritesPanel.js';
import { HistoryPanel } from './panels/HistoryPanel.js';
import { StatusBar } from './panels/StatusBar.js';
import { TitleBar } from './panels/TitleBar.js';
import { helpText } from './utils/keyBindings.js';
import { settingsRepo } from '../data/repositories/settings-repo.js';

export class App {
  constructor(options = {}) {
    this.scraper = options.scraper;
    this.playbackController = options.playbackController;
    this.albumRepo = options.albumRepo;
    this.trackRepo = options.trackRepo;
    this.downloader = options.downloader;

    this.screen = null;
    this.panels = {};
    this.focusedPanel = 'navigation';
    this.isInitialized = false;
    this.dialogActive = false;
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
      } catch (error) {
        this.panels.statusBar.showError('Auto-login failed: ' + error.message);
        this.panels.history.logError('Auto-login failed');
      }
    }
  }

  updateLoginStatus() {
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
    this.screen.program.on('keypress', (ch, key) => {
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
        this.toggleFavorite();
        return;
      }

      // Refresh: r
      if (key.name === 'r') {
        this.refreshCurrent();
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
        this.handleDownload();
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
    });
  }

  focusPanel(panelName) {
    // Blur current panel
    if (this.focusedPanel === 'navigation') {
      this.panels.navigation.box.style.border.fg = 'cyan';
    } else if (this.focusedPanel === 'favorites') {
      this.panels.favorites.blur();
    } else if (this.focusedPanel === 'history') {
      this.panels.history.blur();
    }

    // Focus new panel
    this.focusedPanel = panelName;
    if (panelName === 'navigation') {
      this.panels.navigation.box.style.border.fg = 'white';
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

    pc.on('loading', () => {
      this.panels.nowPlaying.setLoading();
      this.panels.history.logInfo('Loading track...');
    });

    pc.on('trackStart', (data) => {
      this.panels.nowPlaying.setPlaying(
        data.track,
        data.album,
        data.trackIndex,
        data.totalTracks
      );

      const status = pc.getStatus();
      if (status.mode === 'year_sequential') {
        this.panels.nowPlaying.update({
          year: status.currentYear,
          albumIndex: status.yearAlbumIndex,
          totalAlbums: status.totalYearAlbums
        });
      }

      this.panels.history.logPlay(`${data.track.name}`);
    });

    pc.on('trackCompleted', (data) => {
      // Mark track as completed (played to the end)
      this.panels.navigation.markTrackCompleted(data.track.id, data.album?.id);
      this.panels.history.logInfo(`Completed: ${data.track.name}`);
    });

    pc.on('paused', () => {
      this.panels.nowPlaying.setPaused();
      this.panels.history.logPause('Paused');
    });

    pc.on('resumed', () => {
      this.panels.nowPlaying.update({ state: 'playing' });
      this.panels.history.logPlay('Resumed');
    });

    pc.on('stopped', () => {
      this.panels.nowPlaying.setIdle();
      this.panels.history.logStop('Stopped');
    });

    pc.on('error', (data) => {
      this.panels.statusBar.showError(data.message || 'Playback error');
      this.panels.nowPlaying.setError();
      this.panels.history.logError(data.message || 'Playback error');
    });

    pc.on('albumChange', (data) => {
      this.panels.nowPlaying.setAlbum(data.album);
      this.panels.statusBar.showInfo(`Now playing album: ${data.album.title}`);
      this.panels.history.logInfo(`Album: ${data.album.title}`);
    });

    pc.on('albumComplete', (data) => {
      this.panels.statusBar.showInfo(`Album complete: ${data.album.title}`);
    });

    pc.on('yearComplete', (data) => {
      this.panels.statusBar.showSuccess(`Year ${data.year} complete!`);
      this.panels.nowPlaying.setIdle();
    });

    pc.on('loadingYear', (data) => {
      this.panels.statusBar.showInfo(`Loading albums for ${data.year}...`);
    });

    pc.on('yearLoaded', (data) => {
      this.panels.statusBar.showInfo(`Loaded ${data.albumCount} albums for ${data.year}`);
    });

    pc.on('loadingAlbum', (data) => {
      this.panels.statusBar.showInfo(`Loading tracks for ${data.album.title}...`);
    });

    pc.on('albumLoaded', (data) => {
      this.panels.statusBar.showInfo(`Loaded ${data.trackCount} tracks`);
    });

    // Downloader events
    if (this.downloader) {
      this.downloader.on('start', (data) => {
        this.panels.statusBar.showInfo(`Downloading: ${data.album.title}`);
        this.panels.history.logDownload(`Started: ${data.album.title}`);
      });

      this.downloader.on('zipProgress', (data) => {
        const formatStr = data.format?.toUpperCase() || '';
        if (data.percent !== undefined) {
          this.panels.statusBar.showInfo(`Downloading ${formatStr}: ${data.percent}%`);
        }
      });

      this.downloader.on('zipComplete', (data) => {
        const formatStr = data.format?.toUpperCase() || '';
        this.panels.history.logDownload(`Downloaded: ${formatStr}.zip`);
      });

      this.downloader.on('imagesStart', (data) => {
        this.panels.statusBar.showInfo(`Downloading images: 0/${data.total}`);
      });

      this.downloader.on('imageProgress', (data) => {
        this.panels.statusBar.showInfo(`Downloading images: ${data.current}/${data.total}`);
      });

      this.downloader.on('imagesComplete', (data) => {
        this.panels.history.logDownload(`Downloaded: ${data.count} images`);
      });

      this.downloader.on('complete', (data) => {
        this.panels.statusBar.showSuccess(`Download complete: ${data.album.title}`);
        this.panels.favorites.refresh();
        this.panels.history.logDownload(`Complete: ${data.album.title}`);
      });

      this.downloader.on('error', (data) => {
        this.panels.statusBar.showError(`Download failed: ${data.error.message}`);
        this.panels.history.logError(`Download failed: ${data.error.message}`);
      });
    }
  }

  async loadInitialData() {
    this.panels.statusBar.showInfo('Loading years from web...');

    try {
      // Get years from database for album counts
      const dbYears = this.albumRepo.getYears();
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
    } catch (error) {
      this.panels.statusBar.showError('Failed to load years');
      this.panels.history.logError('Failed to load years');
    }
  }

  async handleYearSelect(year) {
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
    } catch (error) {
      this.panels.statusBar.showError(`Failed to load albums for ${year}`);
    }
  }

  async handleAlbumSelect(album) {
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
      this.scraper.getAlbumInfo(album.url).then(info => {
        this.panels.nowPlaying.setAlbumInfo(info);
      });

      this.panels.statusBar.reset();
    } catch (error) {
      this.panels.statusBar.showError(`Failed to load tracks`);
    }
  }

  async handleNavigationSelect(data) {
    if (data.type === 'track') {
      // Play album starting from selected track
      await this.playbackController.playAlbum(data.album, data.trackIndex);
    }
  }

  async handleFavoriteSelect(data) {
    if (data.type === 'track') {
      // Play album starting from selected track
      this.panels.statusBar.showInfo(`Playing: ${data.track.name}`);
      await this.playbackController.playAlbum(data.album, data.trackIndex);
    }
  }

  async handleFavoriteAlbumSelect(album) {
    // Update Now Playing panel with album info
    this.panels.nowPlaying.setAlbum(album);

    // Fetch album info in background
    this.scraper.getAlbumInfo(album.url).then(info => {
      this.panels.nowPlaying.setAlbumInfo(info);
    });
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

  async nextTrack() {
    await this.playbackController.next();
  }

  async previousTrack() {
    await this.playbackController.previous();
  }

  async nextAlbum() {
    await this.playbackController.nextAlbum();
  }

  async previousAlbum() {
    await this.playbackController.previousAlbum();
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

  async refreshYear(year) {
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
    } catch (error) {
      this.panels.statusBar.showError(`Failed to refresh albums for ${year}`);
    }
  }

  async refreshAlbum(album) {
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
    } catch (error) {
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
    const freshAlbum = this.albumRepo.getById(album.id);
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

  showDownloadMenu(album) {
    const isDownloaded = album.is_downloaded;
    const credentials = settingsRepo.getCredentials();
    const downloadedText = isDownloaded ? ' {yellow-fg}(Re-download){/yellow-fg}' : '';

    const dialogBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 12,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      }
    });

    let usernameValue = credentials?.username || '';
    let passwordValue = credentials?.password || '';

    dialogBox.setContent(`
  {bold}Download Album{/bold}${downloadedText}
  {cyan-fg}${album.title}{/cyan-fg}

  Username: [ ${usernameValue.padEnd(25)} ]
  Password: [ ${'*'.repeat(passwordValue.length).padEnd(25)} ]

  {gray-fg}[Tab] Switch  [Enter] Download  [Esc] Cancel{/gray-fg}
`);

    const usernameInput = blessed.textbox({
      parent: dialogBox,
      top: 4,
      left: 12,
      width: 29,
      height: 1,
      style: { fg: 'white', bg: 'black' }
    });

    const passwordInput = blessed.textbox({
      parent: dialogBox,
      top: 5,
      left: 12,
      width: 29,
      height: 1,
      censor: true,
      style: { fg: 'white', bg: 'black' }
    });

    usernameInput.setValue(usernameValue);
    passwordInput.setValue(passwordValue);

    let currentField = 'username';
    let switchingField = false;
    this.dialogActive = true;

    const cleanup = () => {
      this.dialogActive = false;
      dialogBox.destroy();
      this.screen.render();
    };

    const startDownloadWithLogin = async () => {
      const username = usernameInput.getValue().trim();
      const password = passwordInput.getValue().trim();

      if (!username || !password) {
        this.panels.statusBar.showError('Username and password required');
        cleanup();
        return;
      }

      cleanup();
      this.panels.statusBar.showInfo('Logging in...');

      try {
        await this.scraper.login(username, password);
        settingsRepo.setCredentials(username, password);
        this.panels.statusBar.showSuccess('Logged in as ' + username);
        this.panels.history.logInfo('Logged in as ' + username);
        this.updateLoginStatus();

        // Now proceed with download
        this.startDownload(album);
      } catch (error) {
        this.panels.statusBar.showError('Login failed: ' + error.message);
        this.panels.history.logError('Login failed: ' + error.message);
      }
    };

    const focusUsername = () => {
      currentField = 'username';
      usernameInput.readInput();
    };

    const focusPassword = () => {
      currentField = 'password';
      passwordInput.readInput();
    };

    const switchToPassword = () => {
      switchingField = true;
      usernameInput.cancel();
    };

    const switchToUsername = () => {
      switchingField = true;
      passwordInput.cancel();
    };

    usernameInput.on('submit', () => {
      focusPassword();
    });

    usernameInput.on('cancel', () => {
      if (switchingField) {
        switchingField = false;
        setTimeout(() => focusPassword(), 10);
      } else {
        cleanup();
      }
    });

    usernameInput.on('keypress', (ch, key) => {
      if (key && key.name === 'tab') {
        switchToPassword();
        return false;
      }
    });

    passwordInput.on('submit', () => {
      startDownloadWithLogin();
    });

    passwordInput.on('cancel', () => {
      if (switchingField) {
        switchingField = false;
        setTimeout(() => focusUsername(), 10);
      } else {
        cleanup();
      }
    });

    passwordInput.on('keypress', (ch, key) => {
      if (key && key.name === 'tab') {
        switchToUsername();
        return false;
      }
    });

    dialogBox.key(['escape'], () => {
      cleanup();
    });

    this.screen.render();
    focusUsername();
  }

  async startDownload(album) {
    this.panels.statusBar.showInfo(`Starting download: ${album.title}`);
    try {
      await this.downloader.downloadAlbum(album);
    } catch (error) {
      this.panels.statusBar.showError(`Download failed: ${error.message}`);
    }
  }

  showConfirm(message, callback) {
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

    const cleanup = () => {
      confirmBox.destroy();
      this.screen.render();
    };

    const handleKey = (ch, key) => {
      if (key.name === 'y') {
        cleanup();
        callback(true);
      } else if (key.name === 'n' || key.name === 'escape') {
        cleanup();
        callback(false);
      }
    };

    this.screen.once('keypress', handleKey);
  }

  showLoginDialog() {
    const isLoggedIn = this.scraper.isLoggedIn;
    const credentials = settingsRepo.getCredentials();

    const dialogBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: isLoggedIn ? 8 : 12,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      }
    });

    if (isLoggedIn) {
      // Show logout option
      dialogBox.setContent(`
  {bold}Khinsider Login{/bold}

  Logged in as: {green-fg}${credentials?.username || 'Unknown'}{/green-fg}

  {gray-fg}[L] Logout    [Esc] Close{/gray-fg}
`);

      this.screen.render();

      const handleKey = (ch, key) => {
        if (ch === 'L' || ch === 'l') {
          dialogBox.destroy();
          this.handleLogout();
        } else if (key.name === 'escape') {
          dialogBox.destroy();
          this.screen.render();
        }
      };

      this.screen.once('keypress', handleKey);
    } else {
      // Show login form
      let usernameValue = credentials?.username || '';
      let passwordValue = credentials?.password || '';

      dialogBox.setContent(`
  {bold}Khinsider Login{/bold}

  Username: [ ${usernameValue.padEnd(25)} ]
  Password: [ ${'*'.repeat(passwordValue.length).padEnd(25)} ]

  {gray-fg}[Tab] Switch field  [Enter] Login  [Esc] Cancel{/gray-fg}
`);

      const usernameInput = blessed.textbox({
        parent: dialogBox,
        top: 3,
        left: 12,
        width: 29,
        height: 1,
        style: { fg: 'white', bg: 'black' }
      });

      const passwordInput = blessed.textbox({
        parent: dialogBox,
        top: 4,
        left: 12,
        width: 29,
        height: 1,
        censor: true,
        style: { fg: 'white', bg: 'black' }
      });

      usernameInput.setValue(usernameValue);
      passwordInput.setValue(passwordValue);

      let switchingField = false;
      this.dialogActive = true;

      const cleanup = () => {
        this.dialogActive = false;
        dialogBox.destroy();
        this.screen.render();
      };

      const submitLogin = async () => {
        const username = usernameInput.getValue().trim();
        const password = passwordInput.getValue().trim();

        if (!username || !password) {
          this.panels.statusBar.showError('Username and password required');
          cleanup();
          return;
        }

        cleanup();
        this.panels.statusBar.showInfo('Logging in...');

        try {
          await this.scraper.login(username, password);
          settingsRepo.setCredentials(username, password);
          this.panels.statusBar.showSuccess('Logged in as ' + username);
          this.panels.history.logInfo('Logged in as ' + username);
          this.updateLoginStatus();
        } catch (error) {
          this.panels.statusBar.showError('Login failed: ' + error.message);
          this.panels.history.logError('Login failed: ' + error.message);
        }
      };

      const focusUsername = () => {
        usernameInput.readInput();
      };

      const focusPassword = () => {
        passwordInput.readInput();
      };

      const switchToPassword = () => {
        switchingField = true;
        usernameInput.cancel();
      };

      const switchToUsername = () => {
        switchingField = true;
        passwordInput.cancel();
      };

      usernameInput.on('submit', () => {
        focusPassword();
      });

      usernameInput.on('cancel', () => {
        if (switchingField) {
          switchingField = false;
          setTimeout(() => focusPassword(), 10);
        } else {
          cleanup();
        }
      });

      usernameInput.on('keypress', (ch, key) => {
        if (key && key.name === 'tab') {
          switchToPassword();
          return false;
        }
      });

      passwordInput.on('submit', () => {
        submitLogin();
      });

      passwordInput.on('cancel', () => {
        if (switchingField) {
          switchingField = false;
          setTimeout(() => focusUsername(), 10);
        } else {
          cleanup();
        }
      });

      passwordInput.on('keypress', (ch, key) => {
        if (key && key.name === 'tab') {
          switchToUsername();
          return false;
        }
      });

      dialogBox.key(['escape'], () => {
        cleanup();
      });

      this.screen.render();
      focusUsername();
    }
  }

  async handleLogout() {
    await this.scraper.logout();
    settingsRepo.clearCredentials();
    settingsRepo.clearSession();
    this.panels.statusBar.showInfo('Logged out');
    this.panels.history.logInfo('Logged out');
    this.updateLoginStatus();
  }

  showHelp() {
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

    const closeHelp = () => {
      helpBox.destroy();
      this.screen.render();
    };

    this.screen.onceKey(['escape', 'q', '?', 'enter'], closeHelp);
  }

  async playYear(year) {
    this.panels.statusBar.showInfo(`Starting playback for year ${year}...`);
    await this.playbackController.playYear(year);
  }

  async quit() {
    // Save current position before quitting
    this.panels.navigation.saveCurrentPosition();
    await this.playbackController.stop();
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
