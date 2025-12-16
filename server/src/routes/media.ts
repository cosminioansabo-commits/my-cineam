import { Router, Request, Response } from 'express'
import { spawn, ChildProcess, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { mediaService } from '../services/mediaService.js'

const router = Router()

// ============================================================================
// HARDWARE ACCELERATION DETECTION
// ============================================================================

// Check for Intel QuickSync support
const checkQuickSyncSupport = (): boolean => {
  try {
    // Check if render device exists
    if (!fs.existsSync('/dev/dri/renderD128')) {
      return false
    }
    // Verify FFmpeg has QSV support
    const result = execSync('ffmpeg -hide_banner -encoders 2>/dev/null | grep h264_qsv', { encoding: 'utf8' })
    return result.includes('h264_qsv')
  } catch {
    return false
  }
}

const HAS_QUICKSYNC = checkQuickSyncSupport()
console.log(`Hardware acceleration: Intel QuickSync ${HAS_QUICKSYNC ? 'available' : 'not available'}`)

// ============================================================================
// HLS SESSION MANAGEMENT
// For proper seeking and quality switching without audio sync issues
// ============================================================================

interface HlsSession {
  id: string
  filePath: string
  process: ChildProcess | null
  outputDir: string
  lastAccess: number
  startTime: number
  audioTrack: number
  quality: string
}

const hlsSessions = new Map<string, HlsSession>()
const HLS_SESSION_TIMEOUT = 5 * 60 * 1000 // 5 minutes

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now()
  for (const [sessionId, session] of hlsSessions) {
    if (now - session.lastAccess > HLS_SESSION_TIMEOUT) {
      cleanupSession(sessionId)
    }
  }
}, 60 * 1000)

const cleanupSession = (sessionId: string) => {
  const session = hlsSessions.get(sessionId)
  if (session) {
    if (session.process) {
      session.process.kill('SIGTERM')
    }
    try {
      fs.rmSync(session.outputDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
    hlsSessions.delete(sessionId)
    console.log(`HLS session ${sessionId} cleaned up`)
  }
}

// Quality presets for transcoding
const QUALITY_PRESETS: Record<string, { width: number; videoBitrate: string; audioBitrate: string }> = {
  '2160p': { width: 3840, videoBitrate: '15M', audioBitrate: '256k' },
  '1080p': { width: 1920, videoBitrate: '5M', audioBitrate: '192k' },
  '720p': { width: 1280, videoBitrate: '3M', audioBitrate: '128k' },
  '480p': { width: 854, videoBitrate: '1.5M', audioBitrate: '96k' },
  'original': { width: 0, videoBitrate: '0', audioBitrate: '192k' }, // Copy video, transcode audio only
}

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
  console.log(`Media API: Getting movie playback for TMDB ID ${tmdbId}`)

  try {
    const playbackInfo = await mediaService.getMoviePlayback(tmdbId)
    if (!playbackInfo) {
      console.log(`Media API: Movie ${tmdbId} not found or no file available`)
      res.json({ found: false })
      return
    }

    console.log(`Media API: Movie ${tmdbId} found, stream URL: ${playbackInfo.streamUrl}`)
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
// Supports seeking via ?start=<seconds> query parameter
// FIXED: Removed aresample=async filter that caused audio sync issues
// ============================================================================

router.get('/transcode/:filePath', async (req: Request, res: Response) => {
  const filePath = decodeURIComponent(req.params.filePath)
  const startTime = parseFloat(req.query.start as string) || 0
  const audioTrack = parseInt(req.query.audio as string) || 0

  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      res.status(404).json({ error: 'Media file not found' })
      return
    }

    console.log(`Transcoding: ${filePath} (start: ${startTime}s, audio track: ${audioTrack})`)

    // Set response headers for streaming
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Transfer-Encoding', 'chunked')

    // Build ffmpeg arguments - FIXED audio sync for EAC3/DTS sources
    const ffmpegArgs: string[] = [
      // Input seeking (fast, seeks to keyframe)
      ...(startTime > 0 ? ['-ss', startTime.toString()] : []),

      // Input file with format probing
      '-probesize', '50M',                // Larger probe for accurate duration/sync info
      '-analyzeduration', '100M',         // More analysis time for complex containers
      '-i', filePath,

      // Map streams explicitly with proper sync
      '-map', '0:v:0',                    // First video stream
      '-map', `0:a:${audioTrack}`,        // Selected audio stream

      // Video: copy (no re-encoding)
      '-c:v', 'copy',

      // Audio: transcode to AAC
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-ar', '48000',

      // SYNC FIX: Force audio to start at same PTS as video
      '-af', 'asetpts=PTS-STARTPTS',      // Reset audio timestamps to start at 0

      // Timestamp handling
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+discardcorrupt',
      '-max_muxing_queue_size', '2048',
      '-shortest',                        // End when shortest stream ends

      // Output format for streaming
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    ]

    const ffmpeg = spawn('ffmpeg', ffmpegArgs)

    ffmpeg.stdout.pipe(res)

    ffmpeg.stderr.on('data', (data) => {
      // Uncomment for debugging
      // console.log('ffmpeg:', data.toString())
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== 255) { // 255 is normal when client disconnects
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
// HLS STREAMING (Industry Standard)
// Session-based HLS for proper seeking, quality switching, and audio sync
// ============================================================================

// Start a new HLS session
router.post('/hls/start', async (req: Request, res: Response) => {
  const { filePath, audioTrack = 0, quality = 'original', startTime = 0 } = req.body

  if (!filePath) {
    res.status(400).json({ error: 'filePath is required' })
    return
  }

  // Decode file path if it was encoded
  const decodedPath = decodeURIComponent(filePath)

  if (!fs.existsSync(decodedPath)) {
    console.error(`HLS: File not found: ${decodedPath}`)
    res.status(404).json({ error: 'Media file not found' })
    return
  }

  // Generate unique session ID
  const sessionId = crypto.randomBytes(16).toString('hex')
  // Use /app/hls-sessions for better container compatibility (falls back if /tmp fails)
  const hlsBaseDir = process.env.HLS_SESSION_DIR || '/tmp/hls-sessions'
  const outputDir = `${hlsBaseDir}/${sessionId}`

  try {
    fs.mkdirSync(outputDir, { recursive: true })
  } catch (err) {
    console.error('Failed to create HLS output directory:', err)
    res.status(500).json({ error: 'Failed to create session' })
    return
  }

  console.log(`HLS: Starting session ${sessionId} for ${path.basename(decodedPath)}`)
  console.log(`  Quality: ${quality}, Audio track: ${audioTrack}, Start: ${startTime}s`)

  // Build FFmpeg command
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS['original']
  const ffmpegArgs: string[] = []

  // Seek position
  if (startTime > 0) {
    ffmpegArgs.push('-ss', startTime.toString())
  }

  // Hardware acceleration (if available and transcoding video)
  if (HAS_QUICKSYNC && quality !== 'original') {
    ffmpegArgs.push(
      '-hwaccel', 'qsv',
      '-hwaccel_device', '/dev/dri/renderD128',
      '-hwaccel_output_format', 'qsv'
    )
  }

  // Input
  ffmpegArgs.push('-i', decodedPath)

  // Video encoding
  if (quality === 'original') {
    // Copy video stream (remux only)
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-c:v', 'copy'
    )
  } else if (HAS_QUICKSYNC) {
    // Hardware-accelerated encoding
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-c:v', 'h264_qsv',
      '-preset', 'fast',
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.videoBitrate,
      '-bufsize', `${parseInt(preset.videoBitrate) * 2}M`,
      '-vf', `scale_qsv=w=${preset.width}:h=-1`
    )
  } else {
    // Software encoding (fallback)
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.videoBitrate,
      '-bufsize', `${parseInt(preset.videoBitrate) * 2}M`,
      '-vf', `scale=${preset.width}:-2`
    )
  }

  // Audio encoding (always transcode to AAC for compatibility)
  ffmpegArgs.push(
    '-map', `0:a:${audioTrack}`,
    '-c:a', 'aac',
    '-b:a', preset.audioBitrate,
    '-ac', '2',
    '-ar', '48000'
  )

  // HLS output settings
  ffmpegArgs.push(
    '-f', 'hls',
    '-hls_time', '4',                              // 4-second segments
    '-hls_list_size', '0',                         // Keep all segments in playlist
    '-hls_flags', 'independent_segments+append_list',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', `${outputDir}/seg_%05d.ts`,
    '-start_number', '0',
    `${outputDir}/playlist.m3u8`
  )

  const ffmpeg = spawn('ffmpeg', ffmpegArgs)

  // Store session
  const session: HlsSession = {
    id: sessionId,
    filePath: decodedPath,
    process: ffmpeg,
    outputDir,
    lastAccess: Date.now(),
    startTime,
    audioTrack,
    quality
  }
  hlsSessions.set(sessionId, session)

  let stderrLog = ''
  ffmpeg.stderr.on('data', (data) => {
    stderrLog += data.toString()
    // Uncomment for debugging:
    // console.log(`[HLS ${sessionId}]`, data.toString())
  })

  ffmpeg.on('close', (code) => {
    if (code !== 0 && code !== 255 && code !== null) {
      console.error(`HLS FFmpeg exited with code ${code}`)
      console.error('Last stderr:', stderrLog.slice(-500))
    }
  })

  ffmpeg.on('error', (err) => {
    console.error('HLS FFmpeg spawn error:', err.message)
  })

  // Wait for initial segments to be ready
  const waitForPlaylist = (): Promise<boolean> => {
    return new Promise((resolve) => {
      let attempts = 0
      const maxAttempts = 100 // 10 seconds max

      const check = () => {
        attempts++
        const playlistPath = `${outputDir}/playlist.m3u8`

        if (fs.existsSync(playlistPath)) {
          // Check if playlist has at least one segment
          const content = fs.readFileSync(playlistPath, 'utf8')
          if (content.includes('.ts')) {
            resolve(true)
            return
          }
        }

        if (attempts >= maxAttempts) {
          resolve(false)
          return
        }

        setTimeout(check, 100)
      }

      check()
    })
  }

  const ready = await waitForPlaylist()

  if (!ready) {
    cleanupSession(sessionId)
    console.error('HLS: Timeout waiting for playlist')
    res.status(500).json({ error: 'Transcoding failed to start' })
    return
  }

  res.json({
    sessionId,
    playlistUrl: `/api/media/hls/${sessionId}/playlist.m3u8`
  })
})

// Serve HLS playlist
router.get('/hls/:sessionId/playlist.m3u8', (req: Request, res: Response) => {
  const { sessionId } = req.params
  const session = hlsSessions.get(sessionId)

  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' })
    return
  }

  session.lastAccess = Date.now()
  const playlistPath = `${session.outputDir}/playlist.m3u8`

  if (!fs.existsSync(playlistPath)) {
    res.status(404).json({ error: 'Playlist not ready' })
    return
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(playlistPath)
})

// Serve HLS segments
router.get('/hls/:sessionId/:segment', (req: Request, res: Response) => {
  const { sessionId, segment } = req.params
  const session = hlsSessions.get(sessionId)

  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' })
    return
  }

  session.lastAccess = Date.now()
  const segmentPath = `${session.outputDir}/${segment}`

  if (!fs.existsSync(segmentPath)) {
    res.status(404).json({ error: 'Segment not found' })
    return
  }

  res.setHeader('Content-Type', 'video/mp2t')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'max-age=3600')
  res.sendFile(segmentPath)
})

// Seek within HLS session (restarts transcoding from new position)
router.post('/hls/:sessionId/seek', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  const { position } = req.body // in seconds
  const session = hlsSessions.get(sessionId)

  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  console.log(`HLS: Seeking session ${sessionId} to ${position}s`)

  // Kill current process
  if (session.process) {
    session.process.kill('SIGTERM')
  }

  // Clear old segments but keep the directory
  try {
    const files = fs.readdirSync(session.outputDir)
    files.forEach(f => {
      fs.unlinkSync(`${session.outputDir}/${f}`)
    })
  } catch (e) {
    // Ignore cleanup errors
  }

  // Restart with new position
  const preset = QUALITY_PRESETS[session.quality] || QUALITY_PRESETS['original']
  const ffmpegArgs: string[] = []

  // New seek position
  ffmpegArgs.push('-ss', position.toString())

  // Hardware acceleration
  if (HAS_QUICKSYNC && session.quality !== 'original') {
    ffmpegArgs.push(
      '-hwaccel', 'qsv',
      '-hwaccel_device', '/dev/dri/renderD128',
      '-hwaccel_output_format', 'qsv'
    )
  }

  ffmpegArgs.push('-i', session.filePath)

  // Video
  if (session.quality === 'original') {
    ffmpegArgs.push('-map', '0:v:0', '-c:v', 'copy')
  } else if (HAS_QUICKSYNC) {
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-c:v', 'h264_qsv',
      '-preset', 'fast',
      '-b:v', preset.videoBitrate,
      '-vf', `scale_qsv=w=${preset.width}:h=-1`
    )
  } else {
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', preset.videoBitrate,
      '-vf', `scale=${preset.width}:-2`
    )
  }

  // Audio
  ffmpegArgs.push(
    '-map', `0:a:${session.audioTrack}`,
    '-c:a', 'aac',
    '-b:a', preset.audioBitrate,
    '-ac', '2'
  )

  // HLS output
  ffmpegArgs.push(
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', `${session.outputDir}/seg_%05d.ts`,
    `${session.outputDir}/playlist.m3u8`
  )

  const ffmpeg = spawn('ffmpeg', ffmpegArgs)
  session.process = ffmpeg
  session.startTime = position
  session.lastAccess = Date.now()

  ffmpeg.on('error', (err) => {
    console.error('HLS seek FFmpeg error:', err.message)
  })

  // Wait for first segment
  await new Promise<void>((resolve) => {
    let attempts = 0
    const check = () => {
      attempts++
      if (fs.existsSync(`${session.outputDir}/playlist.m3u8`) || attempts > 50) {
        resolve()
        return
      }
      setTimeout(check, 100)
    }
    check()
  })

  res.json({ success: true, position })
})

// Stop HLS session
router.delete('/hls/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params
  cleanupSession(sessionId)
  res.json({ success: true })
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
