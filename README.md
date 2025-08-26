# Khinsider Player

A command-line music player for video game soundtracks from khinsider.com.

## Features

- **Search & Play**: Search for video game soundtracks and play them directly
- **Playlist Management**: Create playlists and manage continuous playback
- **Favorites**: Mark and save favorite tracks locally
- **History**: Track your listening history
- **Interactive UI**: Easy-to-use command-line interface

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

## How it works

1. Search for video game soundtracks from khinsider.com
2. Select albums and tracks from the results
3. Stream music directly from the source
4. Manage your playlists and favorites

## Project Structure

```
src/
├── index.js     # Main entry point
├── scraper.js   # Web scraping functionality
├── player.js    # Audio playback logic
├── playlist.js  # Playlist management
├── favorites.js # Favorites handling
└── ui.js        # User interface
```

## Data Storage

- **Favorites**: `data/favorites.json`
- **History**: `data/history.json`
- **Downloads**: `downloads/` directory

## Requirements

- Node.js 16+
- Internet connection
- Audio system support