import axios, { AxiosInstance } from 'axios'
import { config } from '../config.js'
import { v4 as uuidv4 } from 'uuid'

// Plex API response types
interface PlexLibrary {
  key: string
  title: string
  type: 'movie' | 'show'
  uuid: string
}

interface PlexGuid {
  id: string // e.g., "tmdb://12345" or "imdb://tt1234567"
}

interface PlexMediaPart {
  id: number
  key: string
  duration: number
  file: string
  size: number
  container: string
  Stream?: PlexMediaStream[]
}

interface PlexMediaStream {
  id: number
  streamType: number // 1=video, 2=audio, 3=subtitle
  codec: string
  language?: string
  languageCode?: string
  displayTitle?: string
  selected?: boolean
  default?: boolean
}

interface PlexMedia {
  id: number
  duration: number
  bitrate: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string
  container: string
  Part: PlexMediaPart[]
  Stream?: PlexMediaStream[]
}

interface PlexVideo {
  ratingKey: string
  key: string
  guid: string
  type: 'movie' | 'episode'
  title: string
  grandparentTitle?: string // Show title for episodes
  parentTitle?: string // Season title for episodes
  parentIndex?: number // Season number
  index?: number // Episode number
  year?: number
  duration: number
  viewOffset?: number // Resume position in ms
  lastViewedAt?: number
  thumb?: string
  art?: string
  Guid?: PlexGuid[]
  Media?: PlexMedia[]
}

interface PlexDirectory {
  ratingKey: string
  key: string
  type: 'show' | 'season'
  title: string
  index?: number
  thumb?: string
}

export interface PlaybackInfo {
  ratingKey: string
  title: string
  type: 'movie' | 'episode'
  duration: number
  viewOffset: number
  streamUrl: string
  needsTranscode: boolean // True if using HLS transcoding for incompatible audio
  filePath?: string // Direct file path for streaming
  fileSize?: number // File size in bytes
  mediaInfo: {
    width: number
    height: number
    videoCodec: string
    audioCodec: string
    container: string
  }
  subtitles: Array<{
    id: number
    language: string
    languageCode: string
    displayTitle: string
    url: string
  }>
  audioTracks: Array<{
    id: number
    language: string
    languageCode: string
    displayTitle: string
    selected: boolean
  }>
}

export interface PlexProfile {
  id: number
  uuid: string
  title: string
  email?: string
  thumb?: string
  token?: string
}

class PlexService {
  private client: AxiosInstance
  private clientId: string
  private libraryCache: Map<string, { tmdbId: number; ratingKey: string; type: 'movie' | 'show' }> = new Map()
  private libraryCacheTime: number = 0
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor() {
    this.clientId = 'my-cinema-' + uuidv4().substring(0, 8)

    this.client = axios.create({
      baseURL: config.plex.url,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': config.plex.token,
        'X-Plex-Client-Identifier': this.clientId,
        'X-Plex-Product': 'My Cinema',
        'X-Plex-Version': '1.0.0',
        'X-Plex-Platform': 'Web'
      }
    })
  }

  isEnabled(): boolean {
    return config.plex.enabled
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/')
      const serverName = response.data?.MediaContainer?.friendlyName
      console.log(`Plex: Connected to server "${serverName}"`)
      return true
    } catch (error) {
      console.error('Plex: Connection test failed:', error)
      return false
    }
  }

  async getLibraries(): Promise<PlexLibrary[]> {
    try {
      const response = await this.client.get('/library/sections')
      const directories = response.data?.MediaContainer?.Directory || []

      return directories
        .filter((d: any) => d.type === 'movie' || d.type === 'show')
        .map((d: any) => ({
          key: d.key,
          title: d.title,
          type: d.type,
          uuid: d.uuid
        }))
    } catch (error) {
      console.error('Plex: Error getting libraries:', error)
      return []
    }
  }

  // Build a cache of TMDB ID -> Plex ratingKey mappings
  private async refreshLibraryCache(): Promise<void> {
    if (Date.now() - this.libraryCacheTime < this.CACHE_TTL && this.libraryCache.size > 0) {
      return // Cache is still valid
    }

    console.log('Plex: Refreshing library cache...')
    this.libraryCache.clear()

    const libraries = await this.getLibraries()

    for (const library of libraries) {
      try {
        const response = await this.client.get(`/library/sections/${library.key}/all`, {
          params: { includeGuids: 1 }
        })

        const items = response.data?.MediaContainer?.Metadata || []

        for (const item of items) {
          const guids = item.Guid || []
          const tmdbGuid = guids.find((g: PlexGuid) => g.id.startsWith('tmdb://'))

          if (tmdbGuid) {
            const tmdbId = parseInt(tmdbGuid.id.replace('tmdb://', ''), 10)
            this.libraryCache.set(`${library.type}-${tmdbId}`, {
              tmdbId,
              ratingKey: item.ratingKey,
              type: library.type
            })
          }
        }
      } catch (error) {
        console.error(`Plex: Error scanning library ${library.title}:`, error)
      }
    }

    this.libraryCacheTime = Date.now()
    console.log(`Plex: Cached ${this.libraryCache.size} items`)
  }

  async findByTmdbId(tmdbId: number, type: 'movie' | 'show'): Promise<PlexVideo | null> {
    await this.refreshLibraryCache()

    const cached = this.libraryCache.get(`${type}-${tmdbId}`)
    if (!cached) {
      return null
    }

    return this.getMetadata(cached.ratingKey)
  }

  async getMetadata(ratingKey: string): Promise<PlexVideo | null> {
    try {
      const response = await this.client.get(`/library/metadata/${ratingKey}`, {
        params: { includeGuids: 1 }
      })

      const metadata = response.data?.MediaContainer?.Metadata?.[0]
      return metadata || null
    } catch (error) {
      console.error('Plex: Error getting metadata:', error)
      return null
    }
  }

  async findEpisode(showTmdbId: number, seasonNumber: number, episodeNumber: number): Promise<PlexVideo | null> {
    // First find the show
    const show = await this.findByTmdbId(showTmdbId, 'show')
    if (!show) {
      return null
    }

    try {
      // Get seasons
      const seasonsResponse = await this.client.get(`/library/metadata/${show.ratingKey}/children`)
      const seasons = seasonsResponse.data?.MediaContainer?.Metadata || []

      const season = seasons.find((s: PlexDirectory) => s.index === seasonNumber)
      if (!season) {
        return null
      }

      // Get episodes
      const episodesResponse = await this.client.get(`/library/metadata/${season.ratingKey}/children`)
      const episodes = episodesResponse.data?.MediaContainer?.Metadata || []

      const episode = episodes.find((e: PlexVideo) => e.index === episodeNumber)
      return episode || null
    } catch (error) {
      console.error('Plex: Error finding episode:', error)
      return null
    }
  }

  getStreamUrl(ratingKey: string, options?: { quality?: string; location?: 'lan' | 'wan' }): string {
    const sessionId = uuidv4()
    const quality = options?.quality || 'original'

    // Build transcode URL for HLS streaming
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
      location: options?.location || 'lan',
      session: sessionId,
      'X-Plex-Token': config.plex.token,
      'X-Plex-Client-Identifier': this.clientId,
      'X-Plex-Product': 'My Cinema',
      'X-Plex-Platform': 'Web'
    })

    // Add quality settings if not original
    if (quality !== 'original') {
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

    return `${config.plex.url}/video/:/transcode/universal/start.m3u8?${params.toString()}`
  }

  getDirectPlayUrl(partKey: string): string {
    return `${config.plex.url}${partKey}?X-Plex-Token=${config.plex.token}`
  }

  async getPlaybackInfo(ratingKey: string): Promise<PlaybackInfo | null> {
    const metadata = await this.getMetadata(ratingKey)
    if (!metadata || !metadata.Media?.[0]) {
      return null
    }

    const media = metadata.Media[0]
    const part = media.Part?.[0]
    // Streams are inside Part, not Media
    const streams = part?.Stream || []

    console.log(`Plex: Found ${streams.length} streams for ratingKey ${ratingKey}`)

    // Extract subtitle tracks (streamType 3)
    const subtitles = streams
      .filter((s: PlexMediaStream) => s.streamType === 3)
      .map((s: PlexMediaStream) => ({
        id: s.id,
        language: s.language || 'Unknown',
        languageCode: s.languageCode || 'und',
        displayTitle: s.displayTitle || s.language || 'Unknown',
        url: `/api/playback/subtitle/${ratingKey}/${s.id}`
      }))

    // Extract audio tracks (streamType 2)
    const audioTracks = streams
      .filter((s: PlexMediaStream) => s.streamType === 2)
      .map((s: PlexMediaStream) => ({
        id: s.id,
        language: s.language || 'Unknown',
        languageCode: s.languageCode || 'und',
        displayTitle: s.displayTitle || s.language || 'Unknown',
        selected: s.selected || false
      }))

    console.log(`Plex: Found ${subtitles.length} subtitles, ${audioTracks.length} audio tracks`)

    // Get file info for direct streaming
    const filePath = part?.file
    const fileSize = part?.size
    const container = media.container
    const audioCodec = media.audioCodec

    console.log(`Plex: File path: ${filePath}, size: ${fileSize ? Math.round(fileSize / 1024 / 1024) + 'MB' : 'unknown'}`)
    console.log(`Plex: Container: ${container}, Audio codec: ${audioCodec}, Video codec: ${media.videoCodec}`)

    // Check if audio codec is browser-compatible
    // Browsers support: AAC, MP3, Opus, Vorbis, FLAC (partial), PCM
    // Browsers DON'T support: DTS, TrueHD, AC3/EAC3 (except Safari), etc.
    const browserCompatibleAudio = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm', 'alac']
    const needsTranscode = !browserCompatibleAudio.includes(audioCodec?.toLowerCase() || '')

    let streamUrl: string
    if (needsTranscode) {
      // Use Plex transcoding for incompatible audio codecs
      // This transcodes audio to AAC while direct streaming video
      console.log(`Plex: Audio codec '${audioCodec}' needs transcoding, using HLS stream`)
      streamUrl = `/api/playback/proxy/hls/${ratingKey}/master.m3u8`
    } else {
      // Direct file streaming for compatible formats
      console.log(`Plex: Audio codec '${audioCodec}' is browser-compatible, using direct stream`)
      streamUrl = `/api/playback/stream/${ratingKey}`
    }

    return {
      ratingKey: metadata.ratingKey,
      title: metadata.grandparentTitle
        ? `${metadata.grandparentTitle} - S${metadata.parentIndex}E${metadata.index} - ${metadata.title}`
        : metadata.title,
      type: metadata.type,
      duration: metadata.duration,
      viewOffset: metadata.viewOffset || 0,
      streamUrl,
      needsTranscode,
      filePath,
      fileSize,
      mediaInfo: {
        width: media.width,
        height: media.height,
        videoCodec: media.videoCodec,
        audioCodec: media.audioCodec,
        container: media.container
      },
      subtitles,
      audioTracks
    }
  }

  async updateProgress(
    ratingKey: string,
    timeMs: number,
    state: 'playing' | 'paused' | 'stopped',
    duration?: number
  ): Promise<void> {
    try {
      await this.client.get('/:/timeline', {
        params: {
          ratingKey,
          key: `/library/metadata/${ratingKey}`,
          state,
          time: timeMs,
          duration: duration || 0,
          'X-Plex-Session-Id': `my-cinema-${ratingKey}`
        }
      })
    } catch (error) {
      console.error('Plex: Error updating progress:', error)
    }
  }

  async markAsWatched(ratingKey: string): Promise<void> {
    try {
      await this.client.get(`/:/scrobble`, {
        params: {
          key: ratingKey,
          identifier: 'com.plexapp.plugins.library'
        }
      })
    } catch (error) {
      console.error('Plex: Error marking as watched:', error)
    }
  }

  async markAsUnwatched(ratingKey: string): Promise<void> {
    try {
      await this.client.get(`/:/unscrobble`, {
        params: {
          key: ratingKey,
          identifier: 'com.plexapp.plugins.library'
        }
      })
    } catch (error) {
      console.error('Plex: Error marking as unwatched:', error)
    }
  }

  async getContinueWatching(): Promise<PlexVideo[]> {
    try {
      const response = await this.client.get('/library/onDeck')
      return response.data?.MediaContainer?.Metadata || []
    } catch (error) {
      console.error('Plex: Error getting continue watching:', error)
      return []
    }
  }

  async getRecentlyAdded(limit: number = 20): Promise<PlexVideo[]> {
    try {
      const response = await this.client.get('/library/recentlyAdded', {
        params: { 'X-Plex-Container-Size': limit }
      })
      return response.data?.MediaContainer?.Metadata || []
    } catch (error) {
      console.error('Plex: Error getting recently added:', error)
      return []
    }
  }

  // Get available profiles (for multi-user support)
  async getProfiles(): Promise<PlexProfile[]> {
    try {
      // This requires the owner token to list home users
      const response = await this.client.get('/api/v2/home/users', {
        baseURL: 'https://plex.tv',
        headers: {
          'X-Plex-Token': config.plex.token,
          'X-Plex-Client-Identifier': this.clientId
        }
      })

      const users = response.data?.users || []
      return users.map((u: any) => ({
        id: u.id,
        uuid: u.uuid,
        title: u.title,
        email: u.email,
        thumb: u.thumb
      }))
    } catch (error) {
      console.error('Plex: Error getting profiles:', error)
      // Return at least the current user
      return []
    }
  }

  // Invalidate cache (useful after library scan)
  invalidateCache(): void {
    this.libraryCache.clear()
    this.libraryCacheTime = 0
  }
}

export const plexService = new PlexService()
