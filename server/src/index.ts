import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { config } from './config.js'
import authRoutes from './routes/auth.js'
import torrentRoutes from './routes/torrents.js'
import libraryRoutes from './routes/library.js'
import playbackRoutes from './routes/playback.js'
import { authMiddleware } from './middleware/auth.js'
import { setupWebSocket } from './websocket/progressSocket.js'
import { downloadManager } from './services/downloadManager.js'

const app = express()
const server = createServer(app)

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}))
app.use(express.json())

// Public routes (no auth required)
app.use('/api/auth', authRoutes)

// Protected routes (auth required)
app.use('/api/torrents', authMiddleware, torrentRoutes)
app.use('/api/library', authMiddleware, libraryRoutes)
app.use('/api/playback', authMiddleware, playbackRoutes)

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
  console.log(`Plex enabled: ${config.plex.enabled} (URL: ${config.plex.url}, Token: ${config.plex.token ? '***set***' : 'NOT SET'})`)
})
