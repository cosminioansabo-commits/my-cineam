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
  RealFrameRate?: number
  AverageFrameRate?: number
  BitDepth?: number
  ColorSpace?: string
  ColorTransfer?: string
  ColorPrimaries?: string
  VideoRange?: string
  VideoRangeType?: string
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

      // Get video stream info to determine optimal transcoding settings
      const videoStream = mediaSource.MediaStreams.find(s => s.Type === 'Video')
      const isHEVC = videoStream?.Codec?.toLowerCase() === 'hevc' || videoStream?.Codec?.toLowerCase() === 'h265'
      const is4K = (videoStream?.Width || 0) >= 3840

      // Detect HDR content for proper tone mapping
      const videoRangeType = videoStream?.VideoRangeType || videoStream?.VideoRange || 'SDR'
      const isHDR = ['HDR', 'HDR10', 'HDR10Plus', 'HLG', 'DOVI', 'DOVIWithHDR10', 'DOVIWithHDR10Plus'].some(
        type => videoRangeType.toUpperCase().includes(type.toUpperCase())
      )
      const colorTransfer = videoStream?.ColorTransfer || ''
      const isHDRByTransfer = colorTransfer.toLowerCase().includes('smpte2084') ||
                              colorTransfer.toLowerCase().includes('arib-std-b67') ||
                              colorTransfer.toLowerCase().includes('bt2020')

      console.log(`Jellyfin: Video range type: ${videoRangeType}, isHDR: ${isHDR || isHDRByTransfer}, colorTransfer: ${colorTransfer}`)

      // Build HLS transcoding URL - use proxy endpoint to bypass Private Network Access
      // Match Jellyfin web client settings for best quality
      const videoBitrate = is4K ? 139616000 : 40000000 // 140 Mbps for 4K, 40 Mbps for 1080p
      const audioBitrate = 384000 // 384 kbps AAC

      // Build transcoding reasons - always include VideoRangeTypeNotSupported for proper tone mapping
      const transcodeReasons = (isHDR || isHDRByTransfer)
        ? 'ContainerNotSupported,VideoCodecNotSupported,AudioCodecNotSupported,VideoRangeTypeNotSupported'
        : 'ContainerNotSupported,VideoCodecNotSupported,AudioCodecNotSupported'

      const hlsParams = new URLSearchParams({
        api_key: config.jellyfin.apiKey,
        MediaSourceId: mediaSource.Id,
        PlaySessionId: playSessionId,
        AudioStreamIndex: String(options.audioStreamIndex ?? 0),
        SubtitleStreamIndex: String(options.subtitleStreamIndex ?? -1),
        SubtitleMethod: 'Encode',
        // High bitrate matching Jellyfin web client
        VideoBitrate: String(options.maxStreamingBitrate || videoBitrate),
        AudioBitrate: String(audioBitrate),
        MaxFramerate: String(videoStream?.RealFrameRate || 23.976),
        // Match Jellyfin web client - uses 2 channels for stereo output
        TranscodingMaxAudioChannels: '2',
        // Use fMP4 segments for better quality (like Jellyfin web)
        SegmentContainer: 'mp4',
        MinSegments: '2',
        BreakOnNonKeyFrames: 'True',
        // Match Jellyfin web client: multiple video codecs with H.264 as final fallback
        // This allows Jellyfin to choose the best transcoding path for HDR content
        VideoCodec: 'av1,hevc,h264,vp9',
        AudioCodec: 'aac',
        RequireAvc: 'false',
        EnableAudioVbrEncoding: 'true',
        TranscodeReasons: transcodeReasons,
        // H.264 profile settings
        'h264-profile': 'high,main,baseline,constrainedbaseline,high10',
        'h264-rangetype': 'SDR',
        'h264-level': '52',
        'h264-deinterlace': 'true',
        // HEVC profile settings for HDR content (intermediate codec)
        'hevc-rangetype': 'SDR,HDR10,HDR10Plus,HLG',
        'hevc-videobitdepth': '10',
        'hevc-profile': 'main10',
        'hevc-level': '150',
        'hevc-deinterlace': 'true',
        // AV1 profile settings (like Jellyfin web client)
        'av1-profile': 'main',
        'av1-rangetype': 'SDR,HDR10,HLG',
        'av1-level': '19',
        // VP9 profile settings (like Jellyfin web client)
        'vp9-rangetype': 'SDR,HDR10,HLG'
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

      // Get audio stream info (videoStream already defined above)
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
      VideoBitrate: '139616000', // 140 Mbps for quality
      AudioBitrate: '384000',
      // Match Jellyfin web client - uses 2 channels for stereo output
      TranscodingMaxAudioChannels: '2',
      SegmentContainer: 'mp4',
      MinSegments: '2',
      BreakOnNonKeyFrames: 'True',
      // Match Jellyfin web client: multiple video codecs
      VideoCodec: 'av1,hevc,h264,vp9',
      AudioCodec: 'aac',
      RequireAvc: 'false',
      EnableAudioVbrEncoding: 'true',
      // Include VideoRangeTypeNotSupported for HDR content tone mapping
      TranscodeReasons: 'ContainerNotSupported,VideoCodecNotSupported,AudioCodecNotSupported,VideoRangeTypeNotSupported',
      // H.264 profile settings
      'h264-profile': 'high,main,baseline,constrainedbaseline,high10',
      'h264-rangetype': 'SDR',
      'h264-level': '52',
      'h264-deinterlace': 'true',
      // HEVC profile settings
      'hevc-rangetype': 'SDR,HDR10,HDR10Plus,HLG',
      'hevc-videobitdepth': '10',
      'hevc-profile': 'main10',
      'hevc-level': '150',
      'hevc-deinterlace': 'true',
      // AV1 profile settings
      'av1-profile': 'main',
      'av1-rangetype': 'SDR,HDR10,HLG',
      'av1-level': '19',
      // VP9 profile settings
      'vp9-rangetype': 'SDR,HDR10,HLG'
    })
    // Use proxy URL to bypass browser Private Network Access restrictions
    const backendUrl = config.externalUrl.replace(/\/$/, '')
    return `${backendUrl}/api/proxy/hls/${itemId}/master.m3u8?${params.toString()}`
  }

  /**
   * Report playback started to Jellyfin
   * Must be called before reportProgress for Jellyfin to track the session
   */
  async reportStarted(itemId: string, mediaSourceId: string, playSessionId: string): Promise<void> {
    try {
      await this.client.post('/Sessions/Playing', {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PlayMethod: 'Transcode',
        CanSeek: true
      })
    } catch (error) {
      console.error('Error reporting playback started to Jellyfin:', error)
    }
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
   * Matches Jellyfin web client profile for proper transcoding and HDR handling
   */
  private getDeviceProfile() {
    return {
      MaxStreamingBitrate: 140000000, // 140 Mbps for 4K
      MaxStaticBitrate: 140000000,
      MusicStreamingTranscodingBitrate: 384000,
      DirectPlayProfiles: [
        // Browser can direct play these (H.264 SDR only)
        { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,mp3,ac3' },
        { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9', AudioCodec: 'vorbis,opus' },
        { Container: 'mp3', Type: 'Audio' },
        { Container: 'aac', Type: 'Audio' }
      ],
      TranscodingProfiles: [
        // Transcode to HLS with fMP4 segments (better quality than TS)
        {
          Container: 'mp4',
          Type: 'Video',
          VideoCodec: 'h264',
          AudioCodec: 'aac',
          Context: 'Streaming',
          Protocol: 'hls',
          MaxAudioChannels: '6', // 5.1 surround
          MinSegments: 2,
          BreakOnNonKeyFrames: true,
          // Key settings for HDR to SDR conversion
          EnableSubtitlesInManifest: true,
          SegmentLength: 6
        },
        // Audio-only transcoding
        {
          Container: 'mp4',
          Type: 'Audio',
          AudioCodec: 'aac',
          Context: 'Streaming',
          Protocol: 'hls',
          MaxAudioChannels: '6'
        }
      ],
      ContainerProfiles: [],
      CodecProfiles: [
        // H.264 profile - allow up to 4K but SDR only
        {
          Type: 'Video',
          Codec: 'h264',
          Conditions: [
            { Condition: 'LessThanEqual', Property: 'Width', Value: '3840' },
            { Condition: 'LessThanEqual', Property: 'Height', Value: '2160' },
            { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '52' },
            // Only SDR - HDR will trigger transcode with tone mapping
            { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR' }
          ]
        },
        // AAC profile
        {
          Type: 'Audio',
          Codec: 'aac',
          Conditions: [
            { Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '6' }
          ]
        }
      ],
      SubtitleProfiles: [
        { Format: 'vtt', Method: 'External' },
        { Format: 'srt', Method: 'External' },
        { Format: 'subrip', Method: 'External' },
        { Format: 'ass', Method: 'Encode' },
        { Format: 'ssa', Method: 'Encode' },
        { Format: 'pgs', Method: 'Encode' },
        { Format: 'pgssub', Method: 'Encode' },
        { Format: 'dvdsub', Method: 'Encode' },
        { Format: 'dvbsub', Method: 'Encode' },
        { Format: 'sub', Method: 'Encode' }
      ],
      // Tell Jellyfin this device doesn't support HDR
      // This triggers tone mapping for HDR content
      ResponseProfiles: [
        {
          Type: 'Video',
          Container: 'mp4,m4v',
          Conditions: [
            { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR' }
          ]
        }
      ]
    }
  }
}

export const jellyfinService = new JellyfinService()
