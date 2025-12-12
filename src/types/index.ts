// Media Types
export type MediaType = 'movie' | 'tv'

export interface Media {
  id: number
  title: string
  originalTitle?: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  mediaType: MediaType
  releaseDate: string
  voteAverage: number
  voteCount: number
  genreIds: number[]
  popularity: number
  adult?: boolean
  originalLanguage?: string
}

export interface Video {
  id: string
  key: string // YouTube video key
  name: string
  site: string // YouTube, Vimeo, etc.
  type: string // Trailer, Teaser, Clip, etc.
  official: boolean
  publishedAt: string
}

export interface MediaDetails extends Media {
  genres: Genre[]
  runtime?: number // movies
  numberOfSeasons?: number // tv
  numberOfEpisodes?: number // tv
  status: string
  tagline?: string
  homepage?: string
  watchProviders?: WatchProviders
  credits?: Credits
  similar?: Media[]
  seasons?: Season[] // tv
  videos?: Video[]
}

// TV Season and Episode types
export interface Season {
  id: number
  seasonNumber: number
  name: string
  overview: string
  posterPath: string | null
  airDate: string | null
  episodeCount: number
}

export interface SeasonDetails extends Season {
  episodes: Episode[]
}

export interface Episode {
  id: number
  episodeNumber: number
  seasonNumber: number
  name: string
  overview: string
  airDate: string | null
  stillPath: string | null
  voteAverage: number
  runtime: number | null
}

export interface Genre {
  id: number
  name: string
}

export interface WatchProviders {
  results: {
    [countryCode: string]: CountryWatchProviders
  }
}

export interface CountryWatchProviders {
  link: string
  flatrate?: Provider[]
  rent?: Provider[]
  buy?: Provider[]
}

export interface Provider {
  logoPath: string
  providerId: number
  providerName: string
  displayPriority: number
}

export interface Credits {
  cast: CastMember[]
  crew: CrewMember[]
}

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
  order: number
}

export interface CrewMember {
  id: number
  name: string
  job: string
  department: string
  profilePath: string | null
}

// User Lists
export interface MediaList {
  id: string
  name: string
  description?: string
  icon: string
  color: string
  isDefault: boolean
  items: MediaListItem[]
  createdAt: string
  updatedAt: string
}

export interface MediaListItem {
  mediaId: number
  mediaType: MediaType
  addedAt: string
  watchedAt?: string
  rating?: number
  notes?: string
  // Cached media info for offline display
  title: string
  posterPath: string | null
  releaseDate: string
  voteAverage: number
}

// Filters
export interface FilterOptions {
  mediaType: MediaType | 'all'
  genres: number[]
  platforms: number[]
  yearRange: [number, number]
  ratingRange: [number, number]
  sortBy: SortOption
  animeOnly: boolean
}

export type SortOption =
  | 'popularity.desc'
  | 'popularity.asc'
  | 'vote_average.desc'
  | 'vote_average.asc'
  | 'release_date.desc'
  | 'release_date.asc'
  | 'title.asc'
  | 'title.desc'

// API Response Types
export interface TMDBResponse<T> {
  page: number
  results: T[]
  totalPages: number
  totalResults: number
}

export interface TMDBSearchResult {
  id: number
  title?: string // movies
  name?: string // tv shows
  original_title?: string
  original_name?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  media_type: 'movie' | 'tv' | 'person'
  release_date?: string // movies
  first_air_date?: string // tv shows
  vote_average: number
  vote_count: number
  genre_ids: number[]
  popularity: number
  adult?: boolean
  original_language?: string
}

// Streaming Platforms (common ones for filtering)
export const STREAMING_PLATFORMS = [
  { id: 8, name: 'Netflix', logo: '/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  { id: 337, name: 'Disney+', logo: '/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg' },
  { id: 9, name: 'Amazon Prime Video', logo: '/emthp39XA2YScoYL1p0sdbAH2WA.jpg' },
  { id: 1899, name: 'Max', logo: '/fksCUZ9QDWZMUwL2LgMtLckROUN.jpg' },
  { id: 350, name: 'Apple TV+', logo: '/6uhKBfmtzFqOcLousHwZuzcrScK.jpg' },
  { id: 531, name: 'Paramount+', logo: '/xbhHHa1YgtpwhC8lb1NQ3ACVcLd.jpg' },
  { id: 15, name: 'Hulu', logo: '/zxrVdFjIjLqkfnwyghnfywTn3Lh.jpg' },
  { id: 283, name: 'Crunchyroll', logo: '/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg' },
] as const

export type StreamingPlatform = typeof STREAMING_PLATFORMS[number]
