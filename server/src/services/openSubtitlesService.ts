import axios, { AxiosInstance } from 'axios'

const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1'

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

class OpenSubtitlesService {
  private client: AxiosInstance
  private apiKey: string
  private token: string | null = null
  private tokenExpiry: number = 0

  constructor() {
    this.apiKey = process.env.OPENSUBTITLES_API_KEY || ''

    this.client = axios.create({
      baseURL: OPENSUBTITLES_API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': this.apiKey,
        'User-Agent': 'my-cinema v1.0',
      },
    })
  }

  isEnabled(): boolean {
    return !!this.apiKey
  }

  isDownloadEnabled(): boolean {
    return !!this.apiKey && !!process.env.OPENSUBTITLES_USERNAME && !!process.env.OPENSUBTITLES_PASSWORD
  }

  /**
   * Login to get a token (required for downloads)
   */
  private async ensureLoggedIn(): Promise<boolean> {
    if (!this.apiKey) return false

    // Check if we have a valid token
    if (this.token && Date.now() < this.tokenExpiry) {
      return true
    }

    const username = process.env.OPENSUBTITLES_USERNAME
    const password = process.env.OPENSUBTITLES_PASSWORD

    if (!username || !password) {
      // Can still search without login, just can't download
      return false
    }

    try {
      const response = await this.client.post('/login', {
        username,
        password,
      })

      this.token = response.data.token
      // Token is valid for 24 hours, refresh after 23
      this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000
      console.log('OpenSubtitles: Logged in successfully')
      return true
    } catch (error: any) {
      console.error('OpenSubtitles login error:', error.response?.data || error.message)
      return false
    }
  }

  /**
   * Search for subtitles by IMDB ID or query
   */
  async searchSubtitles(params: {
    imdbId?: string
    tmdbId?: string
    query?: string
    language?: string
    type?: 'movie' | 'episode'
    seasonNumber?: number
    episodeNumber?: number
  }): Promise<SubtitleSearchResult[]> {
    if (!this.apiKey) {
      console.log('OpenSubtitles: API key not configured')
      return []
    }

    try {
      const searchParams: Record<string, any> = {
        languages: params.language || 'en',
      }

      if (params.imdbId) {
        // Remove 'tt' prefix if present and ensure proper format
        searchParams.imdb_id = params.imdbId.replace(/^tt/, '')
      } else if (params.tmdbId) {
        searchParams.tmdb_id = params.tmdbId
      } else if (params.query) {
        searchParams.query = params.query
      }

      if (params.type === 'episode') {
        searchParams.type = 'episode'
        if (params.seasonNumber) searchParams.season_number = params.seasonNumber
        if (params.episodeNumber) searchParams.episode_number = params.episodeNumber
      } else if (params.type === 'movie') {
        searchParams.type = 'movie'
      }

      console.log('OpenSubtitles: Searching with params:', searchParams)

      const response = await this.client.get('/subtitles', { params: searchParams })
      const results = response.data.data || []

      return results.map((item: any) => ({
        id: item.id,
        fileId: item.attributes?.files?.[0]?.file_id || 0,
        name: item.attributes?.release || item.attributes?.files?.[0]?.file_name || 'Unknown',
        format: item.attributes?.format || 'srt',
        language: item.attributes?.language || params.language || 'en',
        downloadCount: item.attributes?.download_count || 0,
        isHashMatch: item.attributes?.moviehash_match || false,
        providerName: 'OpenSubtitles',
        release: item.attributes?.release || '',
        url: item.attributes?.url || '',
      }))
    } catch (error: any) {
      console.error('OpenSubtitles search error:', error.response?.data || error.message)
      return []
    }
  }

  /**
   * Get download link for a subtitle file
   */
  async getDownloadLink(fileId: number): Promise<string | null> {
    if (!this.apiKey) {
      console.error('OpenSubtitles: API key not configured')
      return null
    }

    const loggedIn = await this.ensureLoggedIn()
    if (!loggedIn) {
      console.error('OpenSubtitles: Not logged in - username/password required for downloads')
      return null
    }

    try {
      console.log('OpenSubtitles: Requesting download link for file:', fileId)
      const response = await this.client.post(
        '/download',
        { file_id: fileId },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      )

      console.log('OpenSubtitles: Download link response:', response.data)
      return response.data.link || null
    } catch (error: any) {
      console.error('OpenSubtitles download link error:', error.response?.status, error.response?.data || error.message)
      return null
    }
  }

  /**
   * Download subtitle content
   */
  async downloadSubtitle(fileId: number): Promise<string | null> {
    const downloadLink = await this.getDownloadLink(fileId)
    if (!downloadLink) return null

    try {
      const response = await axios.get(downloadLink, {
        responseType: 'text',
      })
      return response.data
    } catch (error: any) {
      console.error('OpenSubtitles download error:', error.message)
      return null
    }
  }

  /**
   * Get available subtitle languages
   */
  getLanguages(): SubtitleLanguage[] {
    return [
      { code: 'ro', name: 'Romanian' },
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt-br', name: 'Portuguese (BR)' },
      { code: 'pt-pt', name: 'Portuguese (PT)' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'zh-cn', name: 'Chinese (Simplified)' },
      { code: 'zh-tw', name: 'Chinese (Traditional)' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
      { code: 'nl', name: 'Dutch' },
      { code: 'pl', name: 'Polish' },
      { code: 'tr', name: 'Turkish' },
      { code: 'sv', name: 'Swedish' },
      { code: 'da', name: 'Danish' },
      { code: 'fi', name: 'Finnish' },
      { code: 'no', name: 'Norwegian' },
      { code: 'cs', name: 'Czech' },
      { code: 'el', name: 'Greek' },
      { code: 'he', name: 'Hebrew' },
      { code: 'hu', name: 'Hungarian' },
      { code: 'id', name: 'Indonesian' },
      { code: 'th', name: 'Thai' },
      { code: 'uk', name: 'Ukrainian' },
      { code: 'vi', name: 'Vietnamese' },
      { code: 'bg', name: 'Bulgarian' },
      { code: 'hr', name: 'Croatian' },
      { code: 'sk', name: 'Slovak' },
      { code: 'sl', name: 'Slovenian' },
    ]
  }
}

export const openSubtitlesService = new OpenSubtitlesService()
