import path from 'path'
import { radarrService } from './radarrService.js'
import { sonarrService } from './sonarrService.js'
import { jellyfinService } from './jellyfinService.js'
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

// Playback strategy determines how to stream the content
export type PlaybackStrategy = 'direct' | 'remux' | 'transcode'

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
  needsTranscode: boolean // True if audio needs transcoding (legacy, kept for compatibility)
  playbackStrategy: PlaybackStrategy // New: more granular playback decision
  streamUrl: string
  directStreamUrl?: string // For remux: direct stream URL as fallback
  hlsSupported: boolean // True if HLS streaming is available
  subtitles: SubtitleTrack[]
  audioTracks: AudioTrack[]
  // Jellyfin-specific fields (present when using Jellyfin backend)
  jellyfinItemId?: string
  jellyfinMediaSourceId?: string
  jellyfinPlaySessionId?: string
  streamingBackend?: 'native' | 'jellyfin'
}

// ============================================================================
// BROWSER COMPATIBILITY DETECTION
// Comprehensive codec/container detection for optimal playback strategy
// ============================================================================

// Video codecs that browsers can play natively (without transcoding)
const BROWSER_COMPATIBLE_VIDEO: Record<string, string[]> = {
  // H.264/AVC - universally supported
  'h264': ['h264', 'avc', 'avc1', 'x264'],
  // VP8/VP9 - Chrome, Firefox, Edge
  'vp9': ['vp9', 'vp8'],
  // AV1 - Modern browsers (Chrome 70+, Firefox 67+, Edge 79+)
  'av1': ['av1'],
  // HEVC/H.265 - Safari only (with hardware support), Edge on Windows with HEVC extension
  'hevc': ['hevc', 'h265', 'x265'],
}

// Audio codecs that browsers can play natively
const BROWSER_COMPATIBLE_AUDIO: Record<string, string[]> = {
  'aac': ['aac', 'mp4a'],
  'mp3': ['mp3', 'mpeg'],
  'opus': ['opus'],
  'vorbis': ['vorbis'],
  'flac': ['flac'],
  'pcm': ['pcm', 'wav'],
  'ac3': ['ac3', 'eac3', 'ec3'], // Safari only with hardware decoder
}

// Containers that browsers can play natively
const BROWSER_COMPATIBLE_CONTAINERS = ['mp4', 'webm', 'm4v', 'mov']

// Audio codecs that REQUIRE transcoding (never direct play)
const ALWAYS_TRANSCODE_AUDIO = ['dts', 'truehd', 'dtshd', 'dts-hd', 'mlp']

/**
 * Check if a video codec is browser-compatible
 * Note: HEVC only works on Safari/Edge with hardware support
 */
function isVideoCompatible(videoCodec: string): boolean {
  const codec = videoCodec.toLowerCase()

  // HEVC is problematic - only Safari and Edge (with extension) support it
  // For now, we'll treat HEVC as compatible and let the browser handle it
  // The frontend can detect playback failure and fall back to transcode

  for (const compatibleCodecs of Object.values(BROWSER_COMPATIBLE_VIDEO)) {
    if (compatibleCodecs.some(c => codec.includes(c))) {
      return true
    }
  }
  return false
}

/**
 * Check if an audio codec is browser-compatible
 */
function isAudioCompatible(audioCodec: string): boolean {
  const codec = audioCodec.toLowerCase()

  // These ALWAYS need transcoding
  if (ALWAYS_TRANSCODE_AUDIO.some(c => codec.includes(c))) {
    return false
  }

  for (const compatibleCodecs of Object.values(BROWSER_COMPATIBLE_AUDIO)) {
    if (compatibleCodecs.some(c => codec.includes(c))) {
      return true
    }
  }
  return false
}

/**
 * Check if container is browser-compatible
 */
function isContainerCompatible(container: string): boolean {
  return BROWSER_COMPATIBLE_CONTAINERS.includes(container.toLowerCase())
}

/**
 * Determine the optimal playback strategy based on media info
 *
 * @returns
 * - 'direct': Stream file as-is (no processing)
 * - 'remux': Copy video, transcode audio only (fast, minimal CPU)
 * - 'transcode': Full transcode (video + audio, CPU/GPU intensive)
 */
function determinePlaybackStrategy(
  videoCodec: string,
  audioCodec: string,
  container: string
): PlaybackStrategy {
  const videoOk = isVideoCompatible(videoCodec)
  const audioOk = isAudioCompatible(audioCodec)
  const containerOk = isContainerCompatible(container)

  // Perfect case: everything is compatible
  if (videoOk && audioOk && containerOk) {
    return 'direct'
  }

  // Video is OK but audio or container needs work
  // This is the most common case (MKV with DTS audio, MP4 with AC3)
  if (videoOk) {
    return 'remux' // Copy video, transcode audio, remux to MP4
  }

  // Video needs transcoding (HEVC on non-Safari, rare codecs)
  return 'transcode'
}

// Language code to full name mapping
const LANGUAGE_NAMES: Record<string, string> = {
  'eng': 'English',
  'en': 'English',
  'spa': 'Spanish',
  'es': 'Spanish',
  'fre': 'French',
  'fra': 'French',
  'fr': 'French',
  'ger': 'German',
  'deu': 'German',
  'de': 'German',
  'ita': 'Italian',
  'it': 'Italian',
  'por': 'Portuguese',
  'pt': 'Portuguese',
  'rus': 'Russian',
  'ru': 'Russian',
  'jpn': 'Japanese',
  'ja': 'Japanese',
  'kor': 'Korean',
  'ko': 'Korean',
  'chi': 'Chinese',
  'zho': 'Chinese',
  'zh': 'Chinese',
  'ara': 'Arabic',
  'ar': 'Arabic',
  'hin': 'Hindi',
  'hi': 'Hindi',
  'tur': 'Turkish',
  'tr': 'Turkish',
  'pol': 'Polish',
  'pl': 'Polish',
  'dut': 'Dutch',
  'nld': 'Dutch',
  'nl': 'Dutch',
  'swe': 'Swedish',
  'sv': 'Swedish',
  'nor': 'Norwegian',
  'no': 'Norwegian',
  'dan': 'Danish',
  'da': 'Danish',
  'fin': 'Finnish',
  'fi': 'Finnish',
  'gre': 'Greek',
  'ell': 'Greek',
  'el': 'Greek',
  'heb': 'Hebrew',
  'he': 'Hebrew',
  'tha': 'Thai',
  'th': 'Thai',
  'vie': 'Vietnamese',
  'vi': 'Vietnamese',
  'ind': 'Indonesian',
  'id': 'Indonesian',
  'rum': 'Romanian',
  'ron': 'Romanian',
  'ro': 'Romanian',
  'cze': 'Czech',
  'ces': 'Czech',
  'cs': 'Czech',
  'hun': 'Hungarian',
  'hu': 'Hungarian',
  'ukr': 'Ukrainian',
  'uk': 'Ukrainian',
  'bul': 'Bulgarian',
  'bg': 'Bulgarian',
  'hrv': 'Croatian',
  'hr': 'Croatian',
  'slv': 'Slovenian',
  'sl': 'Slovenian',
  'srp': 'Serbian',
  'sr': 'Serbian',
}

// Convert language code to full name
function getLanguageName(code: string): string {
  const normalized = code.toLowerCase().trim()
  return LANGUAGE_NAMES[normalized] || code
}

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

// Parse subtitle languages string like "English / French" or "eng / spa" to SubtitleTrack[]
function parseSubtitles(subtitles: string): SubtitleTrack[] {
  if (!subtitles) return []

  const languages = subtitles.split('/').map(s => s.trim()).filter(Boolean)
  return languages.map((lang, index) => {
    const fullName = getLanguageName(lang)
    return {
      id: index,
      streamIndex: index,
      language: fullName,
      languageCode: lang.toLowerCase().substring(0, 3),
      displayTitle: fullName,
      format: 'srt' // Assume SRT, will be extracted as WebVTT
    }
  })
}

// Parse audio languages string like "English / Japanese" or "eng / jpn" to AudioTrack[]
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
  return languages.map((lang, index) => {
    const fullName = getLanguageName(lang)
    return {
      id: index,
      streamIndex: index,
      language: fullName,
      languageCode: lang.toLowerCase().substring(0, 3),
      displayTitle: `${fullName} (${audioCodec} ${audioChannels}ch)`,
      codec: audioCodec,
      channels: audioChannels,
      selected: index === 0
    }
  })
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

    // Try Jellyfin first if enabled
    if (jellyfinService.isEnabled()) {
      const jellyfinPlayback = await this.getJellyfinMoviePlayback(filePath, movie.title, movieFileInfo.size || 0)
      if (jellyfinPlayback) {
        return jellyfinPlayback
      }
      console.log(`MediaService: Movie not found in Jellyfin, falling back to native streaming`)
    }

    // Native streaming fallback
    return this.getNativeMoviePlayback(movie, filePath, movieFileInfo, mediaInfo)
  }

  // Get movie playback via Jellyfin
  private async getJellyfinMoviePlayback(filePath: string, title: string, fileSize: number): Promise<PlaybackInfo | null> {
    const jellyfinItem = await jellyfinService.findMovieByPath(filePath)
    if (!jellyfinItem) {
      return null
    }

    const playbackInfo = await jellyfinService.getPlaybackInfo(jellyfinItem.Id)
    if (!playbackInfo) {
      return null
    }

    console.log(`MediaService: ${title} (via Jellyfin)`)
    console.log(`  Jellyfin ID: ${playbackInfo.jellyfinItemId}`)
    console.log(`  Stream URL: ${playbackInfo.hlsUrl.substring(0, 80)}...`)
    console.log(`  Audio tracks: ${playbackInfo.audioTracks.length}`)
    console.log(`  Subtitles: ${playbackInfo.subtitles.length}`)

    return {
      found: true,
      title,
      type: 'movie',
      filePath,
      fileSize,
      duration: playbackInfo.duration,
      mediaInfo: playbackInfo.mediaInfo,
      needsTranscode: true, // Jellyfin handles transcoding
      playbackStrategy: 'transcode',
      streamUrl: playbackInfo.hlsUrl,
      directStreamUrl: playbackInfo.directUrl,
      hlsSupported: true,
      subtitles: playbackInfo.subtitles,
      audioTracks: playbackInfo.audioTracks,
      jellyfinItemId: playbackInfo.jellyfinItemId,
      jellyfinMediaSourceId: playbackInfo.mediaSourceId,
      jellyfinPlaySessionId: playbackInfo.playSessionId,
      streamingBackend: 'jellyfin'
    }
  }

  // Native streaming (FFmpeg-based)
  private getNativeMoviePlayback(movie: any, filePath: string, movieFileInfo: any, mediaInfo: any): PlaybackInfo {
    // Get media info from Radarr
    const audioCodec = mediaInfo?.audioCodec || 'unknown'
    const audioChannels = mediaInfo?.audioChannels || 2
    const videoCodec = mediaInfo?.videoCodec || 'unknown'
    const container = path.extname(filePath).slice(1) || 'mkv'
    const { width, height } = parseResolution(mediaInfo?.resolution || '')
    const duration = parseRuntime(mediaInfo?.runTime || '')

    // Determine optimal playback strategy
    const playbackStrategy = determinePlaybackStrategy(videoCodec, audioCodec, container)

    // Legacy compatibility
    const needsTranscode = playbackStrategy !== 'direct'

    // Parse subtitles and audio tracks from Radarr info
    const subtitles = parseSubtitles(mediaInfo?.subtitles || '')
    const audioTracks = parseAudioTracks(mediaInfo?.audioLanguages || '', audioCodec, audioChannels)

    // Build stream URLs based on strategy
    const encodedPath = encodeURIComponent(filePath)
    let streamUrl: string
    let directStreamUrl: string | undefined

    switch (playbackStrategy) {
      case 'direct':
        // Stream file as-is
        streamUrl = `/api/media/stream/${encodedPath}`
        break
      case 'remux':
        // Transcode audio only (video copy)
        streamUrl = `/api/media/transcode/${encodedPath}`
        // Also provide direct URL in case browser can handle it
        directStreamUrl = `/api/media/stream/${encodedPath}`
        break
      case 'transcode':
        // Full transcode needed - use HLS for better experience
        streamUrl = `/api/media/transcode/${encodedPath}`
        break
    }

    const strategyLabel = {
      'direct': 'Direct Play',
      'remux': 'Remux (video copy + audio transcode)',
      'transcode': 'Full Transcode'
    }[playbackStrategy]

    console.log(`MediaService: ${movie.title} (native streaming)`)
    console.log(`  File: ${filePath}`)
    console.log(`  Container: ${container}`)
    console.log(`  Video: ${videoCodec} ${width}x${height}`)
    console.log(`  Audio: ${audioCodec} ${audioChannels}ch`)
    console.log(`  Strategy: ${strategyLabel}`)
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
        container
      },
      needsTranscode,
      playbackStrategy,
      streamUrl,
      directStreamUrl,
      hlsSupported: true, // HLS is now always available
      subtitles,
      audioTracks,
      streamingBackend: 'native'
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
    const title = `${series.title} - S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} - ${targetEpisode.title}`

    // Try Jellyfin first if enabled
    if (jellyfinService.isEnabled()) {
      const jellyfinPlayback = await this.getJellyfinEpisodePlayback(filePath, title, episodeFileInfo.size || 0)
      if (jellyfinPlayback) {
        return jellyfinPlayback
      }
      console.log(`MediaService: Episode not found in Jellyfin, falling back to native streaming`)
    }

    // Native streaming fallback
    return this.getNativeEpisodePlayback(title, filePath, episodeFileInfo, mediaInfo)
  }

  // Get episode playback via Jellyfin
  private async getJellyfinEpisodePlayback(filePath: string, title: string, fileSize: number): Promise<PlaybackInfo | null> {
    const jellyfinItem = await jellyfinService.findEpisodeByPath(filePath)
    if (!jellyfinItem) {
      return null
    }

    const playbackInfo = await jellyfinService.getPlaybackInfo(jellyfinItem.Id)
    if (!playbackInfo) {
      return null
    }

    console.log(`MediaService: ${title} (via Jellyfin)`)
    console.log(`  Jellyfin ID: ${playbackInfo.jellyfinItemId}`)
    console.log(`  Stream URL: ${playbackInfo.hlsUrl.substring(0, 80)}...`)
    console.log(`  Audio tracks: ${playbackInfo.audioTracks.length}`)
    console.log(`  Subtitles: ${playbackInfo.subtitles.length}`)

    return {
      found: true,
      title,
      type: 'episode',
      filePath,
      fileSize,
      duration: playbackInfo.duration,
      mediaInfo: playbackInfo.mediaInfo,
      needsTranscode: true, // Jellyfin handles transcoding
      playbackStrategy: 'transcode',
      streamUrl: playbackInfo.hlsUrl,
      directStreamUrl: playbackInfo.directUrl,
      hlsSupported: true,
      subtitles: playbackInfo.subtitles,
      audioTracks: playbackInfo.audioTracks,
      jellyfinItemId: playbackInfo.jellyfinItemId,
      jellyfinMediaSourceId: playbackInfo.mediaSourceId,
      jellyfinPlaySessionId: playbackInfo.playSessionId,
      streamingBackend: 'jellyfin'
    }
  }

  // Native episode streaming (FFmpeg-based)
  private getNativeEpisodePlayback(title: string, filePath: string, episodeFileInfo: any, mediaInfo: any): PlaybackInfo {
    // Get media info from Sonarr
    const audioCodec = mediaInfo?.audioCodec || 'unknown'
    const audioChannels = mediaInfo?.audioChannels || 2
    const videoCodec = mediaInfo?.videoCodec || 'unknown'
    const container = path.extname(filePath).slice(1) || 'mkv'
    const { width, height } = parseResolution(mediaInfo?.resolution || '')
    const duration = parseRuntime(mediaInfo?.runTime || '')

    // Determine optimal playback strategy
    const playbackStrategy = determinePlaybackStrategy(videoCodec, audioCodec, container)

    // Legacy compatibility
    const needsTranscode = playbackStrategy !== 'direct'

    // Parse subtitles and audio tracks
    const subtitles = parseSubtitles(mediaInfo?.subtitles || '')
    const audioTracks = parseAudioTracks(mediaInfo?.audioLanguages || '', audioCodec, audioChannels)

    // Build stream URLs based on strategy
    const encodedPath = encodeURIComponent(filePath)
    let streamUrl: string
    let directStreamUrl: string | undefined

    switch (playbackStrategy) {
      case 'direct':
        streamUrl = `/api/media/stream/${encodedPath}`
        break
      case 'remux':
        streamUrl = `/api/media/transcode/${encodedPath}`
        directStreamUrl = `/api/media/stream/${encodedPath}`
        break
      case 'transcode':
        streamUrl = `/api/media/transcode/${encodedPath}`
        break
    }

    const strategyLabel = {
      'direct': 'Direct Play',
      'remux': 'Remux (video copy + audio transcode)',
      'transcode': 'Full Transcode'
    }[playbackStrategy]

    console.log(`MediaService: ${title} (native streaming)`)
    console.log(`  File: ${filePath}`)
    console.log(`  Container: ${container}`)
    console.log(`  Video: ${videoCodec} ${width}x${height}`)
    console.log(`  Audio: ${audioCodec} ${audioChannels}ch`)
    console.log(`  Strategy: ${strategyLabel}`)
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
        container
      },
      needsTranscode,
      playbackStrategy,
      streamUrl,
      directStreamUrl,
      hlsSupported: true,
      subtitles,
      audioTracks,
      streamingBackend: 'native'
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
