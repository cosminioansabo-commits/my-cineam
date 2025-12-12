import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FilterOptions, MediaType, SortOption, Genre } from '@/types'
import { STREAMING_PLATFORMS } from '@/types'
import { getAllGenres } from '@/services/tmdbService'

const currentYear = new Date().getFullYear()

const DEFAULT_FILTERS: FilterOptions = {
  mediaType: 'all',
  genres: [],
  platforms: [],
  yearRange: [1900, currentYear],
  ratingRange: [0, 10],
  sortBy: 'popularity.desc',
  animeOnly: false,
}

export const useFiltersStore = defineStore('filters', () => {
  // State
  const filters = ref<FilterOptions>({ ...DEFAULT_FILTERS })
  const movieGenres = ref<Genre[]>([])
  const tvGenres = ref<Genre[]>([])
  const genresLoaded = ref(false)

  // Getters
  const hasActiveFilters = computed(() => {
    return (
      filters.value.mediaType !== 'all' ||
      filters.value.genres.length > 0 ||
      filters.value.platforms.length > 0 ||
      filters.value.yearRange[0] !== 1900 ||
      filters.value.yearRange[1] !== currentYear ||
      filters.value.ratingRange[0] !== 0 ||
      filters.value.ratingRange[1] !== 10 ||
      filters.value.sortBy !== 'popularity.desc' ||
      filters.value.animeOnly
    )
  })

  const activeFilterCount = computed(() => {
    let count = 0
    if (filters.value.mediaType !== 'all') count++
    if (filters.value.genres.length > 0) count++
    if (filters.value.platforms.length > 0) count++
    if (filters.value.yearRange[0] !== 1900 || filters.value.yearRange[1] !== currentYear) count++
    if (filters.value.ratingRange[0] !== 0 || filters.value.ratingRange[1] !== 10) count++
    if (filters.value.sortBy !== 'popularity.desc') count++
    if (filters.value.animeOnly) count++
    return count
  })

  const availableGenres = computed(() => {
    if (filters.value.mediaType === 'movie') return movieGenres.value
    if (filters.value.mediaType === 'tv') return tvGenres.value
    // Combine and dedupe for 'all'
    const allGenres = [...movieGenres.value, ...tvGenres.value]
    const uniqueGenres = allGenres.filter(
      (genre, index, self) => index === self.findIndex(g => g.id === genre.id)
    )
    return uniqueGenres.sort((a, b) => a.name.localeCompare(b.name))
  })

  const streamingPlatforms = computed(() => STREAMING_PLATFORMS)

  const sortOptions = computed(() => [
    { value: 'popularity.desc', label: 'Most Popular' },
    { value: 'popularity.asc', label: 'Least Popular' },
    { value: 'vote_average.desc', label: 'Highest Rated' },
    { value: 'vote_average.asc', label: 'Lowest Rated' },
    { value: 'release_date.desc', label: 'Newest First' },
    { value: 'release_date.asc', label: 'Oldest First' },
    { value: 'title.asc', label: 'Title A-Z' },
    { value: 'title.desc', label: 'Title Z-A' },
  ])

  // Actions
  async function loadGenres() {
    if (genresLoaded.value) return

    try {
      const genres = await getAllGenres()
      movieGenres.value = genres.movie
      tvGenres.value = genres.tv
      genresLoaded.value = true
    } catch (error) {
      console.error('Failed to load genres:', error)
    }
  }

  function setMediaType(mediaType: MediaType | 'all') {
    filters.value.mediaType = mediaType
    // Clear genre selection if switching media type
    filters.value.genres = []
  }

  function toggleGenre(genreId: number) {
    const index = filters.value.genres.indexOf(genreId)
    if (index === -1) {
      filters.value.genres.push(genreId)
    } else {
      filters.value.genres.splice(index, 1)
    }
  }

  function setGenres(genreIds: number[]) {
    filters.value.genres = genreIds
  }

  function togglePlatform(platformId: number) {
    const index = filters.value.platforms.indexOf(platformId)
    if (index === -1) {
      filters.value.platforms.push(platformId)
    } else {
      filters.value.platforms.splice(index, 1)
    }
  }

  function setPlatforms(platformIds: number[]) {
    filters.value.platforms = platformIds
  }

  function setYearRange(range: [number, number]) {
    filters.value.yearRange = range
  }

  function setRatingRange(range: [number, number]) {
    filters.value.ratingRange = range
  }

  function setSortBy(sortBy: SortOption) {
    filters.value.sortBy = sortBy
  }

  function setAnimeOnly(value: boolean) {
    filters.value.animeOnly = value
  }

  function resetFilters() {
    filters.value = { ...DEFAULT_FILTERS }
  }

  function resetFilter(filterName: keyof FilterOptions) {
    switch (filterName) {
      case 'mediaType':
        filters.value.mediaType = 'all'
        break
      case 'genres':
        filters.value.genres = []
        break
      case 'platforms':
        filters.value.platforms = []
        break
      case 'yearRange':
        filters.value.yearRange = [1900, currentYear]
        break
      case 'ratingRange':
        filters.value.ratingRange = [0, 10]
        break
      case 'sortBy':
        filters.value.sortBy = 'popularity.desc'
        break
      case 'animeOnly':
        filters.value.animeOnly = false
        break
    }
  }

  return {
    // State
    filters,
    movieGenres,
    tvGenres,
    genresLoaded,
    // Getters
    hasActiveFilters,
    activeFilterCount,
    availableGenres,
    streamingPlatforms,
    sortOptions,
    // Actions
    loadGenres,
    setMediaType,
    toggleGenre,
    setGenres,
    togglePlatform,
    setPlatforms,
    setYearRange,
    setRatingRange,
    setSortBy,
    setAnimeOnly,
    resetFilters,
    resetFilter,
  }
})
