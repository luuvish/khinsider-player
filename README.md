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

## Usage

Start the player:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

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
├── index.js                 # Main entry point
├── scraper.js               # Web scraping & API client
├── data/
│   ├── database.js          # SQLite database setup
│   └── repositories/        # Data access layer
│       ├── album-repo.js
│       ├── track-repo.js
│       ├── settings-repo.js
│       ├── history-repo.js
│       └── playback-repo.js
├── storage/
│   ├── manager.js           # Download directory management
│   └── downloader.js        # Album download handler
├── playback/
│   ├── player.js            # Audio player (mpv)
│   └── controller.js        # Playback state management
└── tui/
    ├── App.js               # Main application
    ├── panels/
    │   ├── NavigationPanel.js
    │   ├── FavoritesPanel.js
    │   ├── NowPlayingPanel.js
    │   ├── HistoryPanel.js
    │   ├── StatusBar.js
    │   └── TitleBar.js
    └── utils/
        ├── keyBindings.js
        └── formatters.js
```

## Data Storage

- **Database**: `data/khinsider.db` (SQLite)
- **Downloads**: `downloads/` directory

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