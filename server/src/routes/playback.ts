import { Router, Request, Response } from 'express'
import { plexService } from '../services/plexService.js'
import { config } from '../config.js'
import axios from 'axios'

const router = Router()

// Check Plex connection status
router.get('/status', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.json({ enabled: false, connected: false })
    return
  }

  const connected = await plexService.testConnection()
  res.json({ enabled: true, connected })
})

// Get available libraries
router.get('/libraries', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const libraries = await plexService.getLibraries()
  res.json({ libraries })
})

// Get playback info for a movie by TMDB ID
router.get('/movie/:tmdbId', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const tmdbId = parseInt(req.params.tmdbId, 10)
  const quality = req.query.quality as string | undefined

  const movie = await plexService.findByTmdbId(tmdbId, 'movie')
  if (!movie) {
    res.json({ found: false })
    return
  }

  const playbackInfo = await plexService.getPlaybackInfo(movie.ratingKey, { quality })
  if (!playbackInfo) {
    res.json({ found: false })
    return
  }

  res.json({
    found: true,
    ...playbackInfo
  })
})

// Get playback info for a TV episode by TMDB show ID, season, and episode
router.get('/episode/:showTmdbId/:season/:episode', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const showTmdbId = parseInt(req.params.showTmdbId, 10)
  const season = parseInt(req.params.season, 10)
  const episode = parseInt(req.params.episode, 10)
  const quality = req.query.quality as string | undefined

  const episodeData = await plexService.findEpisode(showTmdbId, season, episode)
  if (!episodeData) {
    res.json({ found: false })
    return
  }

  const playbackInfo = await plexService.getPlaybackInfo(episodeData.ratingKey, { quality })
  if (!playbackInfo) {
    res.json({ found: false })
    return
  }

  res.json({
    found: true,
    ...playbackInfo
  })
})

// Get stream URL by Plex rating key (for direct access)
router.get('/stream/:ratingKey', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey } = req.params
  const quality = req.query.quality as string | undefined
  const location = req.query.location as 'lan' | 'wan' | undefined

  const playbackInfo = await plexService.getPlaybackInfo(ratingKey, { quality })
  if (!playbackInfo) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  // Regenerate stream URL with requested options
  const streamUrl = plexService.getStreamUrl(ratingKey, { quality, location })

  res.json({
    ...playbackInfo,
    streamUrl
  })
})

// Update playback progress
router.post('/progress', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey, timeMs, state, duration } = req.body

  if (!ratingKey || timeMs === undefined || !state) {
    res.status(400).json({ error: 'Missing required fields: ratingKey, timeMs, state' })
    return
  }

  await plexService.updateProgress(ratingKey, timeMs, state, duration)
  res.json({ success: true })
})

// Mark as watched
router.post('/watched/:ratingKey', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  await plexService.markAsWatched(req.params.ratingKey)
  res.json({ success: true })
})

// Mark as unwatched
router.delete('/watched/:ratingKey', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  await plexService.markAsUnwatched(req.params.ratingKey)
  res.json({ success: true })
})

// Get continue watching (on deck)
router.get('/continue-watching', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const items = await plexService.getContinueWatching()

  // Transform to include stream URLs
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const playbackInfo = await plexService.getPlaybackInfo(item.ratingKey)
      return {
        ratingKey: item.ratingKey,
        title: item.grandparentTitle
          ? `${item.grandparentTitle} - S${item.parentIndex}E${item.index}`
          : item.title,
        fullTitle: item.grandparentTitle
          ? `${item.grandparentTitle} - S${item.parentIndex}E${item.index} - ${item.title}`
          : item.title,
        type: item.type,
        thumb: item.thumb ? `${process.env.PLEX_URL}${item.thumb}?X-Plex-Token=${process.env.PLEX_TOKEN}` : null,
        duration: item.duration,
        viewOffset: item.viewOffset || 0,
        progress: item.viewOffset && item.duration
          ? Math.round((item.viewOffset / item.duration) * 100)
          : 0,
        streamUrl: playbackInfo?.streamUrl
      }
    })
  )

  res.json({ items: enrichedItems })
})

// Get recently added
router.get('/recently-added', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const limit = parseInt(req.query.limit as string) || 20
  const items = await plexService.getRecentlyAdded(limit)

  res.json({ items })
})

// Get available profiles (for multi-user support)
router.get('/profiles', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const profiles = await plexService.getProfiles()
  res.json({ profiles })
})

// Invalidate library cache (useful after adding new media)
router.post('/refresh-cache', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  plexService.invalidateCache()
  res.json({ success: true, message: 'Cache invalidated' })
})

// ============================================================================
// STREAM PROXY ENDPOINTS
// These proxy Plex streams through the backend to avoid CORS issues
// ============================================================================

// Proxy HLS manifest (.m3u8 files)
router.get('/proxy/hls/:ratingKey/master.m3u8', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey } = req.params
  const quality = req.query.quality as string | undefined
  const sessionId = req.query.session as string || `my-cinema-${Date.now()}`

  try {
    // Build the Plex transcode URL
    const params = new URLSearchParams({
      path: `/library/metadata/${ratingKey}`,
      mediaIndex: '0',
      partIndex: '0',
      protocol: 'hls',
      fastSeek: '1',
      directPlay: '1',
      directStream: '1',
      subtitleSize: '100',
      audioBoost: '100',
      location: 'lan',
      session: sessionId,
      'X-Plex-Token': config.plex.token,
      'X-Plex-Client-Identifier': 'my-cinema-proxy',
      'X-Plex-Product': 'My Cinema',
      'X-Plex-Platform': 'Web'
    })

    // Add quality settings if not original
    if (quality && quality !== 'original') {
      const bitrates: Record<string, string> = {
        '1080p': '20000',
        '720p': '4000',
        '480p': '2000',
        '360p': '720'
      }
      if (bitrates[quality]) {
        params.set('maxVideoBitrate', bitrates[quality])
        params.set('directPlay', '0')
        params.set('directStream', '0')
      }
    }

    const plexUrl = `${config.plex.url}/video/:/transcode/universal/start.m3u8?${params.toString()}`

    const response = await axios.get(plexUrl, {
      responseType: 'text',
      timeout: 30000
    })

    // Rewrite URLs in the manifest to go through our proxy
    let manifest = response.data as string

    // Rewrite absolute Plex URLs to use our proxy
    manifest = manifest.replace(
      new RegExp(`${config.plex.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
      `/api/playback/proxy/plex`
    )

    // Also handle relative URLs that start with /video
    manifest = manifest.replace(
      /^(\/video\/)/gm,
      `/api/playback/proxy/plex$1`
    )

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(manifest)
  } catch (error: any) {
    console.error('Plex proxy error (manifest):', error.message)
    res.status(502).json({ error: 'Failed to fetch stream from Plex' })
  }
})

// Proxy all Plex requests (segments, sub-manifests, etc.)
router.get('/proxy/plex/*', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  // Get the path after /proxy/plex/
  const plexPath = req.params[0]
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : ''

  // Build full Plex URL
  let plexUrl = `${config.plex.url}/${plexPath}`
  if (queryString) {
    plexUrl += `?${queryString}`
  }

  // Add token if not present
  if (!plexUrl.includes('X-Plex-Token')) {
    plexUrl += (plexUrl.includes('?') ? '&' : '?') + `X-Plex-Token=${config.plex.token}`
  }

  try {
    const response = await axios.get(plexUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'Accept': '*/*',
        'X-Plex-Client-Identifier': 'my-cinema-proxy',
        'X-Plex-Product': 'My Cinema'
      }
    })

    // Determine content type
    const contentType = response.headers['content-type'] || 'application/octet-stream'

    // For m3u8 files, rewrite URLs
    if (contentType.includes('mpegurl') || plexPath.endsWith('.m3u8')) {
      let manifest = Buffer.from(response.data).toString('utf-8')

      // Rewrite absolute Plex URLs
      manifest = manifest.replace(
        new RegExp(`${config.plex.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
        `/api/playback/proxy/plex`
      )

      // Rewrite relative URLs
      manifest = manifest.replace(
        /^(\/video\/)/gm,
        `/api/playback/proxy/plex$1`
      )

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.send(manifest)
    } else {
      // For segments and other binary data, pass through as-is
      res.setHeader('Content-Type', contentType)
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length'])
      }
      res.send(Buffer.from(response.data))
    }
  } catch (error: any) {
    console.error('Plex proxy error:', error.message, 'URL:', plexUrl)
    res.status(502).json({ error: 'Failed to fetch from Plex' })
  }
})

export default router
