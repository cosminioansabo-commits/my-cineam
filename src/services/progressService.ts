import axios from 'axios'
import { setupAuthInterceptor } from '@/composables/useAuthInterceptor'

const API_BASE = import.meta.env.VITE_TORRENT_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: `${API_BASE}/api/progress`,
  timeout: 30000
})

// Setup auth interceptor
setupAuthInterceptor(api)

export interface WatchProgress {
  id: number
  mediaType: 'movie' | 'episode'
  tmdbId: number
  seasonNumber: number | null
  episodeNumber: number | null
  positionMs: number
  durationMs: number
  completed: boolean
  updatedAt: string
}

export interface ContinueWatchingItem {
  id: number
  mediaType: 'movie' | 'episode'
  tmdbId: number
  seasonNumber: number | null
  episodeNumber: number | null
  positionMs: number
  durationMs: number
  progress: number
  updatedAt: string
}

export const progressService = {
  /**
   * Save watch progress for a movie or episode
   */
  async saveProgress(
    mediaType: 'movie' | 'episode',
    tmdbId: number,
    positionMs: number,
    durationMs: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<void> {
    try {
      await api.post('/', {
        mediaType,
        tmdbId,
        positionMs,
        durationMs,
        seasonNumber: seasonNumber ?? null,
        episodeNumber: episodeNumber ?? null
      })
    } catch (error) {
      console.error('Error saving progress:', error)
    }
  },

  /**
   * Get watch progress for a movie
   */
  async getMovieProgress(tmdbId: number): Promise<WatchProgress | null> {
    try {
      const response = await api.get(`/movie/${tmdbId}`)
      return response.data.progress || null
    } catch (error) {
      console.error('Error fetching movie progress:', error)
      return null
    }
  },

  /**
   * Get watch progress for an episode
   */
  async getEpisodeProgress(
    tmdbId: number,
    season: number,
    episode: number
  ): Promise<WatchProgress | null> {
    try {
      const response = await api.get(`/episode/${tmdbId}/${season}/${episode}`)
      return response.data.progress || null
    } catch (error) {
      console.error('Error fetching episode progress:', error)
      return null
    }
  },

  /**
   * Get continue watching items
   */
  async getContinueWatching(limit: number = 20): Promise<ContinueWatchingItem[]> {
    try {
      const response = await api.get('/continue-watching', { params: { limit } })
      return response.data.items || []
    } catch (error) {
      console.error('Error fetching continue watching:', error)
      return []
    }
  },

  /**
   * Get all watch progress for a TV show (all episodes)
   */
  async getShowProgress(tmdbId: number): Promise<WatchProgress[]> {
    try {
      const response = await api.get(`/show/${tmdbId}`)
      return response.data || []
    } catch (error) {
      console.error('Error fetching show progress:', error)
      return []
    }
  },

  /**
   * Mark media as fully watched
   */
  async markAsWatched(
    mediaType: 'movie' | 'episode',
    tmdbId: number,
    durationMs: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<void> {
    try {
      await api.post('/watched', {
        mediaType,
        tmdbId,
        durationMs,
        seasonNumber: seasonNumber ?? null,
        episodeNumber: episodeNumber ?? null
      })
    } catch (error) {
      console.error('Error marking as watched:', error)
    }
  },

  /**
   * Remove progress (mark as unwatched)
   */
  async removeProgress(
    mediaType: 'movie' | 'episode',
    tmdbId: number,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<void> {
    try {
      let url = `/${mediaType}/${tmdbId}`
      if (mediaType === 'episode' && seasonNumber !== undefined && episodeNumber !== undefined) {
        url += `/${seasonNumber}/${episodeNumber}`
      }
      await api.delete(url)
    } catch (error) {
      console.error('Error removing progress:', error)
    }
  }
}
