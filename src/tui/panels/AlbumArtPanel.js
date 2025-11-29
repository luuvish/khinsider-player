import blessed from 'blessed';

export class AlbumArtPanel {
  constructor(screen) {
    this.screen = screen;
    this.albumTitle = '';
    this.platform = '';
    this.year = '';
    this.isFavorite = false;

    this.createPanel();
  }

  createPanel() {
    this.box = blessed.box({
      parent: this.screen,
      label: ' Album Info ',
      top: '50%',
      left: '50%',
      width: '50%',
      height: '30%',
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'white', bold: true }
      }
    });

    this.content = blessed.box({
      parent: this.box,
      top: 0,
      left: 1,
      width: '100%-4',
      height: '100%-2',
      content: this.getContent(),
      tags: true
    });
  }

  getContent() {
    if (!this.albumTitle) {
      return '{center}{gray-fg}No album selected{/gray-fg}{/center}';
    }

    const favIcon = this.isFavorite ? '{yellow-fg}★ Favorite{/yellow-fg}' : '';
    const downloadedIcon = this.isDownloaded ? '{green-fg}✓ Downloaded{/green-fg}' : '';

    // Simple ASCII art placeholder
    const art = [
      '  ╔══════════════╗',
      '  ║   ♪  ♫  ♪   ║',
      '  ║  ╭───────╮  ║',
      '  ║  │  ◉    │  ║',
      '  ║  │   ◉   │  ║',
      '  ║  ╰───────╯  ║',
      '  ║   ♪  ♫  ♪   ║',
      '  ╚══════════════╝'
    ];

    const lines = [
      '',
      ...art,
      '',
      `  {bold}${this.albumTitle}{/bold}`,
      this.platform ? `  Platform: ${this.platform}` : '',
      this.year ? `  Year: ${this.year}` : '',
      '',
      `  ${favIcon} ${downloadedIcon}`
    ];

    return lines.filter(l => l !== undefined).join('\n');
  }

  setAlbum(album) {
    if (!album) {
      this.albumTitle = '';
      this.platform = '';
      this.year = '';
      this.isFavorite = false;
      this.isDownloaded = false;
    } else {
      this.albumTitle = album.title || '';
      this.platform = album.platform || '';
      this.year = album.year || '';
      this.isFavorite = album.is_favorite || false;
      this.isDownloaded = album.is_downloaded || false;
    }
    this.render();
  }

  setFavorite(isFavorite) {
    this.isFavorite = isFavorite;
    this.render();
  }

  render() {
    this.content.setContent(this.getContent());
    this.screen.render();
  }

  getBox() {
    return this.box;
  }
}
