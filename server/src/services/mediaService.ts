import path from 'path'
import { radarrService } from './radarrService.js'
import { sonarrService } from './sonarrService.js'
import { config } from '../config.js'

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
const BROWSER_COMPATIBLE_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm']

// Parse resolution string like "1920x1080" to width/height
function parseResolution(resolution: string): { width: number; height: number } {
  const match = resolution?.match(/(\d+)x(\d+)/)
  if (match) {
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
  }
  return { width: 0, height: 0 }
}

// Parse runtime string like "2:03:45" to milliseconds
function parseRuntime(runtime: string): number {
  if (!runtime) return 0
  const parts = runtime.split(':').map(p => parseInt(p, 10))
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  } else if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000
  }
  return 0
}

// Parse subtitle languages string like "English / French" to SubtitleTrack[]
function parseSubtitles(subtitles: string): SubtitleTrack[] {
  if (!subtitles) return []

  const languages = subtitles.split('/').map(s => s.trim()).filter(Boolean)
  return languages.map((lang, index) => ({
    id: index,
    streamIndex: index,
    language: lang,
    languageCode: lang.toLowerCase().substring(0, 3),
    displayTitle: lang,
    format: 'srt' // Assume SRT, will be extracted as WebVTT
  }))
}

// Parse audio languages string like "English / Japanese" to AudioTrack[]
function parseAudioTracks(audioLanguages: string, audioCodec: string, audioChannels: number): AudioTrack[] {
  if (!audioLanguages) {
    // Return a single default track
    return [{
      id: 0,
      streamIndex: 0,
      language: 'Unknown',
      languageCode: 'und',
      displayTitle: `${audioCodec} ${audioChannels}ch`,
      codec: audioCodec,
      channels: audioChannels,
      selected: true
    }]
  }

  const languages = audioLanguages.split('/').map(s => s.trim()).filter(Boolean)
  return languages.map((lang, index) => ({
    id: index,
    streamIndex: index,
    language: lang,
    languageCode: lang.toLowerCase().substring(0, 3),
    displayTitle: `${lang} (${audioCodec} ${audioChannels}ch)`,
    codec: audioCodec,
    channels: audioChannels,
    selected: index === 0
  }))
}

class MediaService {
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
    const movieFileInfo = movie.movieFile
    const mediaInfo = movieFileInfo.mediaInfo

    // Get media info from Radarr
    const audioCodec = mediaInfo?.audioCodec || 'unknown'
    const audioChannels = mediaInfo?.audioChannels || 2
    const videoCodec = mediaInfo?.videoCodec || 'unknown'
    const { width, height } = parseResolution(mediaInfo?.resolution || '')
    const duration = parseRuntime(mediaInfo?.runTime || '')

    // Check if audio codec is browser-compatible
    const needsTranscode = !BROWSER_COMPATIBLE_AUDIO.some(codec =>
      audioCodec.toLowerCase().includes(codec)
    )

    // Parse subtitles and audio tracks from Radarr info
    const subtitles = parseSubtitles(mediaInfo?.subtitles || '')
    const audioTracks = parseAudioTracks(mediaInfo?.audioLanguages || '', audioCodec, audioChannels)

    // Build stream URL - encode the file path
    const encodedPath = encodeURIComponent(filePath)
    const streamUrl = needsTranscode
      ? `/api/media/transcode/${encodedPath}`
      : `/api/media/stream/${encodedPath}`

    console.log(`MediaService: ${movie.title}`)
    console.log(`  File: ${filePath}`)
    console.log(`  Video: ${videoCodec} ${width}x${height}`)
    console.log(`  Audio: ${audioCodec} ${audioChannels}ch (${needsTranscode ? 'needs transcode' : 'direct play'})`)
    console.log(`  Subtitles: ${subtitles.length} tracks`)

    return {
      found: true,
      title: movie.title,
      type: 'movie',
      filePath,
      fileSize: movieFileInfo.size || 0,
      duration,
      mediaInfo: {
        width,
        height,
        videoCodec,
        audioCodec,
        container: path.extname(filePath).slice(1) || 'mkv'
      },
      needsTranscode,
      streamUrl,
      subtitles,
      audioTracks
    }
  }

  // Get episode playback info by TMDB ID, season, and episode
  async getEpisodePlayback(tmdbId: number, season: number, episode: number): Promise<PlaybackInfo | null> {
    // First, we need to find the series in Sonarr
    // Sonarr uses TVDB IDs, so we need to look up via TMDB
    const lookup = await sonarrService.lookupSeriesByTmdbId(tmdbId)
    if (!lookup || !lookup.tvdbId) {
      console.log(`MediaService: Could not lookup series with TMDB ID ${tmdbId}`)
      return null
    }

    const series = await sonarrService.getSeriesByTvdbId(lookup.tvdbId)
    if (!series) {
      console.log(`MediaService: Series with TVDB ID ${lookup.tvdbId} not found in Sonarr`)
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

    // Get episode file info from Sonarr
    const episodeFileInfo = await this.getEpisodeFileInfo(targetEpisode.episodeFileId)
    if (!episodeFileInfo) {
      console.log(`MediaService: Could not get episode file info`)
      return null
    }

    const filePath = episodeFileInfo.path
    const mediaInfo = episodeFileInfo.mediaInfo

    // Get media info from Sonarr
    const audioCodec = mediaInfo?.audioCodec || 'unknown'
    const audioChannels = mediaInfo?.audioChannels || 2
    const videoCodec = mediaInfo?.videoCodec || 'unknown'
    const { width, height } = parseResolution(mediaInfo?.resolution || '')
    const duration = parseRuntime(mediaInfo?.runTime || '')

    // Check if audio codec is browser-compatible
    const needsTranscode = !BROWSER_COMPATIBLE_AUDIO.some(codec =>
      audioCodec.toLowerCase().includes(codec)
    )

    // Parse subtitles and audio tracks
    const subtitles = parseSubtitles(mediaInfo?.subtitles || '')
    const audioTracks = parseAudioTracks(mediaInfo?.audioLanguages || '', audioCodec, audioChannels)

    // Build stream URL
    const encodedPath = encodeURIComponent(filePath)
    const streamUrl = needsTranscode
      ? `/api/media/transcode/${encodedPath}`
      : `/api/media/stream/${encodedPath}`

    const title = `${series.title} - S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} - ${targetEpisode.title}`

    console.log(`MediaService: ${title}`)
    console.log(`  File: ${filePath}`)
    console.log(`  Video: ${videoCodec} ${width}x${height}`)
    console.log(`  Audio: ${audioCodec} ${audioChannels}ch (${needsTranscode ? 'needs transcode' : 'direct play'})`)
    console.log(`  Subtitles: ${subtitles.length} tracks`)

    return {
      found: true,
      title,
      type: 'episode',
      filePath,
      fileSize: episodeFileInfo.size || 0,
      duration,
      mediaInfo: {
        width,
        height,
        videoCodec,
        audioCodec,
        container: path.extname(filePath).slice(1) || 'mkv'
      },
      needsTranscode,
      streamUrl,
      subtitles,
      audioTracks
    }
  }

  // Get episode file info from Sonarr API
  private async getEpisodeFileInfo(episodeFileId: number): Promise<{
    path: string
    size: number
    mediaInfo?: {
      audioCodec: string
      audioChannels: number
      audioLanguages: string
      videoCodec: string
      resolution: string
      runTime: string
      subtitles: string
    }
  } | null> {
    try {
      const response = await fetch(
        `${config.sonarr.url}/api/v3/episodefile/${episodeFileId}`,
        {
          headers: {
            'X-Api-Key': config.sonarr.apiKey
          }
        }
      )
      if (!response.ok) return null
      return await response.json() as any
    } catch (error) {
      console.error('MediaService: Error getting episode file:', error)
      return null
    }
  }

  // Check if service can be used (Radarr or Sonarr enabled)
  isEnabled(): boolean {
    return radarrService.isEnabled() || sonarrService.isEnabled()
  }
}

export const mediaService = new MediaService()
