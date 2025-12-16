# Jellyfin Integration Plan for My-Cinema

## Overview

Replace the custom FFmpeg transcoding implementation with Jellyfin as the streaming backend. My-Cinema keeps its UI and metadata (TMDB), while Jellyfin handles all media playback, transcoding, and codec compatibility.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        My-Cinema Frontend                        │
│  (Vue 3 + Your Custom UI + TMDB Metadata)                       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     My-Cinema Backend                            │
│  - TMDB API proxy                                                │
│  - Radarr/Sonarr integration (library management)               │
│  - Progress tracking (your database)                             │
│  - Jellyfin API proxy (stream URLs)                             │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Jellyfin Server                           │
│  - Transcoding (Intel QuickSync)                                │
│  - HLS streaming                                                 │
│  - Audio/Video codec handling                                    │
│  - Subtitle burn-in/extraction                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Jellyfin Setup (Docker)

### 1.1 Add Jellyfin to Docker Compose

Add to your `docker-compose.my-cinema.yml` on NAS:

```yaml
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    restart: always
    networks:
      - my-cinema-network
    ports:
      - "8096:8096"      # Web UI (optional, can remove after setup)
    devices:
      - /dev/dri:/dev/dri  # Intel QuickSync
    volumes:
      - jellyfin-config:/config
      - jellyfin-cache:/cache
      - /volume1/data/media/movies:/movies:ro
      - /volume1/data/media/tv:/tv:ro
    environment:
      - JELLYFIN_PublishedServerUrl=http://jellyfin:8096
    # Run as your media user
    user: "1000:1000"

volumes:
  jellyfin-config:
  jellyfin-cache:
```

### 1.2 Initial Jellyfin Configuration

1. Access Jellyfin at `http://nas-ip:8096`
2. Create admin account (can be simple, only used by backend)
3. Add libraries:
   - Movies: `/movies`
   - TV Shows: `/tv`
4. Enable hardware transcoding:
   - Dashboard → Playback → Transcoding
   - Enable Intel QuickSync Video (QSV)
   - Enable hardware decoding for all codecs
5. Create API key:
   - Dashboard → API Keys → Add
   - Save the key for My-Cinema backend

### 1.3 Jellyfin Transcoding Settings

Recommended settings for browser streaming:
- **Hardware acceleration**: Intel QuickSync Video
- **Preferred video encoder**: QSV H.264
- **Hardware decode**: H264, HEVC, VC1, VP8, VP9
- **Enable tonemapping**: Yes (for HDR content)
- **Throttle transcoding**: Yes (saves CPU)

---

## Phase 2: Backend Integration

### 2.1 New Environment Variables

Add to `.env`:
```env
JELLYFIN_URL=http://jellyfin:8096
JELLYFIN_API_KEY=your-api-key-here
```

### 2.2 Jellyfin Service (`server/src/services/jellyfinService.ts`)

```typescript
import axios from 'axios'

const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://jellyfin:8096'
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || ''

interface JellyfinItem {
  Id: string
  Name: string
  Type: string
  Path: string
  MediaSources: MediaSource[]
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
}

class JellyfinService {
  private api = axios.create({
    baseURL: JELLYFIN_URL,
    headers: {
      'X-Emby-Token': JELLYFIN_API_KEY
    }
  })

  /**
   * Search for a movie by path (from Radarr)
   */
  async findMovieByPath(filePath: string): Promise<JellyfinItem | null> {
    try {
      // Search by path in Jellyfin
      const response = await this.api.get('/Items', {
        params: {
          Recursive: true,
          IncludeItemTypes: 'Movie',
          Fields: 'Path,MediaSources,MediaStreams'
        }
      })

      const items = response.data.Items as JellyfinItem[]
      return items.find(item => item.Path === filePath) || null
    } catch (error) {
      console.error('Jellyfin findMovieByPath error:', error)
      return null
    }
  }

  /**
   * Search for an episode by path (from Sonarr)
   */
  async findEpisodeByPath(filePath: string): Promise<JellyfinItem | null> {
    try {
      const response = await this.api.get('/Items', {
        params: {
          Recursive: true,
          IncludeItemTypes: 'Episode',
          Fields: 'Path,MediaSources,MediaStreams'
        }
      })

      const items = response.data.Items as JellyfinItem[]
      return items.find(item => item.Path === filePath) || null
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
  } = {}): Promise<{
    hlsUrl: string
    directUrl: string
    mediaSource: MediaSource
  } | null> {
    try {
      // Create a playback session
      const response = await this.api.post(`/Items/${itemId}/PlaybackInfo`, {
        DeviceProfile: this.getDeviceProfile(),
        MaxStreamingBitrate: options.maxStreamingBitrate || 100000000, // 100 Mbps default
        AudioStreamIndex: options.audioStreamIndex,
        SubtitleStreamIndex: options.subtitleStreamIndex
      })

      const mediaSource = response.data.MediaSources[0]
      if (!mediaSource) return null

      // Build stream URLs
      const baseUrl = JELLYFIN_URL
      const playSessionId = response.data.PlaySessionId

      // HLS transcoding URL (works for everything)
      const hlsUrl = `${baseUrl}/Videos/${itemId}/master.m3u8?` + new URLSearchParams({
        api_key: JELLYFIN_API_KEY,
        MediaSourceId: mediaSource.Id,
        PlaySessionId: playSessionId,
        AudioStreamIndex: String(options.audioStreamIndex ?? 0),
        SubtitleStreamIndex: String(options.subtitleStreamIndex ?? -1),
        SubtitleMethod: 'Encode', // Burn-in subtitles
        MaxStreamingBitrate: String(options.maxStreamingBitrate || 100000000),
        TranscodingMaxAudioChannels: '2',
        SegmentContainer: 'ts',
        MinSegments: '1',
        BreakOnNonKeyFrames: 'true'
      }).toString()

      // Direct stream URL (if compatible)
      const directUrl = `${baseUrl}/Videos/${itemId}/stream?` + new URLSearchParams({
        api_key: JELLYFIN_API_KEY,
        Static: 'true',
        MediaSourceId: mediaSource.Id
      }).toString()

      return {
        hlsUrl,
        directUrl,
        mediaSource
      }
    } catch (error) {
      console.error('Jellyfin getPlaybackInfo error:', error)
      return null
    }
  }

  /**
   * Report playback progress to Jellyfin
   */
  async reportProgress(itemId: string, positionTicks: number, isPaused: boolean): Promise<void> {
    try {
      await this.api.post('/Sessions/Playing/Progress', {
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
      await this.api.post('/Sessions/Playing/Stopped', {
        ItemId: itemId,
        PositionTicks: positionTicks
      })
    } catch (error) {
      // Ignore stop reporting errors
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

  /**
   * Get available subtitle tracks for an item
   */
  async getSubtitles(itemId: string, mediaSourceId: string): Promise<{
    index: number
    language: string
    displayTitle: string
    isDefault: boolean
    isForced: boolean
    url: string
  }[]> {
    try {
      const response = await this.api.get(`/Items/${itemId}`, {
        params: { Fields: 'MediaSources' }
      })

      const mediaSource = response.data.MediaSources?.find(
        (ms: MediaSource) => ms.Id === mediaSourceId
      )
      if (!mediaSource) return []

      const subtitles = mediaSource.MediaStreams
        .filter((stream: MediaStream) => stream.Type === 'Subtitle')
        .map((stream: MediaStream) => ({
          index: stream.Index,
          language: stream.Language || 'Unknown',
          displayTitle: stream.DisplayTitle || `Track ${stream.Index}`,
          isDefault: stream.IsDefault || false,
          isForced: stream.IsForced || false,
          url: stream.IsExternal
            ? stream.Path || ''
            : `${JELLYFIN_URL}/Videos/${itemId}/${mediaSourceId}/Subtitles/${stream.Index}/Stream.vtt?api_key=${JELLYFIN_API_KEY}`
        }))

      return subtitles
    } catch (error) {
      console.error('Jellyfin getSubtitles error:', error)
      return []
    }
  }

  /**
   * Force library scan (useful after Radarr/Sonarr adds content)
   */
  async refreshLibrary(): Promise<void> {
    try {
      await this.api.post('/Library/Refresh')
    } catch (error) {
      console.error('Jellyfin refreshLibrary error:', error)
    }
  }

  isEnabled(): boolean {
    return !!JELLYFIN_URL && !!JELLYFIN_API_KEY
  }
}

export const jellyfinService = new JellyfinService()
```

### 2.3 Update Media Routes (`server/src/routes/media.ts`)

Replace the FFmpeg transcoding with Jellyfin proxy:

```typescript
import { jellyfinService } from '../services/jellyfinService.js'

// Get movie playback info - now uses Jellyfin
router.get('/movie/:tmdbId', async (req: Request, res: Response) => {
  const tmdbId = parseInt(req.params.tmdbId, 10)

  try {
    // Get file path from Radarr
    const radarrMovie = await radarrService.getMovieByTmdbId(tmdbId)
    if (!radarrMovie?.movieFile?.path) {
      return res.json({ found: false })
    }

    const filePath = radarrMovie.movieFile.path

    // Find in Jellyfin by path
    const jellyfinItem = await jellyfinService.findMovieByPath(filePath)
    if (!jellyfinItem) {
      // Trigger library refresh and return not found
      await jellyfinService.refreshLibrary()
      return res.json({ found: false, message: 'Movie not in Jellyfin library yet' })
    }

    // Get playback info from Jellyfin
    const playbackInfo = await jellyfinService.getPlaybackInfo(jellyfinItem.Id)
    if (!playbackInfo) {
      return res.json({ found: false })
    }

    const mediaSource = playbackInfo.mediaSource

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

    // Extract subtitles
    const subtitles = mediaSource.MediaStreams
      .filter(s => s.Type === 'Subtitle')
      .map((s, idx) => ({
        id: idx,
        streamIndex: s.Index,
        language: s.Language || 'Unknown',
        languageCode: s.Language || 'und',
        displayTitle: s.DisplayTitle || `Subtitle ${idx + 1}`,
        format: s.Codec
      }))

    res.json({
      found: true,
      jellyfinItemId: jellyfinItem.Id,
      title: radarrMovie.title,
      type: 'movie',
      filePath,
      duration: Math.floor(mediaSource.RunTimeTicks / 10000), // Convert to ms
      streamUrl: playbackInfo.hlsUrl,
      directStreamUrl: playbackInfo.directUrl,
      playbackStrategy: mediaSource.SupportsDirectPlay ? 'direct' : 'transcode',
      audioTracks,
      subtitles,
      mediaInfo: {
        width: mediaSource.MediaStreams.find(s => s.Type === 'Video')?.Width || 1920,
        height: mediaSource.MediaStreams.find(s => s.Type === 'Video')?.Height || 1080,
        videoCodec: mediaSource.MediaStreams.find(s => s.Type === 'Video')?.Codec || 'h264',
        audioCodec: mediaSource.MediaStreams.find(s => s.Type === 'Audio')?.Codec || 'aac',
        container: mediaSource.Container
      }
    })
  } catch (error: any) {
    console.error('Error getting movie playback:', error.message)
    res.status(500).json({ error: 'Failed to get playback info' })
  }
})

// Similar update for episodes...
```

---

## Phase 3: Frontend Updates

### 3.1 Update VideoPlayer to Use Jellyfin Streams

The VideoPlayer component mostly stays the same since Jellyfin provides HLS streams. Key changes:

1. **Use HLS.js for all Jellyfin streams** (already implemented)
2. **Audio/subtitle switching via Jellyfin API** instead of reloading stream
3. **Quality switching** - Jellyfin handles this automatically based on bandwidth

### 3.2 Subtitle Handling

Jellyfin can either:
- **Burn-in subtitles** (SubtitleMethod: 'Encode') - Best for ASS/PGS
- **External VTT** (SubtitleMethod: 'External') - Best for SRT/VTT

Update VideoPlayer to fetch external subtitles from Jellyfin:

```typescript
// In VideoPlayer.vue
const loadJellyfinSubtitles = async () => {
  if (!props.jellyfinItemId) return

  // Fetch VTT from Jellyfin
  const vttUrl = `${JELLYFIN_URL}/Videos/${props.jellyfinItemId}/${mediaSourceId}/Subtitles/${subtitleIndex}/Stream.vtt?api_key=${API_KEY}`

  // Add to video track
  const track = document.createElement('track')
  track.kind = 'subtitles'
  track.src = vttUrl
  track.label = subtitle.displayTitle
  track.srclang = subtitle.languageCode
  videoRef.value.appendChild(track)
}
```

---

## Phase 4: Cleanup

### 4.1 Remove Custom FFmpeg Code

After Jellyfin integration is working, remove:
- `server/src/routes/media.ts` - Transcode endpoint
- `server/src/routes/media.ts` - HLS session management
- All FFmpeg spawn code

### 4.2 Simplify Docker Setup

Remove from my-cinema-backend:
- `/dev/dri:/dev/dri` device (Jellyfin handles this)
- `/tmp/hls-sessions` volume
- FFmpeg dependency in Dockerfile (if added)

---

## Benefits of This Approach

1. **Battle-tested transcoding** - Jellyfin handles all codec edge cases
2. **Hardware acceleration** - Built-in QuickSync support
3. **Audio sync** - No more manual FFmpeg tuning
4. **Subtitle burn-in** - Proper ASS/SSA/PGS support
5. **Adaptive streaming** - Automatic quality adjustment
6. **Tone mapping** - HDR to SDR conversion
7. **Maintained project** - Active community updates

## Potential Issues

1. **Library sync** - Jellyfin needs to scan files before they're playable
   - Solution: Trigger refresh after Radarr/Sonarr downloads

2. **Path mapping** - Jellyfin paths must match Radarr/Sonarr paths
   - Solution: Use same volume mounts

3. **API authentication** - Need to proxy or expose Jellyfin streams
   - Solution: Use API key in backend, don't expose to frontend

---

## Implementation Order

1. [ ] Add Jellyfin to Docker Compose
2. [ ] Configure Jellyfin (libraries, hardware transcoding, API key)
3. [ ] Create `jellyfinService.ts`
4. [ ] Update movie playback endpoint
5. [ ] Update episode playback endpoint
6. [ ] Test HLS streaming in VideoPlayer
7. [ ] Implement audio track switching
8. [ ] Implement subtitle loading
9. [ ] Remove old FFmpeg code
10. [ ] Test with various codecs (EAC3, DTS, HEVC, etc.)
