import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Get the directory of this file to find .env relative to it
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.resolve(__dirname, '../../.env')

// Try to load .env from server directory
const result = dotenv.config({ path: envPath })
if (result.error) {
  console.warn(`Warning: Could not load .env from ${envPath}`)
}

const downloadPath = process.env.DOWNLOAD_PATH || path.join(process.env.HOME || '/tmp', 'Downloads', 'my-cinema')

// Ensure download directory exists
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true })
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  downloadPath,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // WebTorrent settings
  torrent: {
    maxConnections: 100,
    uploadLimit: -1,  // Unlimited
    downloadLimit: -1 // Unlimited
  },

  // Radarr settings (for movies)
  radarr: {
    url: process.env.RADARR_URL || 'http://localhost:7878',
    apiKey: process.env.RADARR_API_KEY || '',
    enabled: !!process.env.RADARR_API_KEY
  },

  // Sonarr settings (for TV shows)
  sonarr: {
    url: process.env.SONARR_URL || 'http://localhost:8989',
    apiKey: process.env.SONARR_API_KEY || '',
    enabled: !!process.env.SONARR_API_KEY
  },

  // Prowlarr settings (indexer aggregator)
  prowlarr: {
    url: process.env.PROWLARR_URL || 'http://localhost:9696',
    apiKey: process.env.PROWLARR_API_KEY || '',
    enabled: !!process.env.PROWLARR_API_KEY
  },

  // Search providers configuration
  // Available: prowlarr, torrentio, yts
  searchProviders: (process.env.SEARCH_PROVIDERS || 'prowlarr,torrentio')
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0),

  // qBittorrent settings
  qbittorrent: {
    url: process.env.QBITTORRENT_URL || 'http://localhost:8080',
    username: process.env.QBITTORRENT_USERNAME || 'admin',
    password: process.env.QBITTORRENT_PASSWORD || '',
    enabled: !!process.env.QBITTORRENT_URL && !!process.env.QBITTORRENT_PASSWORD
  },

  // Authentication settings
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-use-random-32-chars',
    passwordHash: process.env.APP_PASSWORD_HASH || '',
    tokenExpiry: process.env.TOKEN_EXPIRY || '7d',
    enabled: !!process.env.APP_PASSWORD_HASH
  },

  // Plex Media Server settings
  plex: {
    url: process.env.PLEX_URL || 'http://localhost:32400',
    token: process.env.PLEX_TOKEN || '',
    enabled: !!process.env.PLEX_URL && !!process.env.PLEX_TOKEN
  },

  // Jellyfin Media Server settings
  jellyfin: {
    url: process.env.JELLYFIN_URL || 'http://localhost:8096',
    apiKey: process.env.JELLYFIN_API_KEY || '',
    enabled: !!process.env.JELLYFIN_URL && !!process.env.JELLYFIN_API_KEY
  }
}
