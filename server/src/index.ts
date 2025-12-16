import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { config } from './config.js'
import authRoutes from './routes/auth.js'
import torrentRoutes from './routes/torrents.js'
import libraryRoutes from './routes/library.js'
import playbackRoutes from './routes/playback.js'
import mediaRoutes from './routes/media.js'
import progressRoutes from './routes/progress.js'
import hlsProxyRoutes from './routes/hlsProxy.js'
import { authMiddleware } from './middleware/auth.js'
import { setupWebSocket } from './websocket/progressSocket.js'
import { downloadManager } from './services/downloadManager.js'

const app = express()
const server = createServer(app)

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)
    // Allow the configured origin
    if (origin === config.corsOrigin) return callback(null, true)
    // Allow any origin for development or if CORS_ORIGIN is set to *
    if (config.corsOrigin === '*') return callback(null, true)
    // Allow same host with different ports (for local development)
    try {
      const originUrl = new URL(origin)
      const configUrl = new URL(config.corsOrigin)
      if (originUrl.hostname === configUrl.hostname) {
        return callback(null, true)
      }
    } catch {
      // Invalid URL, reject
    }
    callback(null, true) // Allow all origins for now (can be restricted later)
  },
  credentials: true
}))
app.use(express.json())

// Public routes (no auth required)
app.use('/api/auth', authRoutes)
app.use('/api/proxy', hlsProxyRoutes) // HLS proxy for Jellyfin streams (no auth - HLS.js can't send headers)

// Protected routes (auth required)
app.use('/api/torrents', authMiddleware, torrentRoutes)
app.use('/api/library', authMiddleware, libraryRoutes)
app.use('/api/playback', authMiddleware, playbackRoutes)
app.use('/api/media', authMiddleware, mediaRoutes) // Plex-free media routes
app.use('/api/progress', authMiddleware, progressRoutes) // Watch progress tracking

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', downloadPath: config.downloadPath })
})

// Setup WebSocket
setupWebSocket(server)

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await downloadManager.destroy()
  server.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  await downloadManager.destroy()
  server.close()
  process.exit(0)
})

// Start server
server.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`)
  console.log(`Download path: ${config.downloadPath}`)
  console.log(`CORS origin: ${config.corsOrigin}`)
  console.log(`Auth enabled: ${config.auth.enabled}`)
  console.log(`Plex enabled: ${config.plex.enabled}`)
  console.log(`Radarr enabled: ${config.radarr.enabled}`)
  console.log(`Sonarr enabled: ${config.sonarr.enabled}`)
  console.log(`Media API: /api/media (Plex-free, uses Radarr/Sonarr + ffmpeg)`)
})
