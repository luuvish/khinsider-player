export const keyBindings = {
  // Global keys
  global: {
    'space': 'togglePause',
    'f': 'toggleFavorite',
    'd': 'download',
    'p': 'togglePlayed',
    'i': 'toggleImages',
    'q': 'quit',
    '?': 'help'
  },

  // Navigation panel
  navigation: {
    'up': 'moveUp',
    'k': 'moveUp',
    'down': 'moveDown',
    'j': 'moveDown',
    'enter': 'select',
    'left': 'collapse',
    'h': 'collapse',
    'right': 'expand',
    'l': 'expand',
    'g': 'goToTop',
    'G': 'goToBottom'
  }
};

export const helpText = `
╔═══════════════════════════════════════════════════════╗
║               Khinsider Player - Help                 ║
╠═══════════════════════════════════════════════════════╣
║  Navigation:                                          ║
║    ↑/k ↓/j   Move up/down                             ║
║    ←/h →/l   Collapse/Expand                          ║
║    Enter     Select/Play track                        ║
║    g / G     Go to top/bottom                         ║
║    /         Search                                   ║
║    n / N     Next/Prev search result                  ║
║    Esc       Clear search                             ║
║                                                       ║
║  Playback:                                            ║
║    Space     Play/Pause                               ║
║                                                       ║
║  Other:                                               ║
║    f         Add/Remove favorite                      ║
║    d         Download album (MP3+FLAC+Images)         ║
║    p         Toggle played status                     ║
║    i         Toggle album images list                 ║
║    r         Refresh current item                     ║
║    L         Login/Logout                             ║
║    ?         Show this help                           ║
║    q         Quit                                     ║
╚═══════════════════════════════════════════════════════╝
`;

export function getKeyDescription(key) {
  const descriptions = {
    'space': '[Space] Play/Pause',
    'f': '[f] Favorite',
    'q': '[q] Quit',
    '?': '[?] Help'
  };
  return descriptions[key] || '';
}

export function getStatusBarText() {
  return ' [Space] Pause  [f] Favorite  [d] Download  [p] Played  [i] Images  [?] Help  [q] Quit ';
}
