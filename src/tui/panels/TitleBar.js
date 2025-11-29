import blessed from 'blessed';

export class TitleBar {
  constructor(screen) {
    this.screen = screen;
    this.isLoggedIn = false;
    this.username = '';
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
      content: '{bold} ♪ Khinsider Player v1.0{/bold}',
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
      return `{green-fg}●{/green-fg} {white-fg}${this.username}{/white-fg}  {cyan-fg}[L]ogin{/cyan-fg} `;
    } else {
      return `{red-fg}○{/red-fg} {gray-fg}Not logged in{/gray-fg}  {cyan-fg}[L]ogin{/cyan-fg} `;
    }
  }

  setLoginStatus(isLoggedIn, username = '') {
    this.isLoggedIn = isLoggedIn;
    this.username = username;
    this.rightBox.setContent(this.getRightContent());
    this.screen.render();
  }

  getBox() {
    return this.box;
  }
}
