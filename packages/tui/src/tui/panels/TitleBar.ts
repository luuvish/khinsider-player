import blessed from 'blessed';
import { escapeBlessedMarkup } from '../utils/formatters.js';

export class TitleBar {
  screen: blessed.Widgets.Screen;
  isLoggedIn: boolean;
  username: string;
  box: blessed.Widgets.BoxElement;
  leftBox: blessed.Widgets.BoxElement;
  rightBox: blessed.Widgets.BoxElement;

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;
    this.isLoggedIn = false;
    this.username = '';

    // Initialize UI elements (assigned in createPanel)
    this.box = null!;
    this.leftBox = null!;
    this.rightBox = null!;

    this.createPanel();
  }

  createPanel() {
    this.box = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Left side: logo and title
    this.leftBox = blessed.box({
      parent: this.box,
      top: 0,
      left: 0,
      width: '50%',
      height: 1,
      tags: true,
      content: '{bold} ♪ Khinsider Player v2.0{/bold}',
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Right side: login status and author
    this.rightBox = blessed.box({
      parent: this.box,
      top: 0,
      right: 0,
      width: '50%',
      height: 1,
      tags: true,
      align: 'right',
      content: this.getRightContent(),
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });
  }

  getRightContent() {
    if (this.isLoggedIn) {
      return `{green-fg}●{/green-fg} {white-fg}${escapeBlessedMarkup(this.username)}{/white-fg}  {cyan-fg}[L]ogin{/cyan-fg} `;
    } else {
      return `{red-fg}○{/red-fg} {gray-fg}Not logged in{/gray-fg}  {cyan-fg}[L]ogin{/cyan-fg} `;
    }
  }

  setLoginStatus(isLoggedIn: boolean, username = ''): void {
    this.isLoggedIn = isLoggedIn;
    this.username = username;
    this.rightBox.setContent(this.getRightContent());
    this.screen.render();
  }

  getBox() {
    return this.box;
  }
}
