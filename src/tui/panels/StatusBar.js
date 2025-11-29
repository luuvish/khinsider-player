import blessed from 'blessed';
import { getStatusBarText } from '../utils/keyBindings.js';

export class StatusBar {
  constructor(screen) {
    this.screen = screen;
    this.message = '';
    this.messageTimeout = null;

    this.createPanel();
  }

  createPanel() {
    this.box = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        bg: 'black'
      }
    });

    this.content = blessed.text({
      parent: this.box,
      top: 0,
      left: 1,
      width: '100%-4',
      height: 1,
      content: getStatusBarText(),
      tags: true,
      style: {
        fg: 'white'
      }
    });
  }

  showMessage(message, duration = 3000) {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    this.content.setContent(`{yellow-fg}${message}{/yellow-fg}`);
    this.screen.render();

    this.messageTimeout = setTimeout(() => {
      this.content.setContent(getStatusBarText());
      this.screen.render();
    }, duration);
  }

  showError(message) {
    this.showMessage(`{red-fg}Error: ${message}{/red-fg}`, 5000);
  }

  showSuccess(message) {
    this.showMessage(`{green-fg}${message}{/green-fg}`, 3000);
  }

  showInfo(message) {
    this.showMessage(`{cyan-fg}${message}{/cyan-fg}`, 3000);
  }

  reset() {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    this.content.setContent(getStatusBarText());
    this.screen.render();
  }

  getBox() {
    return this.box;
  }
}
