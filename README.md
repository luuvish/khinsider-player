# Khinsider Player

A full-stack music player for video game soundtracks from khinsider.com with TUI (Terminal UI), Web Client, and REST API.

## Features

- **Browse by Year**: Navigate albums organized by release year (1975-present)
- **Stream Music**: Play tracks directly without downloading
- **Bulk Download**: Download entire albums as ZIP files (MP3, FLAC)
- **Favorites**: Mark albums as favorites for quick access (per-user)
- **Played Status**: Track which albums and tracks you've listened to
- **Search**: Search albums across the entire library
- **Auto-Login**: Save credentials for bulk download access
- **Position Restore**: Resume from where you left off
- **Multi-Platform**: TUI for terminal, Web Client for browser, REST API for integration

## Architecture

This is a **monorepo** with the following packages:

| Package | Description |
|---------|-------------|
| `@khinsider/shared` | Shared types, utilities, caching, and guards |
| `@khinsider/core` | Scraper, database, repositories, and storage |
| `@khinsider/tui` | Terminal UI application (blessed) |
| `@khinsider/server` | REST API server with Socket.IO |
| `@khinsider/client` | React web client (Vite) |

## Installation

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd khinsider-player

# Install dependencies
pnpm install

# Build all packages
pnpm run build
```

## Usage

### Terminal UI (TUI)

```bash
# Start the TUI application
pnpm --filter @khinsider/tui start

# Or run in development mode
pnpm --filter @khinsider/tui dev
```

### Web Server + Client

```bash
# Start the API server
pnpm --filter @khinsider/server start

# Start the web client (development)
pnpm --filter @khinsider/client dev
```

### Development

```bash
# Run all in development mode
pnpm run dev

# Type checking
pnpm run typecheck

# Linting
pnpm run lint

# Run tests
pnpm test:run
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build all packages |
| `pnpm run dev` | Run all packages in development mode |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm run lint` | Run ESLint |
| `pnpm test:run` | Run tests |

## Keyboard Shortcuts (TUI)

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
| `d` | Download album (MP3 + FLAC) |
| `p` | Toggle played status |
| `r` | Refresh current item |
| `L` | Login / Logout |
| `?` | Show help |
| `q` | Quit |

## Download Format

Albums are downloaded to `downloads/{year}/{album-slug}/` with:
- `{album-slug}-mp3.zip` - MP3 tracks
- `{album-slug}-flac.zip` - FLAC tracks (if available)
- `{album-slug}-cover.jpg` - Album cover
- `{album-slug}-metadata.json` - Album information

Note: Bulk download requires a khinsider.com account.

## Project Structure

```
packages/
├── shared/                    # Shared utilities & types
│   └── src/
│       ├── types/             # Type definitions
│       ├── utils/             # Utilities (cache, guards, errors)
│       └── constants.ts       # Shared constants
├── core/                      # Core business logic
│   └── src/
│       ├── scraper/           # Web scraping (modularized)
│       │   ├── http.ts        # HTTP client & rate limiting
│       │   ├── parser.ts      # HTML parsing
│       │   ├── auth.ts        # Authentication
│       │   └── index.ts       # Scraper facade
│       ├── data/              # Database layer
│       │   ├── database.ts    # SQLite setup
│       │   └── repositories/  # Data access
│       ├── storage/           # Download management
│       └── playback/          # Audio playback (TUI only)
├── tui/                       # Terminal UI
│   └── src/
│       ├── tui/
│       │   ├── App.ts         # Main application
│       │   ├── panels/        # UI panels
│       │   └── utils/         # TUI utilities
│       └── index.ts           # Entry point
├── server/                    # REST API Server
│   └── src/
│       ├── routes/            # API endpoints
│       ├── middleware/        # Auth, security, error handling
│       ├── socket/            # Socket.IO handlers
│       └── validation/        # Zod schemas
└── client/                    # React Web Client
    └── src/
        ├── components/        # React components
        ├── stores/            # Zustand stores
        ├── api/               # API client & socket
        └── hooks/             # Custom hooks
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Get current user |
| `GET` | `/api/auth/csrf-token` | Get CSRF token |

### Albums
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/albums/years` | Get all years |
| `GET` | `/api/albums/year/:year` | Get albums by year |
| `GET` | `/api/albums/:id` | Get album details |
| `GET` | `/api/albums/:id/tracks` | Get album tracks |
| `POST` | `/api/albums/:id/favorite` | Toggle favorite |
| `GET` | `/api/albums/favorites/list` | Get user favorites |

### Tracks
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tracks/:id` | Get track details |
| `GET` | `/api/tracks/:id/stream-url` | Get stream URL |
| `POST` | `/api/tracks/:id/played` | Mark as played |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?q=query` | Search albums |

## Security Features

- **CSRF Protection**: Double-submit cookie pattern with token validation
- **Rate Limiting**: Per-IP and per-user rate limiting
- **JWT Authentication**: Secure token-based auth with blacklist support
- **Input Validation**: Zod schemas for all API inputs
- **SSRF Prevention**: URL whitelist for external requests
- **XSS Prevention**: Input sanitization and output encoding
- **Graceful Shutdown**: Proper cleanup of all resources

## Data Storage

- **Database**: `data/khinsider.db` (SQLite with WAL mode)
- **Downloads**: `downloads/` directory

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.x |
| Runtime | Node.js 18+ |
| Package Manager | pnpm (monorepo) |
| TUI | Blessed |
| Web Framework | Express |
| Web Client | React + Vite |
| State Management | Zustand |
| Database | SQLite (better-sqlite3) |
| HTTP Client | Axios |
| Scraping | Cheerio |
| Validation | Zod |
| Build | tsup |
| Testing | Vitest |

## Requirements

- Node.js 18+
- pnpm 8+
- Audio player for TUI (platform-specific):
  - **macOS**: `afplay` (built-in)
  - **Linux**: `mpg123`
  - **Windows**: PowerShell (built-in)

### Installing mpg123 (Linux only)

```bash
# Ubuntu/Debian
sudo apt install mpg123

# Fedora
sudo dnf install mpg123

# Arch
sudo pacman -S mpg123
```

## Environment Variables

### Server
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `JWT_SECRET` | (required) | JWT signing secret |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origins |

## License

MIT
