# Khinsider Player

A terminal-based music player and downloader for video game soundtracks from khinsider.com.

## Features

- **Browse by Year**: Navigate albums organized by release year (1975-present)
- **Stream Music**: Play tracks directly without downloading
- **Bulk Download**: Download entire albums as ZIP files (MP3, FLAC, and images)
- **Favorites**: Mark albums as favorites for quick access
- **Played Status**: Track which albums and tracks you've listened to
- **Album Art**: View album cover and images in the terminal
- **Search**: Search within the navigation tree
- **Auto-Login**: Save credentials for bulk download access
- **Position Restore**: Resume from where you left off

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd khinsider-player
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

Start the player:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the application |
| `npm run dev` | Run with auto-restart on file changes |
| `npm run build` | Build TypeScript to JavaScript |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |

## Keyboard Shortcuts

### Navigation
| Key | Action |
|-----|--------|
| `↑` / `k` | Move up |
| `↓` / `j` | Move down |
| `←` / `h` | Collapse / Go back |
| `→` / `l` | Expand / Enter |
| `Enter` | Select / Play track |
| `g` / `G` | Go to top / bottom |
| `/` | Search |
| `n` / `N` | Next / Previous search result |
| `Esc` | Clear search |
| `Tab` | Switch panel (Navigation ↔ Favorites) |

### Playback
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |

### Actions
| Key | Action |
|-----|--------|
| `f` | Add / Remove favorite |
| `d` | Download album (MP3 + FLAC + Images) |
| `p` | Toggle played status |
| `i` | Toggle album images list |
| `r` | Refresh current item |
| `L` | Login / Logout |
| `?` | Show help |
| `q` | Quit |

## Download Format

Albums are downloaded to `downloads/{year}/{album-slug}/` with:
- `{album-slug}-mp3.zip` - MP3 tracks
- `{album-slug}-flac.zip` - FLAC tracks (if available)
- `{album-slug}-images.zip` - Album artwork
- `{album-slug}-cover.jpg` - Album cover
- `{album-slug}-metadata.json` - Album information

Note: Bulk download requires a khinsider.com account. Login credentials are saved locally.

## Project Structure

```
src/
├── index.ts                 # Main entry point
├── scraper.ts               # Web scraping & API client
├── constants.ts             # Application constants
├── types/
│   ├── index.ts             # Type exports
│   ├── models.ts            # Data models & interfaces
│   └── blessed.d.ts         # Blessed type definitions
├── data/
│   ├── database.ts          # SQLite database setup
│   └── repositories/        # Data access layer
│       ├── album-repo.ts
│       ├── track-repo.ts
│       ├── settings-repo.ts
│       ├── history-repo.ts
│       └── playback-repo.ts
├── storage/
│   ├── manager.ts           # Download directory management
│   ├── downloader.ts        # Album download handler
│   └── index.ts
├── playback/
│   ├── player.ts            # Audio player (afplay/mpg123/PowerShell)
│   ├── controller.ts        # Playback state management
│   └── index.ts
├── tui/
│   ├── App.ts               # Main application
│   ├── index.ts
│   ├── panels/
│   │   ├── NavigationPanel.ts
│   │   ├── FavoritesPanel.ts
│   │   ├── NowPlayingPanel.ts
│   │   ├── HistoryPanel.ts
│   │   ├── StatusBar.ts
│   │   └── TitleBar.ts
│   └── utils/
│       ├── keyBindings.ts
│       ├── formatters.ts
│       └── loginForm.ts
└── utils/
    └── index.ts             # Utility functions
```

## Data Storage

- **Database**: `data/khinsider.db` (SQLite)
- **Downloads**: `downloads/` directory

## Tech Stack

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 18+
- **UI**: Blessed (terminal UI)
- **Database**: SQLite (better-sqlite3)
- **HTTP**: Axios with cookie support
- **Scraping**: Cheerio
- **Build**: tsup
- **Linting**: ESLint with TypeScript support

## Requirements

- Node.js 18+
- Internet connection
- Audio player (platform-specific):
  - **macOS**: `afplay` (built-in)
  - **Linux**: `mpg123`
  - **Windows**: PowerShell (built-in)

### Installing mpg123 (Linux only)

Ubuntu/Debian:
```bash
sudo apt install mpg123
```

Fedora:
```bash
sudo dnf install mpg123
```

Arch:
```bash
sudo pacman -S mpg123
```

## License

MIT
