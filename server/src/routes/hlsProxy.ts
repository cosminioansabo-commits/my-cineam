import { Router, Request, Response } from 'express'
import axios from 'axios'
import { jellyfinService } from '../services/jellyfinService.js'
import { config } from '../config.js'

const router = Router()

// ============================================================================
// HLS PROXY ENDPOINTS (to bypass Private Network Access restrictions)
// These routes are PUBLIC (no auth) because HLS.js cannot send auth headers
// Security: The Jellyfin API key is kept server-side, never exposed to client
// ============================================================================

// Proxy HLS master playlist (.m3u8)
router.get('/hls/:itemId/master.m3u8', async (req: Request, res: Response) => {
  const { itemId } = req.params
  const queryParams = req.query

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  try {
    // Build the Jellyfin URL using internal URL
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) params.set(key, String(value))
    }

    const jellyfinUrl = `${config.jellyfin.url}/Videos/${itemId}/master.m3u8?${params.toString()}`
    console.log(`HLS proxy: Fetching master manifest from ${jellyfinUrl.substring(0, 80)}...`)

    const response = await axios.get(jellyfinUrl, {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      },
      responseType: 'text'
    })

    // Rewrite URLs in the manifest to point to our proxy
    let manifest = response.data as string
    const backendUrl = config.externalUrl.replace(/\/$/, '')

    // Rewrite segment URLs to go through our proxy
    // Jellyfin returns relative URLs like: hls1/main/0.ts
    manifest = manifest.replace(
      /^(hls\d+\/[^\n]+)$/gm,
      `${backendUrl}/api/proxy/hls/${itemId}/$1?${params.toString()}`
    )

    // Also handle absolute URLs if Jellyfin returns them
    const jellyfinBaseUrl = config.jellyfin.url
    manifest = manifest.replace(
      new RegExp(jellyfinBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/Videos/' + itemId + '/', 'g'),
      `${backendUrl}/api/proxy/hls/${itemId}/`
    )

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(manifest)
  } catch (error: any) {
    console.error('HLS proxy master error:', error.message)
    if (error.response) {
      console.error('Jellyfin response:', error.response.status, error.response.data?.substring?.(0, 200))
    }
    res.status(500).json({ error: 'Failed to proxy HLS manifest' })
  }
})

// Proxy HLS variant playlist (e.g., hls1/main/0.m3u8)
router.get('/hls/:itemId/:hlsPath(*).m3u8', async (req: Request, res: Response) => {
  const { itemId, hlsPath } = req.params
  const queryParams = req.query

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  try {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) params.set(key, String(value))
    }

    const jellyfinUrl = `${config.jellyfin.url}/Videos/${itemId}/${hlsPath}.m3u8?${params.toString()}`

    const response = await axios.get(jellyfinUrl, {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      },
      responseType: 'text'
    })

    let manifest = response.data as string
    const backendUrl = config.externalUrl.replace(/\/$/, '')

    // Rewrite segment URLs - they're typically relative like "0.ts", "1.ts"
    // Get the directory path for relative URL resolution
    const dirPath = hlsPath.includes('/') ? hlsPath.substring(0, hlsPath.lastIndexOf('/') + 1) : ''

    // Rewrite .ts segment references
    manifest = manifest.replace(
      /^(\d+\.ts.*)$/gm,
      `${backendUrl}/api/proxy/hls/${itemId}/${dirPath}$1`
    )

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(manifest)
  } catch (error: any) {
    console.error('HLS proxy variant error:', error.message)
    res.status(500).json({ error: 'Failed to proxy HLS variant playlist' })
  }
})

// Proxy HLS segments (.ts files)
router.get('/hls/:itemId/:segmentPath(*).ts', async (req: Request, res: Response) => {
  const { itemId, segmentPath } = req.params
  const queryParams = req.query

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  try {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) params.set(key, String(value))
    }

    const jellyfinUrl = `${config.jellyfin.url}/Videos/${itemId}/${segmentPath}.ts?${params.toString()}`

    const response = await axios.get(jellyfinUrl, {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      },
      responseType: 'stream'
    })

    res.setHeader('Content-Type', 'video/mp2t')
    res.setHeader('Access-Control-Allow-Origin', '*')
    response.data.pipe(res)
  } catch (error: any) {
    console.error('HLS proxy segment error:', error.message)
    res.status(500).json({ error: 'Failed to proxy HLS segment' })
  }
})

// Proxy subtitle files from Jellyfin
router.get('/subtitles/:itemId/:mediaSourceId/:streamIndex/Stream.:format', async (req: Request, res: Response) => {
  const { itemId, mediaSourceId, streamIndex, format } = req.params

  if (!jellyfinService.isEnabled()) {
    res.status(503).json({ error: 'Jellyfin not enabled' })
    return
  }

  try {
    const jellyfinUrl = `${config.jellyfin.url}/Videos/${itemId}/${mediaSourceId}/Subtitles/${streamIndex}/Stream.${format}`

    const response = await axios.get(jellyfinUrl, {
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey
      },
      responseType: 'text'
    })

    const contentType = format === 'vtt' ? 'text/vtt' : 'text/plain'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(response.data)
  } catch (error: any) {
    console.error('Subtitle proxy error:', error.message)
    res.status(500).json({ error: 'Failed to proxy subtitle' })
  }
})

export default router
