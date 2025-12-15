import { Router, Request, Response } from 'express'
import axios from 'axios'
import { plexService } from '../services/plexService.js'
import { config } from '../config.js'
import fs from 'fs'
import path from 'path'

const router = Router()

// Cache for file paths (ratingKey -> filePath)
const filePathCache = new Map<string, { filePath: string; fileSize: number; container: string }>()

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

  const movie = await plexService.findByTmdbId(tmdbId, 'movie')
  if (!movie) {
    res.json({ found: false })
    return
  }

  const playbackInfo = await plexService.getPlaybackInfo(movie.ratingKey)
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

  const episodeData = await plexService.findEpisode(showTmdbId, season, episode)
  if (!episodeData) {
    res.json({ found: false })
    return
  }

  const playbackInfo = await plexService.getPlaybackInfo(episodeData.ratingKey)
  if (!playbackInfo) {
    res.json({ found: false })
    return
  }

  res.json({
    found: true,
    ...playbackInfo
  })
})

// Get playback info by Plex rating key (metadata only, not file streaming)
router.get('/info/:ratingKey', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey } = req.params

  const playbackInfo = await plexService.getPlaybackInfo(ratingKey)
  if (!playbackInfo) {
    res.status(404).json({ error: 'Media not found' })
    return
  }

  res.json({
    ...playbackInfo
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
// SUBTITLE STREAMING
// Proxies subtitles from Plex and converts to WebVTT format
// ============================================================================

// Get subtitle from Plex by stream ID
router.get('/subtitle/:ratingKey/:streamId', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey, streamId } = req.params

  try {
    // Plex subtitle URL format
    const subtitleUrl = `${config.plex.url}/library/streams/${streamId}?X-Plex-Token=${config.plex.token}`

    console.log(`Fetching subtitle: ${subtitleUrl}`)

    const response = await axios.get(subtitleUrl, {
      responseType: 'text',
      timeout: 30000
    })

    let subtitleContent = response.data as string

    // Convert SRT to WebVTT if needed
    if (!subtitleContent.startsWith('WEBVTT')) {
      subtitleContent = convertSrtToVtt(subtitleContent)
    }

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(subtitleContent)
  } catch (error: any) {
    console.error('Subtitle fetch error:', error.message)
    res.status(502).json({ error: 'Failed to fetch subtitle' })
  }
})

// Convert SRT format to WebVTT
function convertSrtToVtt(srt: string): string {
  // Add WebVTT header
  let vtt = 'WEBVTT\n\n'

  // Replace SRT timestamp format (00:00:00,000) with WebVTT format (00:00:00.000)
  const converted = srt
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    // Remove SRT sequence numbers (lines with just numbers)
    .replace(/^\d+\s*$/gm, '')
    // Clean up extra blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  vtt += converted
  return vtt
}

// ============================================================================
// DIRECT FILE STREAMING
// Serves video files directly with range request support for seeking
// ============================================================================

// Get content type for video container
const getContentType = (container: string): string => {
  const types: Record<string, string> = {
    'mp4': 'video/mp4',
    'm4v': 'video/mp4',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'ts': 'video/mp2t',
  }
  return types[container.toLowerCase()] || 'video/mp4'
}

// Direct file streaming with range request support
router.get('/stream/:ratingKey', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey } = req.params

  try {
    // Check cache first
    let fileInfo = filePathCache.get(ratingKey)

    if (!fileInfo) {
      // Get playback info to get file path
      const playbackInfo = await plexService.getPlaybackInfo(ratingKey)
      if (!playbackInfo || !playbackInfo.filePath) {
        res.status(404).json({ error: 'Media file not found' })
        return
      }

      fileInfo = {
        filePath: playbackInfo.filePath,
        fileSize: playbackInfo.fileSize || 0,
        container: playbackInfo.mediaInfo.container
      }

      // Cache for future requests
      filePathCache.set(ratingKey, fileInfo)
    }

    const { filePath, container } = fileInfo

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      res.status(404).json({ error: 'Media file not found on disk' })
      return
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const contentType = getContentType(container)

    // Handle range requests for seeking
    const range = req.headers.range

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      console.log(`Streaming ${ratingKey}: bytes ${start}-${end}/${fileSize} (${Math.round(chunkSize / 1024)}KB)`)

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      })

      const stream = fs.createReadStream(filePath, { start, end })
      stream.pipe(res)

      stream.on('error', (err) => {
        console.error('Stream error:', err)
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' })
        }
      })
    } else {
      // No range - send entire file (initial request)
      console.log(`Streaming ${ratingKey}: full file ${Math.round(fileSize / 1024 / 1024)}MB`)

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      })

      const stream = fs.createReadStream(filePath)
      stream.pipe(res)

      stream.on('error', (err) => {
        console.error('Stream error:', err)
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' })
        }
      })
    }
  } catch (error: any) {
    console.error('Streaming error:', error.message)
    res.status(500).json({ error: 'Failed to stream file' })
  }
})

// ============================================================================
// HLS PROXY ENDPOINTS (kept for fallback/transcoding if needed)
// ============================================================================

// Proxy HLS manifest (.m3u8 files)
router.get('/proxy/hls/:ratingKey/master.m3u8', async (req: Request, res: Response) => {
  if (!plexService.isEnabled()) {
    res.status(503).json({ error: 'Plex is not configured' })
    return
  }

  const { ratingKey } = req.params
  const quality = req.query.quality as string | undefined
  const authToken = req.query.token as string | undefined
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

    // Build auth token suffix for rewritten URLs
    const tokenSuffix = authToken ? `&token=${encodeURIComponent(authToken)}` : ''

    // Rewrite absolute Plex URLs to use our proxy
    manifest = manifest.replace(
      new RegExp(`${config.plex.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^\\s"']+)`, 'g'),
      (match, path) => {
        // Check if URL already has query params
        const hasQuery = path.includes('?')
        return `/api/playback/proxy/plex${path}${hasQuery ? tokenSuffix : `?dummy=1${tokenSuffix}`}`
      }
    )

    // Handle relative URLs that start with /video
    manifest = manifest.replace(
      /^(\/video\/[^\s"']+)/gm,
      (match) => {
        const hasQuery = match.includes('?')
        return `/api/playback/proxy/plex${match}${hasQuery ? tokenSuffix : `?dummy=1${tokenSuffix}`}`
      }
    )

    // Handle relative URLs like "session/xxx/base/index.m3u8" (no leading slash)
    // These are relative to the transcode endpoint, so we need to make them absolute
    manifest = manifest.replace(
      /^(session\/[^\s"']+)/gm,
      (match) => {
        const hasQuery = match.includes('?')
        return `/api/playback/proxy/plex/video/:/transcode/universal/${match}${hasQuery ? tokenSuffix : `?dummy=1${tokenSuffix}`}`
      }
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
  const authToken = req.query.token as string | undefined

  // Build query string, excluding our auth token (it's for our API, not Plex)
  const queryParams = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'token' && key !== 'dummy' && typeof value === 'string') {
      queryParams.set(key, value)
    }
  }
  const queryString = queryParams.toString()

  // Build full Plex URL
  let plexUrl = `${config.plex.url}/${plexPath}`
  if (queryString) {
    plexUrl += `?${queryString}`
  }

  // Add Plex token if not present
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

      // Build auth token suffix for rewritten URLs
      const tokenSuffix = authToken ? `&token=${encodeURIComponent(authToken)}` : ''

      // Rewrite absolute Plex URLs
      manifest = manifest.replace(
        new RegExp(`${config.plex.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^\\s"']+)`, 'g'),
        (match, path) => {
          const hasQuery = path.includes('?')
          return `/api/playback/proxy/plex${path}${hasQuery ? tokenSuffix : `?dummy=1${tokenSuffix}`}`
        }
      )

      // Rewrite relative URLs that start with /video
      manifest = manifest.replace(
        /^(\/video\/[^\s"']+)/gm,
        (match) => {
          const hasQuery = match.includes('?')
          return `/api/playback/proxy/plex${match}${hasQuery ? tokenSuffix : `?dummy=1${tokenSuffix}`}`
        }
      )

      // Handle relative URLs like "session/xxx/..." or segment files
      // Get the base path from the current request to resolve relative URLs
      const pathParts = plexPath.split('/')
      pathParts.pop() // Remove filename
      const basePath = pathParts.join('/')

      // Rewrite relative segment URLs (e.g., "00000/00000.ts" or "chunk-00001.ts")
      manifest = manifest.replace(
        /^([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.(?:ts|m4s|mp4|m3u8))/gm,
        (match) => {
          const fullPath = basePath ? `${basePath}/${match}` : match
          const hasQuery = match.includes('?')
          return `/api/playback/proxy/plex/${fullPath}${hasQuery ? tokenSuffix : `?dummy=1${tokenSuffix}`}`
        }
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
