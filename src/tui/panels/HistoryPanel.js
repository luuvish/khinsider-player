import blessed from 'blessed';

export class HistoryPanel {
  constructor(screen, options = {}) {
    this.screen = screen;
    this.maxHistory = options.maxHistory || 100;

    this.history = [];

    this.createPanel();
  }

  createPanel() {
    this.box = blessed.box({
      parent: this.screen,
      label: ' History ',
      top: '75%',
      left: 0,
      width: '100%',
      bottom: 3,
      border: { type: 'line' },
      padding: 0,
      style: {
        border: { fg: 'gray' },
        label: { fg: 'white', bold: true }
      }
    });

    this.log = blessed.log({
      parent: this.box,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      padding: 0,
      tags: true,
      keys: false,
      vi: false,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '│',
        track: { bg: 'gray' },
        style: { bg: 'gray' }
      },
      style: {
        fg: 'gray',
        bg: 'default'
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────────────────────

  formatTime() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  addEntry(type, message) {
    const time = this.formatTime();
    let prefix = '';
    let color = 'white';

    switch (type) {
      case 'play':
        prefix = '▶';
        color = 'green';
        break;
      case 'pause':
        prefix = '❚❚';
        color = 'yellow';
        break;
      case 'stop':
        prefix = '■';
        color = 'gray';
        break;
      case 'download':
        prefix = '↓';
        color = 'cyan';
        break;
      case 'favorite':
        prefix = '★';
        color = 'yellow';
        break;
      case 'error':
        prefix = '✖';
        color = 'red';
        break;
      case 'info':
        prefix = 'ℹ';
        color = 'blue';
        break;
      default:
        prefix = '•';
        color = 'white';
    }

    const entry = {
      time,
      type,
      message,
      formatted: `{${color}-fg}${time} ${prefix} ${message}{/${color}-fg}`
    };

    this.history.push(entry);

    // Trim history if too long
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.log.log(entry.formatted);
    this.screen.render();
  }

  // Convenience methods
  logPlay(message) {
    this.addEntry('play', message);
  }

  logPause(message) {
    this.addEntry('pause', message);
  }

  logStop(message) {
    this.addEntry('stop', message);
  }

  logDownload(message) {
    this.addEntry('download', message);
  }

  logFavorite(message) {
    this.addEntry('favorite', message);
  }

  logError(message) {
    this.addEntry('error', message);
  }

  logInfo(message) {
    this.addEntry('info', message);
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  clear() {
    this.history = [];
    this.log.setContent('');
    this.screen.render();
  }

  focus() {
    this.log.focus();
    this.box.style.border.fg = 'white';
    this.screen.render();
  }

  blur() {
    this.box.style.border.fg = 'gray';
    this.screen.render();
  }

  getBox() {
    return this.box;
  }
}
