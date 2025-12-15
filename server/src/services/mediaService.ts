import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { radarrService } from './radarrService.js'
import { sonarrService } from './sonarrService.js'

// Types for media info from ffprobe
export interface MediaStream {
  index: number
  codec_name: string
  codec_type: 'video' | 'audio' | 'subtitle'
  codec_long_name?: string
  width?: number
  height?: number
  channels?: number
  channel_layout?: string
  sample_rate?: string
  bit_rate?: string
  tags?: {
    language?: string
    title?: string
    handler_name?: string
  }
}

export interface MediaFormat {
  filename: string
  format_name: string
  format_long_name: string
  duration: string
  size: string
  bit_rate: string
}

export interface MediaInfo {
  format: MediaFormat
  streams: MediaStream[]
}

export interface SubtitleTrack {
  id: number
  streamIndex: number
  language: string
  languageCode: string
  displayTitle: string
  format: string
}

export interface AudioTrack {
  id: number
  streamIndex: number
  language: string
  languageCode: string
  displayTitle: string
  codec: string
  channels: number
  selected: boolean
}

export interface PlaybackInfo {
  found: boolean
  title: string
  type: 'movie' | 'episode'
  filePath: string
  fileSize: number
  duration: number // in milliseconds
  mediaInfo: {
    width: number
    height: number
    videoCodec: string
    audioCodec: string
    container: string
  }
  needsTranscode: boolean // True if audio needs transcoding
  streamUrl: string
  subtitles: SubtitleTrack[]
  audioTracks: AudioTrack[]
}

// Browser-compatible audio codecs
const BROWSER_COMPATIBLE_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le']

class MediaService {
  // Probe a media file using ffprobe to get all stream information
  async probeFile(filePath: string): Promise<MediaInfo | null> {
    return new Promise((resolve) => {
      if (!fs.existsSync(filePath)) {
        console.error(`MediaService: File not found: ${filePath}`)
        resolve(null)
        return
      }

      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ])

      let stdout = ''
      let stderr = ''

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          console.error(`MediaService: ffprobe failed with code ${code}`)
          console.error('stderr:', stderr)
          resolve(null)
          return
        }

        try {
          const info = JSON.parse(stdout) as MediaInfo
          resolve(info)
        } catch (e) {
          console.error('MediaService: Failed to parse ffprobe output')
          resolve(null)
        }
      })

      ffprobe.on('error', (err) => {
        console.error('MediaService: ffprobe spawn error:', err.message)
        resolve(null)
      })
    })
  }

  // Get movie playback info by TMDB ID
  async getMoviePlayback(tmdbId: number): Promise<PlaybackInfo | null> {
    // Get movie from Radarr
    const movie = await radarrService.getMovieByTmdbId(tmdbId)
    if (!movie) {
      console.log(`MediaService: Movie with TMDB ID ${tmdbId} not found in Radarr`)
      return null
    }

    if (!movie.hasFile || !movie.movieFile?.path) {
      console.log(`MediaService: Movie "${movie.title}" has no file`)
      return null
    }

    const filePath = movie.movieFile.path
    return this.buildPlaybackInfo(filePath, movie.title, 'movie')
  }

  // Get episode playback info by TMDB ID, season, and episode
  async getEpisodePlayback(tmdbId: number, season: number, episode: number): Promise<PlaybackInfo | null> {
    // First, we need to find the series in Sonarr
    // Sonarr uses TVDB IDs, but we can try to find by searching all series and matching TMDB ID
    // This is a limitation - we may need to add TMDB to TVDB mapping via TMDB API

    const allSeries = await sonarrService.getSeries()

    // Try to find series - Sonarr doesn't have TMDB ID directly,
    // but we can match by IMDB ID or search
    let series = null
    for (const s of allSeries) {
      // We'll need to use the external IDs - for now, let's try the lookup
      const lookup = await sonarrService.lookupSeriesByTmdbId(tmdbId)
      if (lookup && lookup.tvdbId) {
        series = await sonarrService.getSeriesByTvdbId(lookup.tvdbId)
        break
      }
    }

    if (!series) {
      console.log(`MediaService: Series with TMDB ID ${tmdbId} not found in Sonarr`)
      return null
    }

    // Get all episodes for the series
    const episodes = await sonarrService.getEpisodes(series.id)
    const targetEpisode = episodes.find(
      ep => ep.seasonNumber === season && ep.episodeNumber === episode
    )

    if (!targetEpisode) {
      console.log(`MediaService: Episode S${season}E${episode} not found`)
      return null
    }

    if (!targetEpisode.hasFile || !targetEpisode.episodeFileId) {
      console.log(`MediaService: Episode S${season}E${episode} has no file`)
      return null
    }

    // Get episode file info - Sonarr episode object doesn't include full path
    // We need to construct it from series path
    const episodeFile = await this.getEpisodeFilePath(series.id, targetEpisode.episodeFileId)
    if (!episodeFile) {
      console.log(`MediaService: Could not get episode file path`)
      return null
    }

    const title = `${series.title} - S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} - ${targetEpisode.title}`
    return this.buildPlaybackInfo(episodeFile, title, 'episode')
  }

  // Get episode file path from Sonarr
  private async getEpisodeFilePath(seriesId: number, episodeFileId: number): Promise<string | null> {
    try {
      // Sonarr has an episodefile endpoint
      const response = await fetch(
        `${process.env.SONARR_URL}/api/v3/episodefile/${episodeFileId}`,
        {
          headers: {
            'X-Api-Key': process.env.SONARR_API_KEY || ''
          }
        }
      )
      if (!response.ok) return null
      const data = await response.json() as { path: string }
      return data.path
    } catch (error) {
      console.error('MediaService: Error getting episode file:', error)
      return null
    }
  }

  // Build playback info from a file path
  private async buildPlaybackInfo(filePath: string, title: string, type: 'movie' | 'episode'): Promise<PlaybackInfo | null> {
    // Probe the file
    const mediaInfo = await this.probeFile(filePath)
    if (!mediaInfo) {
      console.log(`MediaService: Could not probe file: ${filePath}`)
      return null
    }

    // Find video stream
    const videoStream = mediaInfo.streams.find(s => s.codec_type === 'video')
    if (!videoStream) {
      console.log(`MediaService: No video stream found in file`)
      return null
    }

    // Find first audio stream
    const audioStream = mediaInfo.streams.find(s => s.codec_type === 'audio')

    // Get all subtitle streams
    const subtitleStreams = mediaInfo.streams.filter(s => s.codec_type === 'subtitle')
    let subtitleIndex = 0
    const subtitles: SubtitleTrack[] = subtitleStreams.map(s => {
      const idx = subtitleIndex++
      return {
        id: s.index,
        streamIndex: idx,
        language: s.tags?.language || 'Unknown',
        languageCode: s.tags?.language || 'und',
        displayTitle: s.tags?.title || s.tags?.language || `Subtitle ${idx + 1}`,
        format: s.codec_name
      }
    })

    // Get all audio streams
    const audioStreams = mediaInfo.streams.filter(s => s.codec_type === 'audio')
    let audioIndex = 0
    const audioTracks: AudioTrack[] = audioStreams.map((s, i) => ({
      id: s.index,
      streamIndex: audioIndex++,
      language: s.tags?.language || 'Unknown',
      languageCode: s.tags?.language || 'und',
      displayTitle: s.tags?.title || s.tags?.language || `Audio ${i + 1}`,
      codec: s.codec_name,
      channels: s.channels || 2,
      selected: i === 0 // First audio track is selected by default
    }))

    // Check if audio codec is browser-compatible
    const audioCodec = audioStream?.codec_name || 'unknown'
    const needsTranscode = !BROWSER_COMPATIBLE_AUDIO.includes(audioCodec.toLowerCase())

    // Parse duration (ffprobe returns seconds as string)
    const durationSec = parseFloat(mediaInfo.format.duration) || 0
    const durationMs = Math.floor(durationSec * 1000)

    // Get file size
    const fileSize = parseInt(mediaInfo.format.size) || 0

    // Build stream URL - encode the file path
    const encodedPath = encodeURIComponent(filePath)
    const streamUrl = needsTranscode
      ? `/api/media/transcode/${encodedPath}`
      : `/api/media/stream/${encodedPath}`

    console.log(`MediaService: ${title}`)
    console.log(`  File: ${filePath}`)
    console.log(`  Video: ${videoStream.codec_name} ${videoStream.width}x${videoStream.height}`)
    console.log(`  Audio: ${audioCodec} (${needsTranscode ? 'needs transcode' : 'direct play'})`)
    console.log(`  Subtitles: ${subtitles.length} tracks`)

    return {
      found: true,
      title,
      type,
      filePath,
      fileSize,
      duration: durationMs,
      mediaInfo: {
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        videoCodec: videoStream.codec_name,
        audioCodec,
        container: path.extname(filePath).slice(1) || 'mkv'
      },
      needsTranscode,
      streamUrl,
      subtitles,
      audioTracks
    }
  }

  // Check if service can be used (Radarr or Sonarr enabled)
  isEnabled(): boolean {
    return radarrService.isEnabled() || sonarrService.isEnabled()
  }
}

export const mediaService = new MediaService()
