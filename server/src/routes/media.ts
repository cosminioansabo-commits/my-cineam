import { Router, Request, Response } from 'express'
import { mediaService } from '../services/mediaService.js'
import { jellyfinService } from '../services/jellyfinService.js'

const router = Router()

// ============================================================================
// PLAYBACK INFO ENDPOINTS (via Jellyfin)
// ============================================================================

// Check if media service is available
router.get('/status', async (req: Request, res: Response) => {
  const enabled = mediaService.isEnabled()
  const jellyfinEnabled = jellyfinService.isEnabled()

  res.json({
    enabled,
    connected: enabled,
    jellyfin: {
      enabled: jellyfinEnabled,
      connected: jellyfinEnabled ? await jellyfinService.testConnection() : false
    }
  })
})

// ============================================================================
// JELLYFIN INTEGRATION ENDPOINTS
// ============================================================================

// Get Jellyfin stream URL with specific audio track
router.get('/jellyfin/audio/:itemId/:audioIndex', async (req: Request, res: Response) => {
  const { itemId, audioIndex } = req.params
  const { mediaSourceId, playSessionId } = req.query

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  if (!mediaSourceId || !playSessionId) {
    res.status(400).json({ error: 'mediaSourceId and playSessionId required' })
    return
  }

  const hlsUrl = jellyfinService.getHlsUrlWithAudioTrack(
    itemId,
    mediaSourceId as string,
    playSessionId as string,
    parseInt(audioIndex, 10)
  )

  res.json({ hlsUrl })
})

// Report playback progress to Jellyfin
router.post('/jellyfin/progress', async (req: Request, res: Response) => {
  const { itemId, positionMs, isPaused } = req.body

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  // Convert ms to ticks (1 tick = 10,000 nanoseconds = 0.01 ms)
  const positionTicks = positionMs * 10000

  await jellyfinService.reportProgress(itemId, positionTicks, isPaused || false)
  res.json({ success: true })
})

// Report playback stopped to Jellyfin
router.post('/jellyfin/stopped', async (req: Request, res: Response) => {
  const { itemId, positionMs } = req.body

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  const positionTicks = positionMs * 10000

  await jellyfinService.reportStopped(itemId, positionTicks)
  res.json({ success: true })
})

// Trigger Jellyfin library refresh
router.post('/jellyfin/refresh', async (req: Request, res: Response) => {
  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  await jellyfinService.refreshLibrary()
  res.json({ success: true })
})

// ============================================================================
// PLAYBACK INFO ENDPOINTS (Radarr/Sonarr lookup + Jellyfin streaming)
// ============================================================================

// Get playback info for a movie by TMDB ID
router.get('/movie/:tmdbId', async (req: Request, res: Response) => {
  const tmdbId = parseInt(req.params.tmdbId, 10)
  console.log(`Media API: Getting movie playback for TMDB ID ${tmdbId}`)

  try {
    const playbackInfo = await mediaService.getMoviePlayback(tmdbId)
    if (!playbackInfo) {
      console.log(`Media API: Movie ${tmdbId} not found or no file available`)
      res.json({ found: false })
      return
    }

    console.log(`Media API: Movie ${tmdbId} found, stream URL: ${playbackInfo.streamUrl.substring(0, 80)}...`)
    res.json(playbackInfo)
  } catch (error: any) {
    console.error('Error getting movie playback:', error.message)
    res.status(500).json({ error: 'Failed to get playback info' })
  }
})

// Get playback info for an episode by TMDB show ID, season, and episode
router.get('/episode/:showTmdbId/:season/:episode', async (req: Request, res: Response) => {
  const showTmdbId = parseInt(req.params.showTmdbId, 10)
  const season = parseInt(req.params.season, 10)
  const episode = parseInt(req.params.episode, 10)

  try {
    const playbackInfo = await mediaService.getEpisodePlayback(showTmdbId, season, episode)
    if (!playbackInfo) {
      res.json({ found: false })
      return
    }

    res.json(playbackInfo)
  } catch (error: any) {
    console.error('Error getting episode playback:', error.message)
    res.status(500).json({ error: 'Failed to get playback info' })
  }
})

export default router
