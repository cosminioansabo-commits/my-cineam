import axios from 'axios'
import { setupAuthInterceptor } from '@/composables/useAuthInterceptor'

const API_BASE = import.meta.env.VITE_TORRENT_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: `${API_BASE}/api/subtitles`,
  timeout: 30000,
})

// Setup auth interceptor
setupAuthInterceptor(api)

export interface SubtitleSearchResult {
  id: string
  fileId: number
  name: string
  format: string
  language: string
  downloadCount: number
  isHashMatch: boolean
  providerName: string
  release: string
  url: string
}

export interface SubtitleLanguage {
  code: string
  name: string
}

export interface SubtitleStatus {
  enabled: boolean
  languages: SubtitleLanguage[]
}

export interface SubtitleSearchParams {
  imdbId?: string
  tmdbId?: string
  query?: string
  language?: string
  type?: 'movie' | 'episode'
  season?: number
  episode?: number
}

export const subtitleService = {
  /**
   * Check if subtitle search is available
   */
  async getStatus(): Promise<SubtitleStatus> {
    try {
      const response = await api.get('/status')
      return response.data
    } catch (error) {
      console.error('Error checking subtitle status:', error)
      return { enabled: false, languages: [] }
    }
  },

  /**
   * Get available subtitle languages
   */
  async getLanguages(): Promise<SubtitleLanguage[]> {
    try {
      const response = await api.get('/languages')
      return response.data.languages || []
    } catch (error) {
      console.error('Error getting subtitle languages:', error)
      return []
    }
  },

  /**
   * Search for subtitles by IMDB ID, TMDB ID, or query
   */
  async searchSubtitles(params: SubtitleSearchParams): Promise<SubtitleSearchResult[]> {
    try {
      const response = await api.get('/search', { params })
      return response.data.results || []
    } catch (error) {
      console.error('Error searching subtitles:', error)
      return []
    }
  },

  /**
   * Get download link for a subtitle file
   */
  async getDownloadLink(fileId: number): Promise<string | null> {
    try {
      const response = await api.post('/download-link', { fileId })
      return response.data.link || null
    } catch (error) {
      console.error('Error getting subtitle download link:', error)
      return null
    }
  },

  /**
   * Download subtitle content
   */
  async downloadSubtitle(fileId: number): Promise<string | null> {
    try {
      const response = await api.post('/download', { fileId })
      return response.data.content || null
    } catch (error) {
      console.error('Error downloading subtitle:', error)
      return null
    }
  },
}
