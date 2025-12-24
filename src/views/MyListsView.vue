<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { libraryService, type RadarrMovie, type SonarrSeries } from '@/services/libraryService'
import { findByExternalId, getImageUrl, getPosterPath } from '@/services/tmdbService'
import { useLanguage } from '@/composables/useLanguage'
import ProgressSpinner from 'primevue/progressspinner'

const router = useRouter()
const { t } = useLanguage()

// Library state
const libraryMovies = ref<RadarrMovie[]>([])
const librarySeries = ref<SonarrSeries[]>([])
const isLoadingLibrary = ref(true)
const libraryEnabled = ref({ radarr: false, sonarr: false })

const fetchLibrary = async () => {
  isLoadingLibrary.value = true
  try {
    const status = await libraryService.getStatus()
    libraryEnabled.value = {
      radarr: status.radarr.connected,
      sonarr: status.sonarr.connected
    }

    const [movies, series] = await Promise.all([
      status.radarr.connected ? libraryService.getMovies() : Promise.resolve([]),
      status.sonarr.connected ? libraryService.getSeries() : Promise.resolve([])
    ])

    libraryMovies.value = movies
    librarySeries.value = series

    // Fetch TMDB posters for library items
    fetchTmdbPosters()
  } catch (error) {
    console.error('Error fetching library:', error)
  } finally {
    isLoadingLibrary.value = false
  }
}

const totalLibraryItems = computed(() => libraryMovies.value.length + librarySeries.value.length)
const downloadedMovies = computed(() => libraryMovies.value.filter(m => m.hasFile).length)
const downloadedSeries = computed(() => librarySeries.value.filter(s => s.statistics && s.statistics.episodeFileCount > 0).length)

// Cache for TMDB poster paths
const movieTmdbPosters = ref<Map<number, string>>(new Map())
const seriesTmdbPosters = ref<Map<number, string>>(new Map())

// Fetch TMDB posters for all library items
const fetchTmdbPosters = async () => {
  // Fetch movie posters
  const moviePromises = libraryMovies.value.map(async (movie) => {
    try {
      const posterPath = await getPosterPath('movie', movie.tmdbId)
      if (posterPath) {
        movieTmdbPosters.value.set(movie.id, posterPath)
      }
    } catch (error) {
      // Silently fail - will show placeholder
    }
  })

  // Fetch series posters
  const seriesPromises = librarySeries.value.map(async (series) => {
    try {
      const result = await findByExternalId(series.tvdbId, 'tvdb_id')
      if (result?.posterPath) {
        seriesTmdbPosters.value.set(series.id, result.posterPath)
      }
    } catch (error) {
      // Silently fail - will show placeholder
    }
  })

  await Promise.all([...moviePromises, ...seriesPromises])
}

// Get poster for Radarr movie using cached TMDB data
const getMoviePoster = (movie: RadarrMovie) => {
  const posterPath = movieTmdbPosters.value.get(movie.id)
  if (posterPath) {
    return getImageUrl(posterPath, 'w300')
  }
  return ''
}

// Get poster for Sonarr series using cached TMDB data
const getSeriesPoster = (series: SonarrSeries) => {
  const posterPath = seriesTmdbPosters.value.get(series.id)
  if (posterPath) {
    return getImageUrl(posterPath, 'w300')
  }
  return ''
}

const goToMovie = (tmdbId: number) => {
  router.push(`/media/movie/${tmdbId}`)
}

const goToSeries = async (tvdbId: number) => {
  const result = await findByExternalId(tvdbId, 'tvdb_id')
  if (result) {
    router.push(`/media/tv/${result.id}`)
  } else {
    console.error('Could not find TMDB ID for TVDB:', tvdbId)
  }
}

onMounted(() => {
  fetchLibrary()
})
</script>

<template>
  <div class="max-w-7xl mx-auto py-6">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 mb-6 sm:mb-10">
      <div>
        <div class="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
          <div class="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <i class="pi pi-database text-lg sm:text-2xl text-white"></i>
          </div>
          <h1 class="text-2xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {{ t('library.title') }}
          </h1>
        </div>
        <p class="text-gray-400 text-sm sm:text-lg ml-0 sm:ml-[4.5rem]">{{ t('library.subtitle') }}</p>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="grid grid-cols-3 gap-2.5 sm:gap-4 mb-8 sm:mb-12 max-w-2xl">
      <div class="bg-zinc-900/60 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-zinc-800/50">
        <div class="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <i class="pi pi-database text-amber-500 text-xs sm:text-sm"></i>
          <span class="text-gray-400 text-[10px] sm:text-sm">{{ t('library.total') }}</span>
        </div>
        <p class="text-xl sm:text-3xl font-bold text-white">{{ totalLibraryItems }}</p>
      </div>
      <div class="bg-zinc-900/60 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-zinc-800/50">
        <div class="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <i class="pi pi-video text-blue-400 text-xs sm:text-sm"></i>
          <span class="text-gray-400 text-[10px] sm:text-sm">{{ t('library.movies') }}</span>
        </div>
        <p class="text-xl sm:text-3xl font-bold text-white">{{ downloadedMovies }}<span class="text-gray-500 text-sm">/{{ libraryMovies.length }}</span></p>
      </div>
      <div class="bg-zinc-900/60 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-zinc-800/50">
        <div class="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <i class="pi pi-desktop text-purple-400 text-xs sm:text-sm"></i>
          <span class="text-gray-400 text-[10px] sm:text-sm">{{ t('library.tvShows') }}</span>
        </div>
        <p class="text-xl sm:text-3xl font-bold text-white">{{ downloadedSeries }}<span class="text-gray-500 text-sm">/{{ librarySeries.length }}</span></p>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoadingLibrary" class="flex items-center justify-center py-16 sm:py-24">
      <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="4" />
    </div>

    <!-- Library content -->
    <template v-else-if="libraryEnabled.radarr || libraryEnabled.sonarr">
      <!-- Movies from Radarr -->
      <section v-if="libraryMovies.length > 0" class="mb-8 sm:mb-12">
        <div class="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div class="w-1 h-6 sm:h-8 bg-blue-500 rounded-full"></div>
          <h2 class="text-lg sm:text-2xl font-bold text-white">{{ t('library.movies') }}</h2>
          <span class="text-gray-500 text-xs sm:text-sm">({{ libraryMovies.length }})</span>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-4">
          <div
            v-for="movie in libraryMovies"
            :key="movie.id"
            class="group cursor-pointer"
            @click="goToMovie(movie.tmdbId)"
          >
            <div class="relative aspect-2/3 rounded-md sm:rounded-lg overflow-hidden bg-zinc-800 mb-1.5 sm:mb-2">
              <img
                v-if="getMoviePoster(movie)"
                :src="getMoviePoster(movie)"
                :alt="movie.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <i class="pi pi-video text-2xl sm:text-4xl text-gray-600"></i>
              </div>
              <!-- Downloaded indicator -->
              <div v-if="movie.hasFile" class="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-green-500 flex items-center justify-center">
                <i class="pi pi-check text-white text-[10px] sm:text-xs"></i>
              </div>
              <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <i class="pi pi-play text-white text-lg sm:text-2xl"></i>
              </div>
            </div>
            <p class="text-xs sm:text-sm text-white truncate">{{ movie.title }}</p>
            <p class="text-[10px] sm:text-xs text-gray-500">{{ movie.year }}</p>
          </div>
        </div>
      </section>

      <!-- TV Shows from Sonarr -->
      <section v-if="librarySeries.length > 0" class="mb-8 sm:mb-12">
        <div class="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div class="w-1 h-6 sm:h-8 bg-purple-500 rounded-full"></div>
          <h2 class="text-lg sm:text-2xl font-bold text-white">{{ t('library.tvShows') }}</h2>
          <span class="text-gray-500 text-xs sm:text-sm">({{ librarySeries.length }})</span>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-4">
          <div
            v-for="series in librarySeries"
            :key="series.id"
            class="group cursor-pointer"
            @click="goToSeries(series.tvdbId)"
          >
            <div class="relative aspect-2/3 rounded-md sm:rounded-lg overflow-hidden bg-zinc-800 mb-1.5 sm:mb-2">
              <img
                v-if="getSeriesPoster(series)"
                :src="getSeriesPoster(series)"
                :alt="series.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <i class="pi pi-desktop text-2xl sm:text-4xl text-gray-600"></i>
              </div>
              <!-- Progress indicator -->
              <div v-if="series.statistics" class="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                <div
                  class="h-full bg-green-500"
                  :style="{ width: `${series.statistics.percentOfEpisodes}%` }"
                ></div>
              </div>
              <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <i class="pi pi-play text-white text-lg sm:text-2xl"></i>
              </div>
            </div>
            <p class="text-xs sm:text-sm text-white truncate">{{ series.title }}</p>
            <p class="text-[10px] sm:text-xs text-gray-500">{{ series.year }} • {{ series.statistics?.seasonCount || 0 }} {{ t('library.seasons') }}</p>
          </div>
        </div>
      </section>

      <!-- Empty library state -->
      <div v-if="libraryMovies.length === 0 && librarySeries.length === 0" class="bg-zinc-900/40 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-zinc-800/50 p-6 sm:p-12 text-center">
        <div class="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-zinc-800/80 flex items-center justify-center mb-4 sm:mb-8 mx-auto">
          <i class="pi pi-database text-3xl sm:text-5xl text-gray-500"></i>
        </div>
        <h3 class="text-lg sm:text-2xl font-bold text-white mb-2 sm:mb-3">{{ t('library.empty') }}</h3>
        <p class="text-gray-400 max-w-md mx-auto text-sm sm:text-lg">
          {{ t('library.addContent') }}
        </p>
      </div>
    </template>

    <!-- Library not configured -->
    <div v-else class="bg-zinc-900/40 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-zinc-800/50 p-6 sm:p-12 text-center">
      <div class="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-zinc-800/80 flex items-center justify-center mb-4 sm:mb-8 mx-auto">
        <i class="pi pi-cog text-3xl sm:text-5xl text-gray-500"></i>
      </div>
      <h3 class="text-lg sm:text-2xl font-bold text-white mb-2 sm:mb-3">{{ t('library.notConfigured') }}</h3>
      <p class="text-gray-400 max-w-md mx-auto text-sm sm:text-lg">
        {{ t('library.connectServices') }}
      </p>
    </div>
  </div>
</template>
