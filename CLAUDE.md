# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Build for production
npm run preview  # Preview production build
```

**Backend (in `server/` directory):**
```bash
cd server
npm install
npm run dev      # Build TypeScript and run with --watch
npm run build    # Compile TypeScript to dist/
npm run start    # Run compiled server
```

**Docker Deployment:**
```bash
docker compose -f docker-compose.my-cinema.yml up -d
```

## Environment Variables

**Frontend** (`.env`):
- `VITE_TMDB_API_KEY` - The Movie Database API key
- `VITE_TORRENT_API_URL` - Backend API URL (default: http://localhost:3001)
- `VITE_OMDB_API_KEY` - OMDB API key (for Rotten Tomatoes/Metacritic scores)

**Backend** (`server/.env`):
- `JWT_SECRET` - Random secret for signing auth tokens (32+ characters)
- `APP_PASSWORD_HASH` - Bcrypt hash of password (omit to disable auth)
- `JELLYFIN_URL` - Internal Jellyfin URL (container name in Docker)
- `JELLYFIN_EXTERNAL_URL` - External Jellyfin URL (for browser HLS streaming)
- `JELLYFIN_API_KEY` - Jellyfin API key
- Radarr/Sonarr/qBittorrent/Prowlarr connection settings

## Architecture Overview

This is a Vue 3 media browsing application (Netflix-style) with:
- Torrent search/download via Prowlarr + qBittorrent
- Media library management via Radarr (movies) and Sonarr (TV)
- Video playback via Jellyfin HLS transcoding

### Tech Stack
- **Vue 3** with Composition API (`<script setup>`)
- **Pinia** for state management
- **Vue Router** with authentication guards
- **PrimeVue** (Aura theme) + **Tailwind CSS v4** for UI
- **Axios** for HTTP requests
- **TypeScript** with strict mode
- **Backend**: Express.js server with WebSocket for real-time updates

### Key Architectural Patterns

**Services Layer** (`src/services/`):
- `tmdbService.ts` - TMDB API integration. Responses transformed from snake_case to camelCase.
- `torrentService.ts` - Torrent search/download with WebSocket progress updates
- `libraryService.ts` - Radarr/Sonarr integration for library management
- `mediaService.ts` - Jellyfin playback integration (HLS streaming)
- `omdbService.ts` - OMDB API for Rotten Tomatoes/Metacritic scores
- `progressService.ts` - Watch progress tracking (local database)

**State Management** (`src/stores/`):
- `mediaStore` - Trending, search, browse results, and current media details
- `torrentsStore` - Download queue and WebSocket connection management
- `filtersStore` - Browse page filter state (genres, year, rating, platforms)
- `authStore` - Authentication state with JWT token management

**Composables** (`src/composables/`):
- `useAuthInterceptor` - Axios interceptor for auth tokens and 401 handling
- `useLocalStorage` - Reactive localStorage wrapper
- `useDebounce` - Debounce utility for search inputs

### Type System

Core types in `src/types/index.ts`:
- `Media` / `MediaDetails` - Base and detailed media info
- `MediaType` = 'movie' | 'tv'
- `Season`, `Episode`, `SeasonDetails` - TV show structures
- `FilterOptions` - Browse page filtering

Torrent types in `src/types/torrent.ts` for download management.

### Backend Structure (`server/src/`)

- `routes/` - Express route handlers (torrents, library, auth, media, progress, hlsProxy)
- `services/` - Business logic:
  - `jellyfinService.ts` - Jellyfin API for HLS streaming and transcoding
  - `mediaService.ts` - Combines Radarr/Sonarr lookup with Jellyfin playback
  - `radarrService.ts` / `sonarrService.ts` - Media library management
  - `qbittorrentService.ts` - Torrent download management
  - `progressService.ts` - Watch progress database (SQLite)
- `websocket/` - WebSocket server for real-time download progress
- `middleware/` - Auth middleware with JWT verification

### Path Alias

Use `@/` alias for imports from `src/` (configured in both vite.config.ts and tsconfig.json).
