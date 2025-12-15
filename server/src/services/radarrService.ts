import axios, { AxiosInstance } from 'axios'
import { config } from '../config.js'

interface RadarrMovie {
  id: number
  title: string
  originalTitle: string
  sortTitle: string
  sizeOnDisk: number
  status: string
  overview: string
  inCinemas?: string
  physicalRelease?: string
  digitalRelease?: string
  images: { coverType: string; url: string }[]
  website?: string
  year: number
  hasFile: boolean
  youTubeTrailerId?: string
  studio?: string
  path: string
  qualityProfileId: number
  monitored: boolean
  minimumAvailability: string
  isAvailable: boolean
  folderName: string
  runtime: number
  cleanTitle: string
  imdbId?: string
  tmdbId: number
  titleSlug: string
  genres: string[]
  tags: number[]
  added: string
  ratings: { votes: number; value: number }
  movieFile?: {
    id: number
    relativePath: string
    path: string
    size: number
    dateAdded: string
    quality: { quality: { id: number; name: string } }
    mediaInfo?: {
      audioBitrate: number
      audioChannels: number
      audioCodec: string
      audioLanguages: string
      audioStreamCount: number
      videoBitDepth: number
      videoBitrate: number
      videoCodec: string
      videoDynamicRangeType: string
      videoFps: number
      resolution: string
      runTime: string
      scanType: string
      subtitles: string
    }
  }
}

interface RadarrRootFolder {
  id: number
  path: string
  accessible: boolean
  freeSpace: number
}

interface RadarrQualityProfile {
  id: number
  name: string
}

interface RadarrAddMovieOptions {
  tmdbId: number
  title: string
  year: number
  qualityProfileId?: number
  rootFolderPath?: string
  monitored?: boolean
  minimumAvailability?: 'announced' | 'inCinemas' | 'released' | 'preDB'
  searchForMovie?: boolean
}

class RadarrService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: config.radarr.url,
      timeout: 30000,
      headers: {
        'X-Api-Key': config.radarr.apiKey
      }
    })
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v3/system/status')
      console.log(`Radarr: Connected to version ${response.data.version}`)
      return true
    } catch (error) {
      console.error('Radarr: Connection test failed:', error)
      return false
    }
  }

  async getRootFolders(): Promise<RadarrRootFolder[]> {
    try {
      const response = await this.client.get('/api/v3/rootfolder')
      return response.data
    } catch (error) {
      console.error('Radarr: Error getting root folders:', error)
      return []
    }
  }

  async getQualityProfiles(): Promise<RadarrQualityProfile[]> {
    try {
      const response = await this.client.get('/api/v3/qualityprofile')
      return response.data
    } catch (error) {
      console.error('Radarr: Error getting quality profiles:', error)
      return []
    }
  }

  async getMovies(): Promise<RadarrMovie[]> {
    try {
      const response = await this.client.get('/api/v3/movie')
      return response.data
    } catch (error) {
      console.error('Radarr: Error getting movies:', error)
      return []
    }
  }

  async getMovie(id: number): Promise<RadarrMovie | null> {
    try {
      const response = await this.client.get(`/api/v3/movie/${id}`)
      return response.data
    } catch (error) {
      console.error('Radarr: Error getting movie:', error)
      return null
    }
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    try {
      const response = await this.client.get('/api/v3/movie', {
        params: { tmdbId }
      })
      const movies = response.data as RadarrMovie[]
      return movies.length > 0 ? movies[0] : null
    } catch (error) {
      console.error('Radarr: Error getting movie by TMDB ID:', error)
      return null
    }
  }

  async lookupMovie(tmdbId: number): Promise<RadarrMovie | null> {
    try {
      const response = await this.client.get('/api/v3/movie/lookup/tmdb', {
        params: { tmdbId }
      })
      return response.data
    } catch (error) {
      console.error('Radarr: Error looking up movie:', error)
      return null
    }
  }

  async addMovie(options: RadarrAddMovieOptions): Promise<RadarrMovie | null> {
    try {
      // First lookup the movie to get full details
      const lookupResult = await this.lookupMovie(options.tmdbId)
      if (!lookupResult) {
        console.error('Radarr: Movie not found in lookup')
        return null
      }

      // Get default root folder and quality profile if not specified
      let rootFolderPath = options.rootFolderPath
      let qualityProfileId = options.qualityProfileId

      if (!rootFolderPath) {
        const rootFolders = await this.getRootFolders()
        if (rootFolders.length > 0) {
          rootFolderPath = rootFolders[0].path
        } else {
          console.error('Radarr: No root folders configured')
          return null
        }
      }

      if (!qualityProfileId) {
        const profiles = await this.getQualityProfiles()
        if (profiles.length > 0) {
          qualityProfileId = profiles[0].id
        } else {
          console.error('Radarr: No quality profiles configured')
          return null
        }
      }

      const movieData = {
        ...lookupResult,
        rootFolderPath,
        qualityProfileId,
        monitored: options.monitored ?? true,
        minimumAvailability: options.minimumAvailability || 'released',
        addOptions: {
          searchForMovie: options.searchForMovie ?? false
        }
      }

      const response = await this.client.post('/api/v3/movie', movieData)
      console.log(`Radarr: Added movie "${options.title}" to library`)
      return response.data
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.[0]?.errorMessage?.includes('already been added')) {
        console.log(`Radarr: Movie "${options.title}" already in library`)
        return await this.getMovieByTmdbId(options.tmdbId)
      }
      console.error('Radarr: Error adding movie:', error.response?.data || error)
      return null
    }
  }

  async deleteMovie(id: number, deleteFiles: boolean = false): Promise<boolean> {
    try {
      await this.client.delete(`/api/v3/movie/${id}`, {
        params: { deleteFiles }
      })
      return true
    } catch (error) {
      console.error('Radarr: Error deleting movie:', error)
      return false
    }
  }

  async getCalendar(startDate?: Date, endDate?: Date): Promise<RadarrMovie[]> {
    try {
      const params: Record<string, string> = {}
      if (startDate) {
        params.start = startDate.toISOString()
      }
      if (endDate) {
        params.end = endDate.toISOString()
      }

      const response = await this.client.get('/api/v3/calendar', { params })
      return response.data
    } catch (error) {
      console.error('Radarr: Error getting calendar:', error)
      return []
    }
  }

  async getDownloadQueue(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/v3/queue')
      return response.data.records || []
    } catch (error) {
      console.error('Radarr: Error getting download queue:', error)
      return []
    }
  }

  async triggerRescan(movieId: number): Promise<boolean> {
    try {
      await this.client.post('/api/v3/command', {
        name: 'RescanMovie',
        movieId
      })
      return true
    } catch (error) {
      console.error('Radarr: Error triggering rescan:', error)
      return false
    }
  }

  async triggerSearch(movieId: number): Promise<boolean> {
    try {
      await this.client.post('/api/v3/command', {
        name: 'MoviesSearch',
        movieIds: [movieId]
      })
      return true
    } catch (error) {
      console.error('Radarr: Error triggering search:', error)
      return false
    }
  }

  isEnabled(): boolean {
    return config.radarr.enabled
  }
}

export const radarrService = new RadarrService()
