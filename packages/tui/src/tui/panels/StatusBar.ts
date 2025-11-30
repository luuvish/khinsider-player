import blessed from 'blessed';
import { getStatusBarText } from '../utils/keyBindings.js';
import { escapeBlessedMarkup } from '../utils/formatters.js';

export class StatusBar {
  screen: blessed.Widgets.Screen;
  message: string;
  messageTimeout: ReturnType<typeof setTimeout> | null;
  box: blessed.Widgets.BoxElement;
  content: blessed.Widgets.TextElement | null;

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;
    this.message = '';
    this.messageTimeout = null;

    // Initialize UI elements (assigned in createPanel)
    this.box = null!;
    this.content = null;

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

  showMessage(message: string, duration = 3000): void {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    // Guard against destroyed elements
    if (!this.content) return;

    // Escape user-provided content to prevent blessed markup injection
    this.content.setContent(`{yellow-fg}${escapeBlessedMarkup(message)}{/yellow-fg}`);
    this.screen.render();

    this.messageTimeout = setTimeout(() => {
      // Guard against destroyed elements in timeout callback
      if (!this.content) return;
      this.content.setContent(getStatusBarText());
      this.screen.render();
    }, duration);
  }

  showError(message: string): void {
    // Note: Message is escaped in showMessage, so we pass pre-formatted markup
    // The inner message needs escaping but not the markup tags
    this.showMessageRaw(`{red-fg}Error: ${escapeBlessedMarkup(message)}{/red-fg}`, 5000);
  }

  showSuccess(message: string): void {
    this.showMessageRaw(`{green-fg}${escapeBlessedMarkup(message)}{/green-fg}`, 3000);
  }

  showInfo(message: string): void {
    this.showMessageRaw(`{cyan-fg}${escapeBlessedMarkup(message)}{/cyan-fg}`, 3000);
  }

  // Internal method for pre-formatted messages with markup
  private showMessageRaw(formattedMessage: string, duration = 3000): void {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    // Guard against destroyed elements
    if (!this.content) return;

    this.content.setContent(formattedMessage);
    this.screen.render();

    this.messageTimeout = setTimeout(() => {
      // Guard against destroyed elements in timeout callback
      if (!this.content) return;
      this.content.setContent(getStatusBarText());
      this.screen.render();
    }, duration);
  }

  reset() {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
    // Guard against destroyed elements
    if (!this.content) return;
    this.content.setContent(getStatusBarText());
    this.screen.render();
  }

  destroy() {
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
    // Mark as destroyed to prevent timeout callbacks from accessing elements
    this.content = null;
  }

  getBox() {
    return this.box;
  }
}
