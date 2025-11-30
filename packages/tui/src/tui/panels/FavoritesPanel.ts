import blessed from 'blessed';
import { trackRepo } from '@khinsider/core';
import type { Album, Track } from '@khinsider/shared';
import type { AlbumRepository } from '@khinsider/core';
import { escapeBlessedMarkup } from '../utils/formatters.js';

export interface FavoritesSelectData {
  type: string;
  track?: Track;
  album?: Album | null;
  trackIndex?: number;
}

interface FavoritesPanelOptions {
  onSelect?: (data: FavoritesSelectData) => void;
  onAlbumSelect?: (album: Album) => void | Promise<void>;
  albumRepo?: AlbumRepository;
}

interface ListItem {
  type: string;
  year?: string;
  album?: Album;
  track?: Track;
  trackIndex?: number;
  text: string;
}

export class FavoritesPanel {
  screen: blessed.Widgets.Screen;
  onSelect: (data: FavoritesSelectData) => void;
  onAlbumSelect: (album: Album) => void | Promise<void>;
  albumRepo: AlbumRepository | undefined;
  favorites: Album[];
  tracks: Record<number, Track[]>;
  expandedAlbums: Set<number>;
  expandedYears: Set<string>;
  selectedAlbum: Album | null;
  cachedItems: ListItem[];
  albumsByYear: Record<string, Album[]>;
  sortedYears: string[];
  box: blessed.Widgets.BoxElement;
  list: blessed.Widgets.ListElement;

  constructor(screen: blessed.Widgets.Screen, options: FavoritesPanelOptions = {}) {
    this.screen = screen;
    this.onSelect = options.onSelect || (() => {});
    this.onAlbumSelect = options.onAlbumSelect || (() => {});
    this.albumRepo = options.albumRepo;

    this.favorites = [];
    this.tracks = {};  // albumId -> tracks[]
    this.expandedAlbums = new Set();
    this.expandedYears = new Set();

    this.selectedAlbum = null;
    this.cachedItems = [];

    // Group by year
    this.albumsByYear = {};  // year -> albums[]
    this.sortedYears = [];   // years sorted descending

    // Initialize UI elements (assigned in createPanel)
    this.box = null!;
    this.list = null!;

    this.createPanel();
  }

  createPanel(): void {
    this.box = blessed.box({
      parent: this.screen,
      label: ' Favorites ',
      top: 0,
      left: '50%',
      width: '50%',
      height: '50%',
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'white', bold: true }
      }
    });

    this.list = blessed.list({
      parent: this.box,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: false,
      vi: false,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      tags: true,
      scrollbar: {
        ch: '│',
        track: { bg: 'gray' },
        style: { bg: 'yellow' }
      },
      style: {
        fg: 'white',
        bg: 'default',
        selected: { bg: 'blue', fg: 'white', bold: true }
      },
      items: []
    });

    this.setupEvents();
  }

  setupEvents(): void {
    // Navigation
    this.list.key(['j', 'down'], () => this.moveDown());
    this.list.key(['k', 'up'], () => this.moveUp());
    this.list.key(['g'], () => this.goToTop());
    this.list.key(['S-g'], () => this.goToBottom());
    this.list.key(['C-d'], () => this.pageDown());
    this.list.key(['C-u'], () => this.pageUp());

    // Expand/Collapse
    this.list.key(['left', 'h'], () => this.collapse());
    this.list.key(['right', 'l', 'enter'], () => this.expandOrSelect());
  }

  // ─────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────

  selectAndScroll(index: number): void {
    if (index < 0 || index >= this.cachedItems.length) return;
    this.list.selected = index;
    this.adjustScrollMargin(index);
    this.updateLabel();
    this.screen.render();
  }

  adjustScrollMargin(index: number): void {
    const margin = 2;
    const listHeight = typeof this.list.height === 'number' ? this.list.height : parseInt(String(this.list.height), 10) || 10;
    const visibleHeight = Math.max(1, listHeight - 2);
    const scrollTop = this.list.childBase || 0;
    const scrollBottom = scrollTop + visibleHeight - 1;

    if (index < scrollTop + margin) {
      this.list.childBase = Math.max(0, index - margin);
    } else if (index > scrollBottom - margin) {
      this.list.childBase = Math.max(0, index - visibleHeight + 1 + margin);
    }
  }

  moveDown(): void {
    const newIndex = Math.min(this.list.selected + 1, this.cachedItems.length - 1);
    this.selectAndScroll(newIndex);
  }

  moveUp(): void {
    const newIndex = Math.max(this.list.selected - 1, 0);
    this.selectAndScroll(newIndex);
  }

  goToTop(): void {
    this.selectAndScroll(0);
  }

  goToBottom(): void {
    this.selectAndScroll(this.cachedItems.length - 1);
  }

  pageDown(): void {
    const listHeight = typeof this.list.height === 'number' ? this.list.height : parseInt(String(this.list.height), 10) || 10;
    const visibleHeight = Math.max(1, listHeight - 2);
    const halfPage = Math.floor(visibleHeight / 2);
    const newIndex = Math.min(this.list.selected + halfPage, this.cachedItems.length - 1);
    this.selectAndScroll(newIndex);
  }

  pageUp(): void {
    const listHeight = typeof this.list.height === 'number' ? this.list.height : parseInt(String(this.list.height), 10) || 10;
    const visibleHeight = Math.max(1, listHeight - 2);
    const halfPage = Math.floor(visibleHeight / 2);
    const newIndex = Math.max(this.list.selected - halfPage, 0);
    this.selectAndScroll(newIndex);
  }

  // ─────────────────────────────────────────────────────────────
  // Expand / Collapse
  // ─────────────────────────────────────────────────────────────

  expandOrSelect(): void {
    const index = this.list.selected;
    const item = this.cachedItems[index];
    if (!item) return;

    if (item.type === 'track') {
      // Play track - handle async callback with error catching
      Promise.resolve(this.onSelect({
        type: 'track',
        track: item.track,
        album: this.selectedAlbum,
        trackIndex: item.trackIndex
      })).catch((err: unknown) => {
        console.error('onSelect error:', err);
      });
    } else if (item.type === 'year' && item.year) {
      this.toggleYear(item.year);
    } else if (item.type === 'album' && item.album) {
      this.toggleAlbum(item.album);
    }
  }

  collapse(): void {
    const index = this.list.selected;
    const item = this.cachedItems[index];
    if (!item) return;

    if (item.type === 'track') {
      // Find parent album and collapse it
      for (let i = index - 1; i >= 0; i--) {
        if (this.cachedItems[i].type === 'album') {
          const album = this.cachedItems[i].album;
          if (!album) continue;
          this.expandedAlbums.delete(album.id);
          this.selectedAlbum = null;
          this.rebuildAndSelect(i);
          return;
        }
      }
    } else if (item.type === 'album' && item.album) {
      // If album is expanded, collapse it
      if (this.expandedAlbums.has(item.album.id)) {
        this.expandedAlbums.delete(item.album.id);
        this.selectedAlbum = null;
        this.rebuildAndSelect(index);
        return;
      }
      // Otherwise find parent year and collapse it
      for (let i = index - 1; i >= 0; i--) {
        if (this.cachedItems[i].type === 'year') {
          const year = this.cachedItems[i].year;
          if (!year) continue;
          this.expandedYears.delete(year);
          this.rebuildAndSelect(i);
          return;
        }
      }
    } else if (item.type === 'year' && item.year) {
      // Collapse year if expanded
      if (this.expandedYears.has(item.year)) {
        this.expandedYears.delete(item.year);
        this.rebuildAndSelect(index);
      }
    }
  }

  toggleYear(year: string): void {
    const currentIndex = this.list.selected;
    if (this.expandedYears.has(year)) {
      this.expandedYears.delete(year);
    } else {
      this.expandedYears.add(year);
    }
    this.rebuildAndSelect(currentIndex);
  }

  toggleAlbum(album: Album): void {
    const currentIndex = this.list.selected;
    if (this.expandedAlbums.has(album.id)) {
      this.expandedAlbums.delete(album.id);
      this.selectedAlbum = null;
    } else {
      this.expandedAlbums.add(album.id);
      this.selectedAlbum = album;
      // Load tracks if not loaded
      if (!this.tracks[album.id]) {
        const tracks = trackRepo.getByAlbumId(album.id);
        this.tracks[album.id] = tracks;
      }
      // Handle async callback with error catching
      Promise.resolve(this.onAlbumSelect(album)).catch((err: unknown) => {
        console.error('onAlbumSelect error:', err);
      });
    }
    this.rebuildAndSelect(currentIndex);
  }

  // ─────────────────────────────────────────────────────────────
  // Data
  // ─────────────────────────────────────────────────────────────

  refresh(): void {
    if (!this.albumRepo) return;

    this.favorites = this.albumRepo.getFavorites();

    // Group albums by year
    this.albumsByYear = {};
    for (const album of this.favorites) {
      const year = album.year || 'Unknown';
      if (!this.albumsByYear[year]) {
        this.albumsByYear[year] = [];
      }
      this.albumsByYear[year].push(album);
    }

    // Sort years descending (newest first)
    this.sortedYears = Object.keys(this.albumsByYear).sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return b.localeCompare(a);
    });

    this.buildItems();
    this.render();
  }

  buildItems(): void {
    this.cachedItems = [];

    for (const year of this.sortedYears) {
      const albums = this.albumsByYear[year];
      const isExpanded = this.expandedYears.has(year);
      const prefix = isExpanded ? '▼' : '▶';

      this.cachedItems.push({
        type: 'year',
        year: year,
        text: `${prefix} ${year} (${albums.length} albums)`
      });

      if (isExpanded) {
        for (const album of albums) {
          const isAlbumExpanded = this.expandedAlbums.has(album.id);
          const albumPrefix = isAlbumExpanded ? '  ▼' : '  ▶';
          const downloadStatus = album.is_downloaded ? ' ✓' : '';

          this.cachedItems.push({
            type: 'album',
            album: album,
            text: `${albumPrefix} ${escapeBlessedMarkup(album.title)}${downloadStatus}`
          });

          if (isAlbumExpanded && this.tracks[album.id]) {
            for (let i = 0; i < this.tracks[album.id].length; i++) {
              const track = this.tracks[album.id][i];
              const num = String(i + 1).padStart(2, '0');
              this.cachedItems.push({
                type: 'track',
                track: track,
                trackIndex: i,
                text: `      ${num}. ${escapeBlessedMarkup(track.name)}`
              });
            }
          }
        }
      }
    }
  }

  rebuildAndSelect(targetIndex: number): void {
    this.buildItems();
    this.list.setItems(this.cachedItems.map(i => i.text));

    const newIndex = Math.min(Math.max(0, targetIndex), this.cachedItems.length - 1);
    if (this.cachedItems.length > 0) {
      this.list.selected = newIndex;
      this.adjustScrollMargin(newIndex);
    }
    this.updateLabel();
    this.screen.render();
  }

  render(): void {
    this.list.setItems(this.cachedItems.map(i => i.text));
    if (this.cachedItems.length > 0 && this.list.selected >= this.cachedItems.length) {
      this.list.selected = this.cachedItems.length - 1;
    }
    this.updateLabel();
    this.screen.render();
  }

  updateLabel(): void {
    const count = this.favorites.length;
    this.box.setLabel(` Favorites (${count}) `);
  }

  getSelectedItem(): ListItem | null {
    const index = this.list.selected;
    return this.cachedItems[index] || null;
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  focus(): void {
    this.list.focus();
    this.box.style.border.fg = 'white';
    this.screen.render();
  }

  blur(): void {
    this.box.style.border.fg = 'yellow';
    this.screen.render();
  }

  getBox(): blessed.Widgets.BoxElement {
    return this.box;
  }
}
