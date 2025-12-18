import axios, { AxiosInstance } from 'axios'
import { config } from '../config.js'

// Jellyfin API response types
interface JellyfinItem {
  Id: string
  Name: string
  Type: string
  Path?: string
  MediaSources?: MediaSource[]
}

interface MediaSource {
  Id: string
  Path: string
  Container: string
  Size: number
  RunTimeTicks: number
  MediaStreams: MediaStream[]
  SupportsDirectPlay: boolean
  SupportsDirectStream: boolean
  SupportsTranscoding: boolean
  TranscodingUrl?: string
  DirectStreamUrl?: string
}

interface MediaStream {
  Type: 'Video' | 'Audio' | 'Subtitle'
  Index: number
  Codec: string
  Language?: string
  DisplayTitle?: string
  IsDefault?: boolean
  IsForced?: boolean
  // Video specific
  Width?: number
  Height?: number
  // Audio specific
  Channels?: number
  // Subtitle specific
  IsExternal?: boolean
  Path?: string
  DeliveryUrl?: string
}

interface PlaybackInfoResponse {
  MediaSources: MediaSource[]
  PlaySessionId: string
}

export interface JellyfinPlaybackInfo {
  jellyfinItemId: string
  mediaSourceId: string
  playSessionId: string
  hlsUrl: string
  directUrl: string
  mediaSource: MediaSource
  audioTracks: {
    id: number
    streamIndex: number
    language: string
    languageCode: string
    displayTitle: string
    codec: string
    channels: number
    selected: boolean
  }[]
  subtitles: {
    id: number
    streamIndex: number
    language: string
    languageCode: string
    displayTitle: string
    format: string
    url: string
  }[]
  mediaInfo: {
    width: number
    height: number
    videoCodec: string
    audioCodec: string
    container: string
  }
  duration: number
}

class JellyfinService {
  private client: AxiosInstance
  private userId: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: config.jellyfin.url,
      timeout: 30000,
      headers: {
        'X-Emby-Token': config.jellyfin.apiKey,
        'X-Emby-Client': 'My Cinema',
        'X-Emby-Client-Version': '1.0.0',
        'X-Emby-Device-Name': 'My Cinema Web',
        'X-Emby-Device-Id': 'my-cinema-web-client'
      }
    })
  }


  isEnabled(): boolean {
    return config.jellyfin.enabled
  }

  /**
   * Get the first admin user ID (cached after first call)
   */
  private async getUserId(): Promise<string | null> {
    if (this.userId) return this.userId

    try {
      const response = await this.client.get('/Users')
      const users = response.data as Array<{ Id: string; Name: string; Policy?: { IsAdministrator?: boolean } }>

      // Prefer admin user, fallback to first user
      const adminUser = users.find(u => u.Policy?.IsAdministrator)
      const user = adminUser || users[0]

      if (user) {
        this.userId = user.Id
        console.log(`Jellyfin: Using user "${user.Name}" (${user.Id})`)
        return this.userId
      }

      console.error('Jellyfin: No users found')
      return null
    } catch (error) {
      console.error('Jellyfin: Failed to get user ID:', error)
      return null
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/System/Info/Public')
      const serverName = response.data?.ServerName
      console.log(`Jellyfin: Connected to server "${serverName}"`)
      return true
    } catch (error) {
      console.error('Jellyfin: Connection test failed:', error)
      return false
    }
  }

  /**
   * Search for a movie by file path (from Radarr)
   * Uses filename matching since paths may differ between Radarr and Jellyfin
   */
  async findMovieByPath(filePath: string): Promise<JellyfinItem | null> {
    try {
      // Extract filename for matching (more reliable than full path)
      const filename = filePath.split('/').pop() || filePath

      const response = await this.client.get('/Items', {
        params: {
          Recursive: true,
          IncludeItemTypes: 'Movie',
          Fields: 'Path,MediaSources,MediaStreams'
        }
      })

      const items = response.data.Items as JellyfinItem[]

      // Try exact path match first
      let found = items.find(item => {
        if (item.Path === filePath) return true
        if (item.MediaSources?.[0]?.Path === filePath) return true
        return false
      })

      // Fall back to filename matching
      if (!found) {
        found = items.find(item => {
          const itemFilename = item.Path?.split('/').pop() || ''
          const mediaSourceFilename = item.MediaSources?.[0]?.Path?.split('/').pop() || ''
          return itemFilename === filename || mediaSourceFilename === filename
        })
      }

      if (found) {
        console.log(`Jellyfin: Found movie "${found.Name}" for path ${filePath}`)
      } else {
        console.log(`Jellyfin: Movie not found for path ${filePath} (filename: ${filename})`)
        console.log(`Jellyfin: Searched ${items.length} movies`)
      }
      return found || null
    } catch (error) {
      console.error('Jellyfin findMovieByPath error:', error)
      return null
    }
  }

  /**
   * Search for an episode by file path (from Sonarr)
   * Uses filename matching since paths may differ between Sonarr and Jellyfin
   */
  async findEpisodeByPath(filePath: string): Promise<JellyfinItem | null> {
    try {
      // Extract filename for matching (more reliable than full path)
      const filename = filePath.split('/').pop() || filePath

      const response = await this.client.get('/Items', {
        params: {
          Recursive: true,
          IncludeItemTypes: 'Episode',
          Fields: 'Path,MediaSources,MediaStreams'
        }
      })

      const items = response.data.Items as JellyfinItem[]

      // Try exact path match first
      let found = items.find(item => {
        if (item.Path === filePath) return true
        if (item.MediaSources?.[0]?.Path === filePath) return true
        return false
      })

      // Fall back to filename matching
      if (!found) {
        found = items.find(item => {
          const itemFilename = item.Path?.split('/').pop() || ''
          const mediaSourceFilename = item.MediaSources?.[0]?.Path?.split('/').pop() || ''
          return itemFilename === filename || mediaSourceFilename === filename
        })
      }

      if (found) {
        console.log(`Jellyfin: Found episode "${found.Name}" for path ${filePath}`)
      } else {
        console.log(`Jellyfin: Episode not found for path ${filePath} (filename: ${filename})`)
        console.log(`Jellyfin: Searched ${items.length} episodes`)
      }
      return found || null
    } catch (error) {
      console.error('Jellyfin findEpisodeByPath error:', error)
      return null
    }
  }

  /**
   * Get playback info with stream URLs
   */
  async getPlaybackInfo(itemId: string, options: {
    audioStreamIndex?: number
    subtitleStreamIndex?: number
    maxStreamingBitrate?: number
    startTimeTicks?: number
  } = {}): Promise<JellyfinPlaybackInfo | null> {
    try {
      // Get user ID (required for PlaybackInfo)
      const userId = await this.getUserId()
      if (!userId) {
        console.error('Jellyfin: Cannot get playback info without user ID')
        return null
      }

      // Create a playback session with userId as query parameter
      const response = await this.client.post<PlaybackInfoResponse>(
        `/Items/${itemId}/PlaybackInfo`,
        {
          DeviceProfile: this.getDeviceProfile(),
          MaxStreamingBitrate: options.maxStreamingBitrate || 100000000, // 100 Mbps default
          AudioStreamIndex: options.audioStreamIndex,
          SubtitleStreamIndex: options.subtitleStreamIndex,
          StartTimeTicks: options.startTimeTicks
        },
        {
          params: { userId }
        }
      )

      const mediaSource = response.data.MediaSources[0]
      if (!mediaSource) {
        console.error('Jellyfin: No media source found')
        return null
      }

      const playSessionId = response.data.PlaySessionId
      // Use external URL for browser-accessible stream URLs
      const baseUrl = config.jellyfin.externalUrl

      // Build HLS transcoding URL - use proxy endpoint to bypass Private Network Access
      const hlsParams = new URLSearchParams({
        api_key: config.jellyfin.apiKey,
        MediaSourceId: mediaSource.Id,
        PlaySessionId: playSessionId,
        AudioStreamIndex: String(options.audioStreamIndex ?? 0),
        SubtitleStreamIndex: String(options.subtitleStreamIndex ?? -1),
        SubtitleMethod: 'Encode', // Burn-in subtitles for ASS/PGS
        MaxStreamingBitrate: String(options.maxStreamingBitrate || 100000000),
        TranscodingMaxAudioChannels: '2',
        SegmentContainer: 'ts',
        MinSegments: '1',
        BreakOnNonKeyFrames: 'true',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        TranscodeReasons: 'ContainerNotSupported,AudioCodecNotSupported'
      })

      if (options.startTimeTicks) {
        hlsParams.set('StartTimeTicks', String(options.startTimeTicks))
      }

      // Use proxy URL to bypass browser Private Network Access restrictions
      // The backend will proxy the HLS stream from Jellyfin
      // Use absolute URL so browser can reach the backend directly (not through frontend nginx)
      const backendUrl = config.externalUrl.replace(/\/$/, '')
      const hlsUrl = `${backendUrl}/api/proxy/hls/${itemId}/master.m3u8?${hlsParams.toString()}`

      // Build direct stream URL (if compatible)
      const directParams = new URLSearchParams({
        api_key: config.jellyfin.apiKey,
        Static: 'true',
        MediaSourceId: mediaSource.Id
      })
      const directUrl = `${baseUrl}/Videos/${itemId}/stream?${directParams.toString()}`

      // Extract audio tracks
      const audioTracks = mediaSource.MediaStreams
        .filter(s => s.Type === 'Audio')
        .map((s, idx) => ({
          id: idx,
          streamIndex: s.Index,
          language: s.Language || 'Unknown',
          languageCode: s.Language || 'und',
          displayTitle: s.DisplayTitle || `Audio ${idx + 1}`,
          codec: s.Codec,
          channels: s.Channels || 2,
          selected: s.IsDefault || idx === 0
        }))

      // Extract subtitles - use proxy URLs to bypass Private Network Access restrictions
      const subtitles = mediaSource.MediaStreams
        .filter(s => s.Type === 'Subtitle')
        .map((s, idx) => {
          // Build subtitle URL using proxy endpoint (absolute URL)
          const subtitleUrl = `${backendUrl}/api/proxy/subtitles/${itemId}/${mediaSource.Id}/${s.Index}/Stream.vtt`

          return {
            id: idx,
            streamIndex: s.Index,
            language: s.Language || 'Unknown',
            languageCode: s.Language || 'und',
            displayTitle: s.DisplayTitle || `Subtitle ${idx + 1}`,
            format: s.Codec || 'srt',
            url: subtitleUrl
          }
        })

      // Get video stream info
      const videoStream = mediaSource.MediaStreams.find(s => s.Type === 'Video')
      const audioStream = mediaSource.MediaStreams.find(s => s.Type === 'Audio')

      return {
        jellyfinItemId: itemId,
        mediaSourceId: mediaSource.Id,
        playSessionId,
        hlsUrl,
        directUrl,
        mediaSource,
        audioTracks,
        subtitles,
        mediaInfo: {
          width: videoStream?.Width || 1920,
          height: videoStream?.Height || 1080,
          videoCodec: videoStream?.Codec || 'h264',
          audioCodec: audioStream?.Codec || 'aac',
          container: mediaSource.Container
        },
        duration: Math.floor(mediaSource.RunTimeTicks / 10000) // Convert to ms
      }
    } catch (error) {
      console.error('Jellyfin getPlaybackInfo error:', error)
      return null
    }
  }

  /**
   * Get a new HLS URL with different audio track
   */
  getHlsUrlWithAudioTrack(itemId: string, mediaSourceId: string, playSessionId: string, audioStreamIndex: number): string {
    const params = new URLSearchParams({
      api_key: config.jellyfin.apiKey,
      MediaSourceId: mediaSourceId,
      PlaySessionId: playSessionId,
      AudioStreamIndex: String(audioStreamIndex),
      SubtitleStreamIndex: '-1',
      SubtitleMethod: 'Encode',
      MaxStreamingBitrate: '100000000',
      TranscodingMaxAudioChannels: '2',
      SegmentContainer: 'ts',
      MinSegments: '1',
      BreakOnNonKeyFrames: 'true',
      VideoCodec: 'h264',
      AudioCodec: 'aac'
    })
    // Use proxy URL to bypass browser Private Network Access restrictions
    const backendUrl = config.externalUrl.replace(/\/$/, '')
    return `${backendUrl}/api/proxy/hls/${itemId}/master.m3u8?${params.toString()}`
  }

  /**
   * Report playback progress to Jellyfin
   */
  async reportProgress(itemId: string, positionTicks: number, isPaused: boolean): Promise<void> {
    try {
      await this.client.post('/Sessions/Playing/Progress', {
        ItemId: itemId,
        PositionTicks: positionTicks,
        IsPaused: isPaused,
        PlayMethod: 'Transcode'
      })
    } catch (error) {
      // Ignore progress reporting errors
    }
  }

  /**
   * Report playback stopped
   */
  async reportStopped(itemId: string, positionTicks: number): Promise<void> {
    try {
      await this.client.post('/Sessions/Playing/Stopped', {
        ItemId: itemId,
        PositionTicks: positionTicks
      })
    } catch (error) {
      // Ignore stop reporting errors
    }
  }

  /**
   * Force library scan (useful after Radarr/Sonarr adds content)
   */
  async refreshLibrary(): Promise<void> {
    try {
      await this.client.post('/Library/Refresh')
      console.log('Jellyfin: Library refresh triggered')
    } catch (error) {
      console.error('Jellyfin refreshLibrary error:', error)
    }
  }

  /**
   * Device profile for browser playback
   * Tells Jellyfin what codecs the browser supports
   */
  private getDeviceProfile() {
    return {
      MaxStreamingBitrate: 100000000,
      MaxStaticBitrate: 100000000,
      MusicStreamingTranscodingBitrate: 192000,
      DirectPlayProfiles: [
        // Browser can direct play these
        { Container: 'mp4', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,mp3' },
        { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9', AudioCodec: 'vorbis,opus' }
      ],
      TranscodingProfiles: [
        // Transcode to HLS with H.264 + AAC
        {
          Container: 'ts',
          Type: 'Video',
          VideoCodec: 'h264',
          AudioCodec: 'aac',
          Context: 'Streaming',
          Protocol: 'hls',
          MaxAudioChannels: '2',
          MinSegments: 1,
          BreakOnNonKeyFrames: true
        }
      ],
      ContainerProfiles: [],
      CodecProfiles: [
        {
          Type: 'Video',
          Codec: 'h264',
          Conditions: [
            { Condition: 'LessThanEqual', Property: 'Width', Value: '1920' },
            { Condition: 'LessThanEqual', Property: 'Height', Value: '1080' },
            { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51' }
          ]
        }
      ],
      SubtitleProfiles: [
        { Format: 'vtt', Method: 'External' },
        { Format: 'srt', Method: 'External' },
        { Format: 'ass', Method: 'Encode' },
        { Format: 'ssa', Method: 'Encode' },
        { Format: 'pgs', Method: 'Encode' },
        { Format: 'pgssub', Method: 'Encode' },
        { Format: 'sub', Method: 'Encode' },
        { Format: 'subrip', Method: 'External' }
      ]
    }
  }
}

export const jellyfinService = new JellyfinService()
