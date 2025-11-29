import blessed from 'blessed';
import { formatDuration, truncate } from '../utils/formatters.js';

export class NowPlayingPanel {
  constructor(screen) {
    this.screen = screen;
    this.currentTrack = null;
    this.currentAlbum = null;
    this.trackIndex = 0;
    this.totalTracks = 0;
    this.albumIndex = 0;
    this.totalAlbums = 0;
    this.state = 'idle';
    this.year = null;
    this.isFavorite = false;
    this.isDownloaded = false;
    this.albumMeta = null;  // { images: [], metadata: {} }
    this.imagesExpanded = false;  // Folding state for images

    this.createPanel();
  }

  createPanel() {
    this.box = blessed.box({
      parent: this.screen,
      label: ' Now Playing ',
      top: '50%',
      left: 0,
      width: '100%',
      height: '25%',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { fg: 'white', bold: true }
      }
    });

    // Left side: Track info
    this.trackInfo = blessed.box({
      parent: this.box,
      top: 0,
      left: 1,
      width: '50%-2',
      height: '100%-2',
      content: '',
      tags: true
    });

    // Right side: Album info (scrollable)
    this.albumInfo = blessed.box({
      parent: this.box,
      top: 0,
      left: '50%',
      width: '50%-2',
      height: '100%-2',
      content: '',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      scrollbar: {
        ch: '│',
        style: { bg: 'green' }
      }
    });

    this.render();
  }

  getTrackContent() {
    if (this.state === 'idle') {
      return '{gray-fg}No track playing{/gray-fg}';
    }

    const stateIcon = this.getStateIcon();
    const trackName = this.currentTrack?.name || 'Unknown Track';
    const duration = formatDuration(this.currentTrack?.duration);

    const trackProgress = this.totalTracks > 0
      ? `${this.trackIndex + 1}/${this.totalTracks}`
      : '';

    const lines = [
      `${stateIcon} {bold}${truncate(trackName, 55)}{/bold}`,
      '',
      `   {gray-fg}Duration:{/gray-fg} ${duration}   {gray-fg}Track:{/gray-fg} ${trackProgress}`
    ];

    return lines.join('\n');
  }

  getAlbumContent() {
    const favIcon = this.isFavorite ? '{yellow-fg}★{/yellow-fg}' : '{gray-fg}☆{/gray-fg}';
    const downloadIcon = this.isDownloaded ? '{green-fg}✓{/green-fg}' : '{gray-fg}○{/gray-fg}';

    if (!this.currentAlbum) {
      return `${favIcon} ${downloadIcon}\n\n{gray-fg}No album selected{/gray-fg}`;
    }

    const albumTitle = this.currentAlbum?.title || 'Unknown Album';
    const lines = [
      `${favIcon} ${downloadIcon}  {bold}{cyan-fg}${truncate(albumTitle, 40)}{/cyan-fg}{/bold}`
    ];

    // Show metadata lines in original format
    if (this.albumMeta?.metadataLines?.length > 0) {
      lines.push('');
      for (const item of this.albumMeta.metadataLines) {
        lines.push(`{gray-fg}${item.label}:{/gray-fg} {white-fg}${item.value}{/white-fg}`);
      }
    } else {
      // Fallback to basic info from album object
      const year = this.currentAlbum?.year || this.year;
      const platform = this.currentAlbum?.platform;
      if (year) lines.push(`{gray-fg}Year:{/gray-fg} {white-fg}${year}{/white-fg}`);
      if (platform) lines.push(`{gray-fg}Platform:{/gray-fg} {white-fg}${platform}{/white-fg}`);
    }

    // Images section (foldable)
    if (this.albumMeta?.images?.length > 0) {
      lines.push('');
      const foldIcon = this.imagesExpanded ? '▼' : '▶';
      lines.push(`{magenta-fg}${foldIcon} Images ({white-fg}${this.albumMeta.images.length}{/white-fg}{magenta-fg}):{/magenta-fg} {gray-fg}[i] to toggle{/gray-fg}`);

      if (this.imagesExpanded) {
        // Show each image on its own line when expanded
        this.albumMeta.images.forEach((url, i) => {
          let name = decodeURIComponent(url.split('/').pop());
          name = name.replace(/\.(jpg|jpeg|png|gif)$/i, '');
          lines.push(`  {gray-fg}${String(i + 1).padStart(2)}.{/gray-fg} ${truncate(name, 36)}`);
        });
      }
    }

    return lines.join('\n');
  }

  getStateIcon() {
    switch (this.state) {
      case 'playing': return '{green-fg}▶{/green-fg}';
      case 'paused': return '{yellow-fg}❚❚{/yellow-fg}';
      case 'loading': return '{cyan-fg}⟳{/cyan-fg}';
      case 'error': return '{red-fg}✖{/red-fg}';
      default: return '{gray-fg}■{/gray-fg}';
    }
  }

  update(data) {
    if (data.track !== undefined) this.currentTrack = data.track;
    if (data.album !== undefined) this.currentAlbum = data.album;
    if (data.trackIndex !== undefined) this.trackIndex = data.trackIndex;
    if (data.totalTracks !== undefined) this.totalTracks = data.totalTracks;
    if (data.albumIndex !== undefined) this.albumIndex = data.albumIndex;
    if (data.totalAlbums !== undefined) this.totalAlbums = data.totalAlbums;
    if (data.state !== undefined) this.state = data.state;
    if (data.year !== undefined) this.year = data.year;

    this.render();
  }

  setPlaying(track, album, trackIndex, totalTracks) {
    this.update({
      track,
      album,
      trackIndex,
      totalTracks,
      state: 'playing'
    });
  }

  setPaused() {
    this.update({ state: 'paused' });
  }

  setLoading() {
    this.update({ state: 'loading' });
  }

  setIdle() {
    this.albumMeta = null;
    this.update({
      track: null,
      album: null,
      state: 'idle',
      trackIndex: 0,
      totalTracks: 0
    });
  }

  setError(message) {
    this.update({ state: 'error' });
  }

  setAlbum(album) {
    if (!album) {
      this.currentAlbum = null;
      this.isFavorite = false;
      this.isDownloaded = false;
      this.albumMeta = null;
    } else {
      this.currentAlbum = album;
      this.isFavorite = album.is_favorite || false;
      this.isDownloaded = album.is_downloaded || false;
    }
    this.render();
  }

  setAlbumInfo(info) {
    this.albumMeta = info;
    this.render();
  }

  setFavorite(isFavorite) {
    this.isFavorite = isFavorite;
    this.render();
  }

  toggleImages() {
    this.imagesExpanded = !this.imagesExpanded;
    this.render();
  }

  render() {
    this.trackInfo.setContent(this.getTrackContent());
    this.albumInfo.setContent(this.getAlbumContent());
    this.screen.render();
  }

  getBox() {
    return this.box;
  }
}
