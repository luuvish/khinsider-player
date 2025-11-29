import blessed from 'blessed';
import { albumRepo } from '../../data/repositories/album-repo.js';
import { trackRepo } from '../../data/repositories/track-repo.js';
import { playbackRepo } from '../../data/repositories/playback-repo.js';

export class NavigationPanel {
  constructor(screen, options = {}) {
    this.screen = screen;
    this.onSelect = options.onSelect || (() => {});
    this.onYearSelect = options.onYearSelect || (() => {});
    this.onAlbumSelect = options.onAlbumSelect || (() => {});

    this.years = [];
    this.albums = {};
    this.tracks = {};
    this.expandedYears = new Set();
    this.expandedAlbums = new Set();

    this.selectedYear = null;
    this.selectedAlbum = null;

    // Remember last position when collapsing
    this.lastSelectedAlbumInYear = new Map();  // year -> albumId
    this.lastSelectedTrackInAlbum = new Map(); // albumId -> trackIndex

    // Search state
    this.searchQuery = '';
    this.searchMatches = [];
    this.searchMatchIndex = 0;

    // Cached items for consistent indexing
    this.cachedItems = [];

    // Played status cache
    this.playedAlbums = new Set();
    this.playedTracks = new Set();

    // Restore in progress flag
    this.isRestoring = false;

    this.createPanel();
  }

  createPanel() {
    this.box = blessed.box({
      parent: this.screen,
      label: ' Navigation ',
      top: 0,
      left: 0,
      width: '50%',
      height: '80%',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white', bold: true }
      }
    });

    this.list = blessed.list({
      parent: this.box,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: false,       // Disable blessed's key handling
      vi: false,         // Disable VI mode - we handle all keys manually
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      tags: true,        // Enable color tags
      scrollbar: {
        ch: '│',
        track: { bg: 'gray' },
        style: { bg: 'cyan' }
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

  setupEvents() {
    // All navigation is handled manually since blessed's keys/vi are disabled

    // Navigation: up/down
    this.list.key(['j', 'down'], () => this.moveDown());
    this.list.key(['k', 'up'], () => this.moveUp());

    // Navigation: top/bottom
    this.list.key(['g'], () => this.goToTop());
    this.list.key(['S-g'], () => this.goToBottom());

    // Navigation: page up/down
    this.list.key(['C-d'], () => this.pageDown());
    this.list.key(['C-u'], () => this.pageUp());

    // Collapse (go to parent)
    this.list.key(['left', 'h'], () => this.collapse());

    // Expand or play track
    this.list.key(['right', 'l', 'enter'], () => this.expandOrSelect());

    // Search
    this.list.key(['/'], () => this.openSearch());
    this.list.key(['n'], () => this.nextSearchMatch());
    this.list.key(['S-n'], () => this.prevSearchMatch());

    // Escape clears search
    this.list.key(['escape'], () => this.clearSearch());
  }

  // ─────────────────────────────────────────────────────────────
  // Navigation - manual control
  // ─────────────────────────────────────────────────────────────

  selectAndScroll(index) {
    if (index < 0 || index >= this.cachedItems.length) return;
    this.list.selected = index;
    this.adjustScrollMargin(index);
    this.updateLabel();
    this.screen.render();
  }

  moveDown() {
    const newIndex = Math.min(this.list.selected + 1, this.cachedItems.length - 1);
    this.selectAndScroll(newIndex);
  }

  moveUp() {
    const newIndex = Math.max(this.list.selected - 1, 0);
    this.selectAndScroll(newIndex);
  }

  goToTop() {
    this.selectAndScroll(0);
  }

  goToBottom() {
    this.selectAndScroll(this.cachedItems.length - 1);
  }

  pageDown() {
    const visibleHeight = Math.max(1, this.list.height - 2);
    const halfPage = Math.floor(visibleHeight / 2);
    const newIndex = Math.min(this.list.selected + halfPage, this.cachedItems.length - 1);
    this.selectAndScroll(newIndex);
  }

  pageUp() {
    const visibleHeight = Math.max(1, this.list.height - 2);
    const halfPage = Math.floor(visibleHeight / 2);
    const newIndex = Math.max(this.list.selected - halfPage, 0);
    this.selectAndScroll(newIndex);
  }

  // ─────────────────────────────────────────────────────────────
  // Scroll Margin - adjust after blessed's selection
  // ─────────────────────────────────────────────────────────────

  adjustScrollMargin(index) {
    const margin = 2;
    const visibleHeight = Math.max(1, this.list.height - 2);
    const scrollTop = this.list.childBase || 0;
    const scrollBottom = scrollTop + visibleHeight - 1;

    // Adjust scroll to maintain margin around selection
    if (index < scrollTop + margin) {
      this.list.childBase = Math.max(0, index - margin);
    } else if (index > scrollBottom - margin) {
      this.list.childBase = Math.max(0, index - visibleHeight + 1 + margin);
    }
  }

  centerSelection(index) {
    const visibleHeight = Math.max(1, this.list.height - 2);
    const halfHeight = Math.floor(visibleHeight / 2);
    this.list.childBase = Math.max(0, index - halfHeight);
  }

  // ─────────────────────────────────────────────────────────────
  // Expand / Collapse
  // ─────────────────────────────────────────────────────────────

  expandOrSelect() {
    const index = this.list.selected;
    const item = this.cachedItems[index];
    if (!item) return;

    if (item.type === 'track') {
      this.onSelect({
        type: 'track',
        track: item.track,
        album: this.selectedAlbum,
        trackIndex: item.trackIndex
      });
    } else if (item.type === 'year') {
      this.toggleYear(item.year);
    } else if (item.type === 'album') {
      this.toggleAlbum(item.album);
    }
  }

  collapse() {
    const index = this.list.selected;
    const item = this.cachedItems[index];
    if (!item) return;

    const screenOffset = index - (this.list.childBase || 0);

    if (item.type === 'track') {
      // Find parent album and collapse it
      for (let i = index - 1; i >= 0; i--) {
        if (this.cachedItems[i].type === 'album') {
          const album = this.cachedItems[i].album;
          // Remember track position before collapsing
          this.lastSelectedTrackInAlbum.set(album.id, item.trackIndex);
          this.expandedAlbums.delete(album.id);
          this.selectedAlbum = null;
          // Calculate new screen offset for parent position
          const parentScreenOffset = i - (this.list.childBase || 0);
          this.rebuildAndSelect(i, parentScreenOffset);
          return;
        }
      }
    } else if (item.type === 'album') {
      // If album is expanded, collapse it first
      if (this.expandedAlbums.has(item.album.id)) {
        this.expandedAlbums.delete(item.album.id);
        this.selectedAlbum = null;
        this.rebuildAndSelect(index, screenOffset);
        return;
      }
      // Otherwise find parent year and collapse it
      for (let i = index - 1; i >= 0; i--) {
        if (this.cachedItems[i].type === 'year') {
          const year = this.cachedItems[i].year;
          // Remember album position before collapsing
          this.lastSelectedAlbumInYear.set(year, item.album.id);
          this.expandedYears.delete(year);
          this.selectedAlbum = null;
          // Calculate new screen offset for parent position
          const parentScreenOffset = i - (this.list.childBase || 0);
          this.rebuildAndSelect(i, parentScreenOffset);
          return;
        }
      }
    } else if (item.type === 'year') {
      // Collapse year if expanded
      if (this.expandedYears.has(item.year)) {
        this.expandedYears.delete(item.year);
        this.rebuildAndSelect(index, screenOffset);
      }
    }
  }

  toggleYear(year) {
    const wasExpanded = this.expandedYears.has(year);
    const currentIndex = this.list.selected;
    const screenOffset = currentIndex - (this.list.childBase || 0);

    if (wasExpanded) {
      this.expandedYears.delete(year);
      this.rebuildAndSelect(currentIndex, screenOffset);
    } else {
      this.expandedYears.add(year);
      this.selectedYear = year;
      this.onYearSelect(year);
      // Rebuild and restore to last album position if available
      const targetIndex = this.findLastAlbumIndex(year);
      this.rebuildAndSelect(targetIndex !== -1 ? targetIndex : currentIndex, screenOffset);
    }
  }

  toggleAlbum(album) {
    const wasExpanded = this.expandedAlbums.has(album.id);
    const currentIndex = this.list.selected;
    const screenOffset = currentIndex - (this.list.childBase || 0);

    if (wasExpanded) {
      this.expandedAlbums.delete(album.id);
      this.selectedAlbum = null;
      this.rebuildAndSelect(currentIndex, screenOffset);
    } else {
      this.expandedAlbums.add(album.id);
      this.selectedAlbum = album;
      this.onAlbumSelect(album);
      // Rebuild and restore to last track position if available
      const targetIndex = this.findLastTrackIndex(album.id);
      this.rebuildAndSelect(targetIndex !== -1 ? targetIndex : currentIndex, screenOffset);
    }
  }

  findLastAlbumIndex(year) {
    const lastAlbumId = this.lastSelectedAlbumInYear.get(year);
    if (!lastAlbumId) return -1;

    // Build items first to find the index
    const items = this.buildItems();
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'album' && items[i].album.id === lastAlbumId) {
        return i;
      }
    }
    return -1;
  }

  findLastTrackIndex(albumId) {
    const lastTrackIndex = this.lastSelectedTrackInAlbum.get(albumId);
    if (lastTrackIndex === undefined) return -1;

    // Build items first to find the index
    const items = this.buildItems();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'track' && item.trackIndex === lastTrackIndex) {
        // Verify it belongs to this album
        for (let j = i - 1; j >= 0; j--) {
          if (items[j].type === 'album') {
            if (items[j].album.id === albumId) {
              return i;
            }
            break;
          }
        }
      }
    }
    return -1;
  }

  // ─────────────────────────────────────────────────────────────
  // Search
  // ─────────────────────────────────────────────────────────────

  openSearch() {
    // Close existing search box if any to prevent duplicates
    if (this.searchBox) {
      this.closeSearchBox();
    }

    this.searchBox = blessed.textbox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      height: 1,
      width: '100%',
      style: { fg: 'white', bg: 'blue' },
      inputOnFocus: true
    });

    this.searchBox.setValue('/');
    this.searchBox.focus();
    this.screen.render();

    this.searchBox.on('submit', (value) => {
      const query = value.startsWith('/') ? value.slice(1) : value;
      this.performSearch(query);
      this.closeSearchBox();
    });

    this.searchBox.on('cancel', () => {
      this.closeSearchBox();
    });

    this.searchBox.key(['escape'], () => {
      this.closeSearchBox();
    });

    this.searchBox.readInput();
  }

  closeSearchBox() {
    if (this.searchBox) {
      // Explicitly remove all listeners before destroying
      this.searchBox.removeAllListeners('submit');
      this.searchBox.removeAllListeners('cancel');
      this.searchBox.removeAllListeners('keypress');
      this.searchBox.destroy();
      this.searchBox = null;
      this.list.focus();
      this.screen.render();
    }
  }

  performSearch(query) {
    if (!query || query.trim() === '') {
      this.clearSearch();
      return;
    }

    this.searchQuery = query.toLowerCase();
    this.searchMatches = [];

    for (let i = 0; i < this.cachedItems.length; i++) {
      if (this.cachedItems[i].text.toLowerCase().includes(this.searchQuery)) {
        this.searchMatches.push(i);
      }
    }

    if (this.searchMatches.length > 0) {
      this.searchMatchIndex = 0;
      this.goToMatch(this.searchMatches[0]);
    }

    this.updateLabel();
  }

  nextSearchMatch() {
    if (this.searchMatches.length === 0) return;
    this.searchMatchIndex = (this.searchMatchIndex + 1) % this.searchMatches.length;
    this.goToMatch(this.searchMatches[this.searchMatchIndex]);
  }

  prevSearchMatch() {
    if (this.searchMatches.length === 0) return;
    this.searchMatchIndex = (this.searchMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
    this.goToMatch(this.searchMatches[this.searchMatchIndex]);
  }

  goToMatch(index) {
    if (index < 0 || index >= this.cachedItems.length) return;
    this.list.selected = index;
    this.centerSelection(index);
    this.updateLabel();
    this.screen.render();
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchMatches = [];
    this.searchMatchIndex = 0;
    this.updateLabel();
    this.screen.render();
  }

  // ─────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────

  buildItems() {
    const items = [];

    for (const yearInfo of this.years) {
      const year = yearInfo.year;
      const isExpanded = this.expandedYears.has(year);
      const prefix = isExpanded ? '▼' : '▶';
      const albumCount = yearInfo.album_count || this.albums[year]?.length || 0;

      items.push({
        type: 'year',
        year: year,
        text: `${prefix} ${year} (${albumCount} albums)`
      });

      if (isExpanded && this.albums[year]) {
        for (const album of this.albums[year]) {
          const isAlbumExpanded = this.expandedAlbums.has(album.id);
          const albumPrefix = isAlbumExpanded ? '  ▼' : '  ▶';
          const favIcon = album.is_favorite ? '★ ' : '';
          const playedIcon = this.playedAlbums.has(album.id) ? '{green-fg}✓{/green-fg} ' : '';

          items.push({
            type: 'album',
            album: album,
            text: `${albumPrefix} ${playedIcon}${favIcon}${album.title}`
          });

          if (isAlbumExpanded && this.tracks[album.id]) {
            for (let i = 0; i < this.tracks[album.id].length; i++) {
              const track = this.tracks[album.id][i];
              const num = String(i + 1).padStart(2, '0');
              const trackPlayedIcon = this.playedTracks.has(track.id) ? '{green-fg}✓{/green-fg} ' : '  ';
              items.push({
                type: 'track',
                track: track,
                trackIndex: i,
                text: `    ${trackPlayedIcon}${num}. ${track.name}`
              });
            }
          }
        }
      }
    }

    return items;
  }

  rebuildAndSelect(targetIndex, preserveScreenOffset = null) {
    this.cachedItems = this.buildItems();
    this.list.setItems(this.cachedItems.map(i => i.text));

    const newIndex = Math.min(Math.max(0, targetIndex), this.cachedItems.length - 1);
    if (this.cachedItems.length > 0) {
      // Set selection directly (not using select() to avoid blessed's scroll)
      this.list.selected = newIndex;

      if (preserveScreenOffset !== null) {
        // Keep selection at same screen position
        const visibleHeight = Math.max(1, this.list.height - 2);
        const maxBase = Math.max(0, this.cachedItems.length - visibleHeight);
        let newBase = Math.max(0, newIndex - preserveScreenOffset);
        newBase = Math.min(newBase, maxBase);

        // Ensure selection is visible with margin
        const margin = 2;
        if (newIndex < newBase + margin) {
          newBase = Math.max(0, newIndex - margin);
        } else if (newIndex > newBase + visibleHeight - 1 - margin) {
          newBase = Math.max(0, newIndex - visibleHeight + 1 + margin);
        }

        this.list.childBase = newBase;
      } else {
        this.adjustScrollMargin(newIndex);
      }
    }
    this.updateLabel();
    this.screen.render();
  }

  updateLabel() {
    let label = ' Navigation ';

    if (this.searchMatches.length > 0) {
      const current = this.searchMatchIndex + 1;
      const total = this.searchMatches.length;
      label = ` [${current}/${total}] "${this.searchQuery}" `;
    } else if (this.searchQuery) {
      label = ` No matches: "${this.searchQuery}" `;
    } else if (this.selectedYear && this.selectedAlbum) {
      label = ` ${this.selectedYear} > ${this.truncate(this.selectedAlbum.title, 25)} `;
    } else if (this.selectedYear) {
      label = ` ${this.selectedYear} `;
    }

    this.box.setLabel(label);
  }

  truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 2) + '..';
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  setYears(years) {
    this.years = years;
    this.refreshPlayedStatus();
    this.rebuildAndSelect(0);
  }

  refreshPlayedStatus() {
    this.playedAlbums = albumRepo.getPlayedAlbumIds();
    this.playedTracks = trackRepo.getPlayedTrackIds();
  }

  markTrackCompleted(trackId, albumId) {
    if (trackId) {
      trackRepo.setPlayed(trackId, true);
      this.playedTracks.add(trackId);
    }
    // Check if all tracks in album are played
    if (albumId && trackRepo.areAllTracksPlayed(albumId)) {
      albumRepo.setPlayed(albumId, true);
      this.playedAlbums.add(albumId);
    }
    // Rebuild to update display
    const currentIndex = this.list.selected || 0;
    this.rebuildAndSelect(currentIndex);
  }

  toggleTrackPlayed(trackId, albumId) {
    if (!trackId) return;

    const isPlayed = this.playedTracks.has(trackId);
    trackRepo.setPlayed(trackId, !isPlayed);

    if (isPlayed) {
      this.playedTracks.delete(trackId);
      // If unmarking track, also unmark album
      if (albumId) {
        albumRepo.setPlayed(albumId, false);
        this.playedAlbums.delete(albumId);
      }
    } else {
      this.playedTracks.add(trackId);
      // Check if all tracks in album are played
      if (albumId && trackRepo.areAllTracksPlayed(albumId)) {
        albumRepo.setPlayed(albumId, true);
        this.playedAlbums.add(albumId);
      }
    }

    const currentIndex = this.list.selected || 0;
    this.rebuildAndSelect(currentIndex);
  }

  toggleAlbumPlayed(albumId) {
    if (!albumId) return;

    const isPlayed = this.playedAlbums.has(albumId);

    // Toggle all tracks in album
    trackRepo.markAllAsPlayed(albumId, !isPlayed);
    albumRepo.setPlayed(albumId, !isPlayed);

    if (isPlayed) {
      this.playedAlbums.delete(albumId);
      // Remove all tracks of this album from played set
      const tracks = this.tracks[albumId] || [];
      for (const track of tracks) {
        this.playedTracks.delete(track.id);
      }
    } else {
      this.playedAlbums.add(albumId);
      // Add all tracks of this album to played set
      const tracks = this.tracks[albumId] || [];
      for (const track of tracks) {
        this.playedTracks.add(track.id);
      }
    }

    const currentIndex = this.list.selected || 0;
    this.rebuildAndSelect(currentIndex);
  }

  getSelectedItem() {
    const index = this.list.selected;
    return this.cachedItems[index] || null;
  }

  saveCurrentPosition() {
    // Save the current list selection index directly
    const selectedIndex = this.list.selected || 0;

    // Also save expanded state
    const expandedYears = Array.from(this.expandedYears);
    const expandedAlbums = Array.from(this.expandedAlbums);

    playbackRepo.saveNavPosition(selectedIndex, expandedYears, expandedAlbums);
  }

  async restoreLastPosition() {
    const pos = playbackRepo.getNavPosition();
    if (!pos || (pos.expandedYears.length === 0 && pos.selectedIndex === 0)) {
      return false;
    }

    this.isRestoring = true;

    try {
      // Restore expanded years - load albums for each
      if (pos.expandedYears && pos.expandedYears.length > 0) {
        for (const year of pos.expandedYears) {
          this.expandedYears.add(year);
          await this.loadYearAlbums(year);
        }
      }

      // Restore expanded albums - load tracks for each
      if (pos.expandedAlbums && pos.expandedAlbums.length > 0) {
        for (const albumId of pos.expandedAlbums) {
          this.expandedAlbums.add(albumId);
          await this.loadAlbumTracks(albumId);
        }
      }

      // Rebuild and select saved position
      this.cachedItems = this.buildItems();
      this.list.setItems(this.cachedItems.map(i => i.text));

      const targetIdx = Math.min(pos.selectedIndex || 0, this.cachedItems.length - 1);
      if (this.list) {
        this.list.selected = targetIdx;
        this.centerSelection(targetIdx);
      }
      this.updateLabel();
      this.screen.render();

      return true;
    } catch (error) {
      // Log error but don't crash - restore failed gracefully
      console.error('Failed to restore navigation position:', error.message);
      return false;
    } finally {
      this.isRestoring = false;
    }
  }

  async loadYearAlbums(year) {
    // This will be called by App to load albums
    this.selectedYear = year;
    await this.onYearSelect(year);
  }

  async loadAlbumTracks(albumId) {
    // Find album in loaded albums
    for (const year in this.albums) {
      const album = this.albums[year]?.find(a => a.id === albumId);
      if (album) {
        this.selectedAlbum = album;
        await this.onAlbumSelect(album);
        return;
      }
    }
  }

  updateYearAlbumCount(year, count) {
    const yearData = this.years.find(y => y.year === year);
    if (yearData) {
      yearData.album_count = count;
      // Rebuild to update display
      const currentIndex = this.list.selected || 0;
      this.rebuildAndSelect(currentIndex);
    }
  }

  setAlbumsForYear(year, albums) {
    this.albums[year] = albums;

    // Skip rebuild if restoring - let restoreLastPosition handle it
    if (this.isRestoring) return;

    const currentIndex = this.list.selected || 0;
    const screenOffset = currentIndex - (this.list.childBase || 0);

    // Find target: last selected album or first album
    const targetIndex = this.findLastAlbumIndex(year);
    this.rebuildAndSelect(targetIndex !== -1 ? targetIndex : currentIndex, screenOffset);
  }

  setTracksForAlbum(albumId, tracks) {
    this.tracks[albumId] = tracks;

    // Skip rebuild if restoring - let restoreLastPosition handle it
    if (this.isRestoring) return;

    const currentIndex = this.list.selected || 0;
    const screenOffset = currentIndex - (this.list.childBase || 0);

    // Find target: last selected track or first track
    const targetIndex = this.findLastTrackIndex(albumId);
    this.rebuildAndSelect(targetIndex !== -1 ? targetIndex : currentIndex, screenOffset);
  }

  render() {
    this.rebuildAndSelect(this.list.selected || 0);
  }

  focus() {
    this.box.style.border.fg = 'white';
    this.list.focus();
    this.screen.render();
  }

  blur() {
    // Close search box when panel loses focus
    if (this.searchBox) {
      this.closeSearchBox();
    }
    this.box.style.border.fg = 'cyan';
    this.screen.render();
  }

  getBox() {
    return this.box;
  }

  getListItems() {
    return this.cachedItems;
  }

  refreshCurrentAlbum() {
    // Refresh album data from database and rebuild
    if (this.selectedAlbum) {
      const freshAlbum = albumRepo.getById(this.selectedAlbum.id);
      if (freshAlbum) {
        // Update in albums cache
        for (const year in this.albums) {
          const idx = this.albums[year]?.findIndex(a => a.id === freshAlbum.id);
          // Check idx >= 0 because findIndex returns -1 if not found, undefined if array is undefined
          if (idx >= 0) {
            this.albums[year][idx] = freshAlbum;
            break;
          }
        }
        this.selectedAlbum = freshAlbum;
      }
    }

    // Also refresh any visible album in the current selection
    const item = this.getSelectedItem();
    if (item?.type === 'album') {
      const freshAlbum = albumRepo.getById(item.album.id);
      if (freshAlbum) {
        for (const year in this.albums) {
          const idx = this.albums[year]?.findIndex(a => a.id === freshAlbum.id);
          if (idx >= 0) {
            this.albums[year][idx] = freshAlbum;
            break;
          }
        }
      }
    }

    // Rebuild to reflect changes
    const currentIndex = this.list.selected || 0;
    this.rebuildAndSelect(currentIndex);
  }
}
