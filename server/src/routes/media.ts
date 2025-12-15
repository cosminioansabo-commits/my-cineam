import { Router, Request, Response } from 'express'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { mediaService } from '../services/mediaService.js'

const router = Router()

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

// ============================================================================
// PLAYBACK INFO ENDPOINTS
// ============================================================================

// Check if media service is available
router.get('/status', async (req: Request, res: Response) => {
  const enabled = mediaService.isEnabled()
  res.json({ enabled, connected: enabled })
})

// Get playback info for a movie by TMDB ID
router.get('/movie/:tmdbId', async (req: Request, res: Response) => {
  const tmdbId = parseInt(req.params.tmdbId, 10)

  try {
    const playbackInfo = await mediaService.getMoviePlayback(tmdbId)
    if (!playbackInfo) {
      res.json({ found: false })
      return
    }

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

// ============================================================================
// DIRECT FILE STREAMING
// Serves video files directly with range request support for seeking
// ============================================================================

router.get('/stream/:filePath', async (req: Request, res: Response) => {
  const filePath = decodeURIComponent(req.params.filePath)

  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      res.status(404).json({ error: 'Media file not found' })
      return
    }

    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const ext = path.extname(filePath).slice(1) || 'mp4'
    const contentType = getContentType(ext)

    // Handle range requests for seeking
    const range = req.headers.range

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      console.log(`Streaming: bytes ${start}-${end}/${fileSize}`)

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
      console.log(`Streaming full file: ${Math.round(fileSize / 1024 / 1024)}MB`)

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
// TRANSCODING (for incompatible audio codecs)
// Uses ffmpeg to transcode audio to AAC while passing through video
// ============================================================================

router.get('/transcode/:filePath', async (req: Request, res: Response) => {
  const filePath = decodeURIComponent(req.params.filePath)

  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      res.status(404).json({ error: 'Media file not found' })
      return
    }

    console.log(`Transcoding: ${filePath}`)

    // Set response headers for streaming
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Transfer-Encoding', 'chunked')

    // ffmpeg command: copy video, transcode audio to AAC, output to stdout
    const ffmpeg = spawn('ffmpeg', [
      '-i', filePath,
      '-c:v', 'copy',           // Copy video stream (no re-encoding)
      '-c:a', 'aac',            // Transcode audio to AAC
      '-b:a', '192k',           // Audio bitrate
      '-ac', '2',               // Stereo output
      '-movflags', 'frag_keyframe+empty_moov+faststart', // Enable streaming
      '-f', 'mp4',              // Output format
      'pipe:1'                  // Output to stdout
    ])

    ffmpeg.stdout.pipe(res)

    ffmpeg.stderr.on('data', (data) => {
      // Log ffmpeg progress (optional, can be noisy)
      // console.log('ffmpeg:', data.toString())
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(`ffmpeg exited with code ${code}`)
      }
    })

    ffmpeg.on('error', (err) => {
      console.error('ffmpeg spawn error:', err.message)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Transcoding failed' })
      }
    })

    // Handle client disconnect
    req.on('close', () => {
      ffmpeg.kill('SIGTERM')
    })

  } catch (error: any) {
    console.error('Transcoding error:', error.message)
    res.status(500).json({ error: 'Failed to transcode file' })
  }
})

// ============================================================================
// SUBTITLE EXTRACTION
// Uses ffmpeg to extract subtitles from media files
// ============================================================================

router.get('/subtitle/:subtitleParam', async (req: Request, res: Response) => {
  const { subtitleParam } = req.params

  try {
    // Decode the parameter: format is "streamIndex:filePath"
    const decoded = decodeURIComponent(subtitleParam)
    const colonIndex = decoded.indexOf(':')
    if (colonIndex === -1) {
      res.status(400).json({ error: 'Invalid subtitle parameter format' })
      return
    }

    const streamIndex = parseInt(decoded.substring(0, colonIndex), 10)
    const filePath = decoded.substring(colonIndex + 1)

    console.log(`Extracting subtitle - stream index: ${streamIndex}, file: ${filePath}`)

    // Verify file exists
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`Media file not found: ${filePath}`)
      res.status(404).json({ error: 'Media file not found' })
      return
    }

    // Use ffmpeg to extract the subtitle stream as WebVTT
    // -map 0:s:N selects the Nth subtitle stream (0-indexed)
    const ffmpeg = spawn('ffmpeg', [
      '-i', filePath,
      '-map', `0:s:${streamIndex}`,
      '-f', 'webvtt',
      '-'  // Output to stdout
    ])

    let subtitleData = ''
    let errorData = ''

    ffmpeg.stdout.on('data', (data) => {
      subtitleData += data.toString()
    })

    ffmpeg.stderr.on('data', (data) => {
      errorData += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(`ffmpeg exited with code ${code}`)
        console.error('ffmpeg stderr:', errorData)

        if (errorData.includes('Stream map') || errorData.includes('does not contain')) {
          res.status(404).json({ error: 'Subtitle stream not found in file' })
        } else {
          res.status(500).json({ error: 'Failed to extract subtitle' })
        }
        return
      }

      if (!subtitleData.trim()) {
        console.error('ffmpeg produced empty output')
        res.status(500).json({ error: 'Empty subtitle output' })
        return
      }

      console.log(`Subtitle extracted successfully, length: ${subtitleData.length}`)
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.send(subtitleData)
    })

    ffmpeg.on('error', (err) => {
      console.error('ffmpeg spawn error:', err.message)
      res.status(500).json({ error: 'Failed to run ffmpeg' })
    })

  } catch (error: any) {
    console.error('Subtitle extraction error:', error.message)
    res.status(500).json({ error: 'Failed to extract subtitle' })
  }
})

export default router
