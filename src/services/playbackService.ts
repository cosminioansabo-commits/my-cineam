import axios from 'axios'
import { setupAuthInterceptor } from '@/composables/useAuthInterceptor'

const API_BASE = import.meta.env.VITE_TORRENT_API_URL || 'http://localhost:3001'
const TOKEN_KEY = 'my-cinema-auth-token'

const api = axios.create({
  baseURL: `${API_BASE}/api/playback`,
  timeout: 30000
})

// Setup auth interceptor
setupAuthInterceptor(api)

// Helper to get auth token for stream URLs (HLS.js doesn't use axios)
const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY)
}

export interface PlaybackStatus {
  enabled: boolean
  connected: boolean
}

export interface MediaInfo {
  width: number
  height: number
  videoCodec: string
  audioCodec: string
  container: string
}

export interface SubtitleTrack {
  id: number
  language: string
  languageCode: string
  displayTitle: string
}

export interface AudioTrack {
  id: number
  language: string
  languageCode: string
  displayTitle: string
  selected: boolean
}

export interface PlaybackInfo {
  found: boolean
  ratingKey?: string
  title?: string
  type?: 'movie' | 'episode'
  duration?: number
  viewOffset?: number
  streamUrl?: string
  directPlayUrl?: string
  mediaInfo?: MediaInfo
  subtitles?: SubtitleTrack[]
  audioTracks?: AudioTrack[]
}

export interface ContinueWatchingItem {
  ratingKey: string
  title: string
  fullTitle: string
  type: 'movie' | 'episode'
  thumb: string | null
  duration: number
  viewOffset: number
  progress: number
  streamUrl: string
}

export interface PlexLibrary {
  key: string
  title: string
  type: 'movie' | 'show'
  uuid: string
}

export interface PlexProfile {
  id: number
  uuid: string
  title: string
  email?: string
  thumb?: string
}

export const playbackService = {
  /**
   * Check if Plex is configured and connected
   */
  async getStatus(): Promise<PlaybackStatus> {
    try {
      const response = await api.get('/status')
      return response.data
    } catch (error) {
      console.error('Error checking playback status:', error)
      return { enabled: false, connected: false }
    }
  },

  /**
   * Get available Plex libraries
   */
  async getLibraries(): Promise<PlexLibrary[]> {
    try {
      const response = await api.get('/libraries')
      return response.data.libraries || []
    } catch (error) {
      console.error('Error fetching libraries:', error)
      return []
    }
  },

  /**
   * Get playback info for a movie by TMDB ID
   */
  async getMoviePlayback(tmdbId: number): Promise<PlaybackInfo | null> {
    try {
      const response = await api.get(`/movie/${tmdbId}`)

      if (!response.data.found) {
        return null
      }

      // Prepend API base URL to relative stream URLs and add auth token
      if (response.data.streamUrl && response.data.streamUrl.startsWith('/')) {
        const token = getAuthToken()
        const authParam = token ? `?token=${encodeURIComponent(token)}` : ''
        response.data.streamUrl = `${API_BASE}${response.data.streamUrl}${authParam}`
      }

      return response.data
    } catch (error) {
      console.error('Error fetching movie playback:', error)
      return null
    }
  },

  /**
   * Get playback info for a TV episode
   */
  async getEpisodePlayback(
    showTmdbId: number,
    season: number,
    episode: number
  ): Promise<PlaybackInfo | null> {
    try {
      const response = await api.get(`/episode/${showTmdbId}/${season}/${episode}`)

      if (!response.data.found) {
        return null
      }

      // Prepend API base URL to relative stream URLs and add auth token
      if (response.data.streamUrl && response.data.streamUrl.startsWith('/')) {
        const token = getAuthToken()
        const authParam = token ? `?token=${encodeURIComponent(token)}` : ''
        response.data.streamUrl = `${API_BASE}${response.data.streamUrl}${authParam}`
      }

      return response.data
    } catch (error) {
      console.error('Error fetching episode playback:', error)
      return null
    }
  },

  /**
   * Get stream URL by Plex rating key
   */
  async getStreamUrl(ratingKey: string): Promise<PlaybackInfo | null> {
    try {
      const response = await api.get(`/stream/${ratingKey}`)
      return response.data
    } catch (error) {
      console.error('Error fetching stream URL:', error)
      return null
    }
  },

  /**
   * Report playback progress to Plex
   */
  async reportProgress(
    ratingKey: string,
    timeMs: number,
    state: 'playing' | 'paused' | 'stopped',
    duration?: number
  ): Promise<void> {
    try {
      await api.post('/progress', {
        ratingKey,
        timeMs,
        state,
        duration
      })
    } catch (error) {
      console.error('Error reporting progress:', error)
    }
  },

  /**
   * Mark media as watched
   */
  async markAsWatched(ratingKey: string): Promise<void> {
    try {
      await api.post(`/watched/${ratingKey}`)
    } catch (error) {
      console.error('Error marking as watched:', error)
    }
  },

  /**
   * Mark media as unwatched
   */
  async markAsUnwatched(ratingKey: string): Promise<void> {
    try {
      await api.delete(`/watched/${ratingKey}`)
    } catch (error) {
      console.error('Error marking as unwatched:', error)
    }
  },

  /**
   * Get continue watching (on deck) items
   */
  async getContinueWatching(): Promise<ContinueWatchingItem[]> {
    try {
      const response = await api.get('/continue-watching')
      return response.data.items || []
    } catch (error) {
      console.error('Error fetching continue watching:', error)
      return []
    }
  },

  /**
   * Get available Plex profiles
   */
  async getProfiles(): Promise<PlexProfile[]> {
    try {
      const response = await api.get('/profiles')
      return response.data.profiles || []
    } catch (error) {
      console.error('Error fetching profiles:', error)
      return []
    }
  },

  /**
   * Invalidate Plex library cache
   */
  async refreshCache(): Promise<void> {
    try {
      await api.post('/refresh-cache')
    } catch (error) {
      console.error('Error refreshing cache:', error)
    }
  }
}
