import axios from 'axios'
import type {
  Media,
  MediaDetails,
  MediaType,
  Genre,
  TMDBResponse,
  TMDBSearchResult,
  WatchProviders,
  Credits,
  FilterOptions,
  Season,
  SeasonDetails,
  Episode,
} from '@/types'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

const api = axios.create({
  baseURL: TMDB_BASE_URL,
  params: {
    api_key: import.meta.env.VITE_TMDB_API_KEY,
  },
})

// Image URL helpers
export const getImageUrl = (path: string | null, size: 'w200' | 'w300' | 'w500' | 'w780' | 'original' = 'w500'): string => {
  if (!path) return '/placeholder-poster.svg'
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export const getBackdropUrl = (path: string | null, size: 'w780' | 'w1280' | 'original' = 'w1280'): string => {
  if (!path) return ''
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

// Get just the poster path for a movie or TV show (lightweight fetch)
export async function getPosterPath(mediaType: MediaType, id: number): Promise<string | null> {
  try {
    const response = await api.get(`/${mediaType}/${id}`)
    return response.data.poster_path || null
  } catch {
    return null
  }
}

// Transform TMDB response to our Media type
const transformToMedia = (item: TMDBSearchResult): Media | null => {
  if (item.media_type === 'person') return null

  return {
    id: item.id,
    title: item.title || item.name || '',
    originalTitle: item.original_title || item.original_name,
    overview: item.overview,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    mediaType: item.media_type as MediaType,
    releaseDate: item.release_date || item.first_air_date || '',
    voteAverage: item.vote_average,
    voteCount: item.vote_count,
    genreIds: item.genre_ids || [],
    popularity: item.popularity,
    adult: item.adult,
    originalLanguage: item.original_language,
  }
}

// API Functions
export async function getTrending(mediaType: MediaType | 'all' = 'all', timeWindow: 'day' | 'week' = 'week'): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>(`/trending/${mediaType}/${timeWindow}`)
  return data.results
    .map(item => transformToMedia({ ...item, media_type: item.media_type || mediaType as 'movie' | 'tv' }))
    .filter((item): item is Media => item !== null)
}

// Get popular movies
export async function getPopularMovies(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/movie/popular', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'movie' }))
    .filter((item): item is Media => item !== null)
}

// Get popular TV shows
export async function getPopularTV(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/tv/popular', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'tv' }))
    .filter((item): item is Media => item !== null)
}

// Get top rated movies
export async function getTopRatedMovies(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/movie/top_rated', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'movie' }))
    .filter((item): item is Media => item !== null)
}

// Get top rated TV shows
export async function getTopRatedTV(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/tv/top_rated', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'tv' }))
    .filter((item): item is Media => item !== null)
}

// Get now playing movies (in theaters)
export async function getNowPlayingMovies(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/movie/now_playing', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'movie' }))
    .filter((item): item is Media => item !== null)
}

// Get upcoming movies
export async function getUpcomingMovies(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/movie/upcoming', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'movie' }))
    .filter((item): item is Media => item !== null)
}

// Get TV shows airing today
export async function getAiringTodayTV(page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/tv/airing_today', {
    params: { page },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'tv' }))
    .filter((item): item is Media => item !== null)
}

// Get movies by genre
export async function getMoviesByGenre(genreId: number, page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/discover/movie', {
    params: {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
      'vote_count.gte': 100,
    },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'movie' }))
    .filter((item): item is Media => item !== null)
}

// Get TV shows by genre
export async function getTVByGenre(genreId: number, page = 1): Promise<Media[]> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/discover/tv', {
    params: {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page,
      'vote_count.gte': 100,
    },
  })
  return data.results
    .map(item => transformToMedia({ ...item, media_type: 'tv' }))
    .filter((item): item is Media => item !== null)
}

export async function searchMulti(query: string, page = 1): Promise<{ results: Media[]; totalPages: number; totalResults: number }> {
  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>('/search/multi', {
    params: { query, page, include_adult: false },
  })

  return {
    results: data.results
      .map(transformToMedia)
      .filter((item): item is Media => item !== null),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  }
}

export async function discoverMedia(
  mediaType: MediaType,
  filters: Partial<FilterOptions>,
  page = 1
): Promise<{ results: Media[]; totalPages: number; totalResults: number }> {
  const params: Record<string, string | number | boolean> = {
    page,
    include_adult: false,
  }

  if (filters.genres && filters.genres.length > 0) {
    params.with_genres = filters.genres.join(',')
  }

  if (filters.platforms && filters.platforms.length > 0) {
    params.with_watch_providers = filters.platforms.join('|')
    params.watch_region = 'US'
  }

  if (filters.yearRange) {
    const [minYear, maxYear] = filters.yearRange
    if (mediaType === 'movie') {
      params['primary_release_date.gte'] = `${minYear}-01-01`
      params['primary_release_date.lte'] = `${maxYear}-12-31`
    } else {
      params['first_air_date.gte'] = `${minYear}-01-01`
      params['first_air_date.lte'] = `${maxYear}-12-31`
    }
  }

  if (filters.ratingRange) {
    const [minRating, maxRating] = filters.ratingRange
    params['vote_average.gte'] = minRating
    params['vote_average.lte'] = maxRating
    params['vote_count.gte'] = 50 // Minimum votes to avoid obscure titles
  }

  if (filters.sortBy) {
    params.sort_by = filters.sortBy
  }

  // Anime filter: Japanese origin + Animation genre (16)
  if (filters.animeOnly) {
    params.with_origin_country = 'JP'
    // Add Animation genre (16) to existing genres or set it
    const animationGenreId = 16
    if (filters.genres && filters.genres.length > 0) {
      // Combine with existing genres using AND logic
      params.with_genres = [...filters.genres, animationGenreId].join(',')
    } else {
      params.with_genres = animationGenreId
    }
  }

  const { data } = await api.get<TMDBResponse<TMDBSearchResult>>(`/discover/${mediaType}`, { params })

  return {
    results: data.results.map(item => transformToMedia({ ...item, media_type: mediaType })).filter((item): item is Media => item !== null),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  }
}

// Enhanced recommendations: combine similar + recommendations endpoints
export async function getEnhancedRecommendations(
  mediaType: MediaType,
  id: number,
  genreIds: number[] = []
): Promise<{ similar: Media[]; recommendations: Media[]; becauseYouLiked: Media[] }> {
  // Fetch both similar and recommendations in parallel
  const [similarResponse, recommendationsResponse] = await Promise.all([
    api.get<TMDBResponse<TMDBSearchResult>>(`/${mediaType}/${id}/similar`),
    api.get<TMDBResponse<TMDBSearchResult>>(`/${mediaType}/${id}/recommendations`),
  ])

  const similar = similarResponse.data.results
    .slice(0, 20)
    .map(item => transformToMedia({ ...item, media_type: mediaType }))
    .filter((item): item is Media => item !== null)

  const recommendations = recommendationsResponse.data.results
    .slice(0, 20)
    .map(item => transformToMedia({ ...item, media_type: mediaType }))
    .filter((item): item is Media => item !== null)

  // Get "Because you liked" - titles from same genres with high ratings
  let becauseYouLiked: Media[] = []
  if (genreIds.length > 0) {
    const primaryGenre = genreIds[0]
    const { data } = await api.get<TMDBResponse<TMDBSearchResult>>(`/discover/${mediaType}`, {
      params: {
        with_genres: primaryGenre,
        sort_by: 'vote_average.desc',
        'vote_count.gte': 500, // Only well-reviewed titles
        'vote_average.gte': 7.5,
        page: 1,
      },
    })

    becauseYouLiked = data.results
      .filter(item => item.id !== id) // Exclude current title
      .slice(0, 20)
      .map(item => transformToMedia({ ...item, media_type: mediaType }))
      .filter((item): item is Media => item !== null)
  }

  return { similar, recommendations, becauseYouLiked }
}

export async function getMediaDetails(mediaType: MediaType, id: number): Promise<MediaDetails> {
  const [detailsResponse, watchProvidersResponse, creditsResponse, videosResponse] = await Promise.all([
    api.get(`/${mediaType}/${id}`),
    api.get<WatchProviders>(`/${mediaType}/${id}/watch/providers`),
    api.get<Credits>(`/${mediaType}/${id}/credits`),
    api.get(`/${mediaType}/${id}/videos`),
  ])

  const details = detailsResponse.data
  const genreIds = details.genres?.map((g: Genre) => g.id) || []

  // Get enhanced recommendations
  const { similar, recommendations } = await getEnhancedRecommendations(mediaType, id, genreIds)

  // Combine and deduplicate recommendations
  const combinedRecommendations = [...recommendations, ...similar]
  const uniqueRecommendations = combinedRecommendations.filter(
    (item, index, self) => index === self.findIndex(t => t.id === item.id)
  )

  // Sort by a combination of rating and popularity
  const sortedRecommendations = uniqueRecommendations
    .sort((a, b) => {
      const scoreA = a.voteAverage * 0.6 + Math.min(a.popularity / 100, 4) * 0.4
      const scoreB = b.voteAverage * 0.6 + Math.min(b.popularity / 100, 4) * 0.4
      return scoreB - scoreA
    })
    .slice(0, 20)

  // Transform cast data to use camelCase for profilePath
  const transformedCast = creditsResponse.data.cast?.slice(0, 10).map((member: {
    id: number
    name: string
    character: string
    profile_path: string | null
    order: number
  }) => ({
    id: member.id,
    name: member.name,
    character: member.character,
    profilePath: member.profile_path,
    order: member.order,
  })) || []

  const transformedCrew = creditsResponse.data.crew?.filter((c: { job: string }) =>
    ['Director', 'Creator', 'Executive Producer'].includes(c.job)
  ).slice(0, 5).map((member: {
    id: number
    name: string
    job: string
    department: string
    profile_path: string | null
  }) => ({
    id: member.id,
    name: member.name,
    job: member.job,
    department: member.department,
    profilePath: member.profile_path,
  })) || []

  // Transform seasons for TV shows
  const seasons = mediaType === 'tv' && details.seasons
    ? transformSeasons(details.seasons)
    : undefined

  // Transform videos (prioritize trailers from YouTube)
  const transformedVideos = (videosResponse.data.results || [])
    .filter((v: { site: string }) => v.site === 'YouTube')
    .map((v: {
      id: string
      key: string
      name: string
      site: string
      type: string
      official: boolean
      published_at: string
    }) => ({
      id: v.id,
      key: v.key,
      name: v.name,
      site: v.site,
      type: v.type,
      official: v.official,
      publishedAt: v.published_at,
    }))
    .sort((a: { type: string; official: boolean }, b: { type: string; official: boolean }) => {
      // Prioritize: Official Trailers > Trailers > Teasers > Others
      const priority = (v: { type: string; official: boolean }) => {
        if (v.type === 'Trailer' && v.official) return 0
        if (v.type === 'Trailer') return 1
        if (v.type === 'Teaser' && v.official) return 2
        if (v.type === 'Teaser') return 3
        return 4
      }
      return priority(a) - priority(b)
    })

  return {
    id: details.id,
    title: details.title || details.name,
    originalTitle: details.original_title || details.original_name,
    overview: details.overview,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    mediaType,
    releaseDate: details.release_date || details.first_air_date || '',
    voteAverage: details.vote_average,
    voteCount: details.vote_count,
    genreIds,
    popularity: details.popularity,
    genres: details.genres || [],
    runtime: details.runtime,
    numberOfSeasons: details.number_of_seasons,
    numberOfEpisodes: details.number_of_episodes,
    status: details.status,
    tagline: details.tagline,
    homepage: details.homepage,
    watchProviders: watchProvidersResponse.data,
    credits: {
      cast: transformedCast,
      crew: transformedCrew,
    },
    similar: sortedRecommendations,
    seasons,
    videos: transformedVideos,
  }
}

export async function getGenres(mediaType: MediaType): Promise<Genre[]> {
  const { data } = await api.get<{ genres: Genre[] }>(`/genre/${mediaType}/list`)
  return data.genres
}

export async function getAllGenres(): Promise<{ movie: Genre[]; tv: Genre[] }> {
  const [movieGenres, tvGenres] = await Promise.all([
    getGenres('movie'),
    getGenres('tv'),
  ])
  return { movie: movieGenres, tv: tvGenres }
}

// Get a featured/hero item with backdrop
export async function getFeaturedContent(): Promise<Media | null> {
  const trending = await getTrending('all', 'day')
  // Find one with a good backdrop
  const withBackdrop = trending.filter(item => item.backdropPath && item.voteAverage >= 7)
  if (withBackdrop.length === 0) return trending[0] || null
  // Return a random one from top 5
  const randomIndex = Math.floor(Math.random() * Math.min(5, withBackdrop.length))
  return withBackdrop[randomIndex]
}

// Find TMDB ID by external ID (TVDB or IMDB)
export async function findByExternalId(externalId: string | number, source: 'imdb_id' | 'tvdb_id'): Promise<{ id: number; mediaType: MediaType; posterPath?: string | null } | null> {
  try {
    const { data } = await api.get(`/find/${externalId}`, {
      params: { external_source: source }
    })

    // Check TV results first (for TVDB)
    if (data.tv_results && data.tv_results.length > 0) {
      const result = data.tv_results[0]
      return { id: result.id, mediaType: 'tv', posterPath: result.poster_path }
    }

    // Check movie results
    if (data.movie_results && data.movie_results.length > 0) {
      const result = data.movie_results[0]
      return { id: result.id, mediaType: 'movie', posterPath: result.poster_path }
    }

    return null
  } catch (error) {
    console.error('Error finding by external ID:', error)
    return null
  }
}

// Find TMDB data by external ID with poster path (for calendar)
export async function findTVByExternalId(externalId: string | number, source: 'imdb_id' | 'tvdb_id'): Promise<{ id: number; posterPath: string | null } | null> {
  try {
    const { data } = await api.get(`/find/${externalId}`, {
      params: { external_source: source }
    })

    // Check TV results first (for TVDB)
    if (data.tv_results && data.tv_results.length > 0) {
      return {
        id: data.tv_results[0].id,
        posterPath: data.tv_results[0].poster_path || null
      }
    }

    return null
  } catch (error) {
    console.error('Error finding TV by external ID:', error)
    return null
  }
}

// Get TV show season details with episodes
export async function getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<SeasonDetails | null> {
  try {
    const { data } = await api.get(`/tv/${tvId}/season/${seasonNumber}`)

    return {
      id: data.id,
      seasonNumber: data.season_number,
      name: data.name,
      overview: data.overview || '',
      posterPath: data.poster_path,
      airDate: data.air_date || null,
      episodeCount: data.episodes?.length || 0,
      episodes: (data.episodes || []).map((ep: {
        id: number
        episode_number: number
        season_number: number
        name: string
        overview: string
        air_date: string | null
        still_path: string | null
        vote_average: number
        runtime: number | null
      }): Episode => ({
        id: ep.id,
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number,
        name: ep.name,
        overview: ep.overview || '',
        airDate: ep.air_date,
        stillPath: ep.still_path,
        voteAverage: ep.vote_average,
        runtime: ep.runtime,
      })),
    }
  } catch (error) {
    console.error('Error fetching season details:', error)
    return null
  }
}

// Transform seasons from TV show details
export function transformSeasons(seasons: {
  id: number
  season_number: number
  name: string
  overview: string
  poster_path: string | null
  air_date: string | null
  episode_count: number
}[]): Season[] {
  return seasons
    .filter(s => s.season_number > 0) // Exclude specials (season 0)
    .map(s => ({
      id: s.id,
      seasonNumber: s.season_number,
      name: s.name,
      overview: s.overview || '',
      posterPath: s.poster_path,
      airDate: s.air_date,
      episodeCount: s.episode_count,
    }))
}

// Person/Actor types
export interface PersonDetails {
  id: number
  name: string
  biography: string
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  profilePath: string | null
  knownForDepartment: string
  alsoKnownAs: string[]
  popularity: number
}

export interface PersonCredit {
  id: number
  title: string
  character?: string
  job?: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string
  mediaType: MediaType
  voteAverage: number
}

export interface PersonCombinedCredits {
  cast: PersonCredit[]
  crew: PersonCredit[]
}

// Get person details
export async function getPersonDetails(personId: number): Promise<PersonDetails | null> {
  try {
    const { data } = await api.get(`/person/${personId}`)

    return {
      id: data.id,
      name: data.name,
      biography: data.biography || '',
      birthday: data.birthday,
      deathday: data.deathday,
      placeOfBirth: data.place_of_birth,
      profilePath: data.profile_path,
      knownForDepartment: data.known_for_department || 'Acting',
      alsoKnownAs: data.also_known_as || [],
      popularity: data.popularity,
    }
  } catch (error) {
    console.error('Error fetching person details:', error)
    return null
  }
}

// Get person combined credits (movies and TV shows)
export async function getPersonCredits(personId: number): Promise<PersonCombinedCredits | null> {
  try {
    const { data } = await api.get(`/person/${personId}/combined_credits`)

    const mapCredit = (item: {
      id: number
      title?: string
      name?: string
      character?: string
      job?: string
      poster_path: string | null
      backdrop_path: string | null
      release_date?: string
      first_air_date?: string
      media_type: string
      vote_average: number
    }): PersonCredit => ({
      id: item.id,
      title: item.title || item.name || '',
      character: item.character,
      job: item.job,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      releaseDate: item.release_date || item.first_air_date || '',
      mediaType: item.media_type as MediaType,
      voteAverage: item.vote_average,
    })

    // Sort by release date (newest first) and filter out items without posters
    const sortByDate = (a: PersonCredit, b: PersonCredit) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      return dateB - dateA
    }

    return {
      cast: (data.cast || []).map(mapCredit).sort(sortByDate),
      crew: (data.crew || []).map(mapCredit).sort(sortByDate),
    }
  } catch (error) {
    console.error('Error fetching person credits:', error)
    return null
  }
}
