<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useListsStore } from '@/stores/listsStore'
import { libraryService, type RadarrMovie, type SonarrSeries } from '@/services/libraryService'
import { findByExternalId, getImageUrl } from '@/services/tmdbService'
import ProgressSpinner from 'primevue/progressspinner'

const router = useRouter()
const listsStore = useListsStore()

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
  } catch (error) {
    console.error('Error fetching library:', error)
  } finally {
    isLoadingLibrary.value = false
  }
}

const totalLibraryItems = computed(() => libraryMovies.value.length + librarySeries.value.length)

const RADARR_URL = 'http://localhost:7878'
const SONARR_URL = 'http://localhost:8989'

const getRadarrPoster = (movie: RadarrMovie) => {
  const poster = movie.images.find(img => img.coverType === 'poster')
  if (!poster?.url) return ''
  if (poster.url.startsWith('/')) {
    return `${RADARR_URL}${poster.url}`
  }
  return poster.url
}

const getSonarrPoster = (series: SonarrSeries) => {
  const poster = series.images.find(img => img.coverType === 'poster')
  if (!poster?.url) return ''
  if (poster.url.startsWith('/')) {
    return `${SONARR_URL}${poster.url}`
  }
  return poster.url
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

const goToMedia = (mediaType: string, mediaId: number) => {
  router.push(`/media/${mediaType}/${mediaId}`)
}

// Get My List items
const myList = computed(() => listsStore.getListById('my-list'))
const myListItems = computed(() => myList.value?.items || [])

// Check if item is in library (downloaded)
const isInLibrary = (mediaId: number, mediaType: string) => {
  if (mediaType === 'movie') {
    return libraryMovies.value.some(m => m.tmdbId === mediaId && m.hasFile)
  } else {
    // For TV shows, check if any episodes are downloaded
    // We need to match by title since we don't have direct TMDB ID mapping
    return librarySeries.value.some(s => s.statistics && s.statistics.episodeFileCount > 0)
  }
}

// Remove item from My List
const removeFromList = (mediaId: number, mediaType: 'movie' | 'tv') => {
  listsStore.removeFromList('my-list', mediaId, mediaType)
}

onMounted(() => {
  fetchLibrary()
})
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 mb-6 sm:mb-10">
      <div>
        <div class="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
          <div class="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#e50914] to-[#b20710] flex items-center justify-center shadow-lg shadow-[#e50914]/20">
            <i class="pi pi-list text-lg sm:text-2xl text-white"></i>
          </div>
          <h1 class="text-2xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            My Lists
          </h1>
        </div>
        <p class="text-gray-400 text-sm sm:text-lg ml-0 sm:ml-[4.5rem]">Organize your favorite movies and TV shows</p>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="grid grid-cols-2 gap-2.5 sm:gap-4 mb-8 sm:mb-12 max-w-lg">
      <div class="bg-zinc-900/60 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-zinc-800/50">
        <div class="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <i class="pi pi-database text-amber-500 text-xs sm:text-sm"></i>
          <span class="text-gray-400 text-[10px] sm:text-sm">In Library</span>
        </div>
        <p class="text-xl sm:text-3xl font-bold text-white">{{ totalLibraryItems }}</p>
      </div>
      <div class="bg-zinc-900/60 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-zinc-800/50">
        <div class="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
          <i class="pi pi-bookmark text-[#e50914] text-xs sm:text-sm"></i>
          <span class="text-gray-400 text-[10px] sm:text-sm">My List</span>
        </div>
        <p class="text-xl sm:text-3xl font-bold text-white">{{ listsStore.getListById('my-list')?.items.length || 0 }}</p>
      </div>
    </div>

    <!-- Library Section -->
    <section v-if="libraryEnabled.radarr || libraryEnabled.sonarr" class="mb-8 sm:mb-12">
      <div class="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div class="w-1 h-6 sm:h-8 bg-amber-500 rounded-full"></div>
        <h2 class="text-lg sm:text-2xl font-bold text-white">My Library</h2>
        <span class="text-gray-500 text-xs sm:text-sm">(Radarr/Sonarr)</span>
      </div>

      <!-- Loading state -->
      <div v-if="isLoadingLibrary" class="flex items-center justify-center py-8 sm:py-12">
        <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
      </div>

      <!-- Library content -->
      <div v-else>
        <!-- Movies from Radarr -->
        <div v-if="libraryMovies.length > 0" class="mb-6 sm:mb-8">
          <h3 class="text-sm sm:text-lg font-semibold text-gray-300 mb-3 sm:mb-4 flex items-center gap-2">
            <i class="pi pi-video text-blue-400 text-xs sm:text-sm"></i>
            Movies ({{ libraryMovies.length }})
          </h3>
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-4">
            <div
              v-for="movie in libraryMovies"
              :key="movie.id"
              class="group cursor-pointer"
              @click="goToMovie(movie.tmdbId)"
            >
              <div class="relative aspect-[2/3] rounded-md sm:rounded-lg overflow-hidden bg-zinc-800 mb-1.5 sm:mb-2">
                <img
                  v-if="getRadarrPoster(movie)"
                  :src="getRadarrPoster(movie)"
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
        </div>

        <!-- TV Shows from Sonarr -->
        <div v-if="librarySeries.length > 0">
          <h3 class="text-sm sm:text-lg font-semibold text-gray-300 mb-3 sm:mb-4 flex items-center gap-2">
            <i class="pi pi-desktop text-purple-400 text-xs sm:text-sm"></i>
            TV Shows ({{ librarySeries.length }})
          </h3>
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-4">
            <div
              v-for="series in librarySeries"
              :key="series.id"
              class="group cursor-pointer"
              @click="goToSeries(series.tvdbId)"
            >
              <div class="relative aspect-[2/3] rounded-md sm:rounded-lg overflow-hidden bg-zinc-800 mb-1.5 sm:mb-2">
                <img
                  v-if="getSonarrPoster(series)"
                  :src="getSonarrPoster(series)"
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
              <p class="text-[10px] sm:text-xs text-gray-500">{{ series.year }} • {{ series.statistics?.seasonCount || 0 }} seasons</p>
            </div>
          </div>
        </div>

        <!-- Empty library state -->
        <div v-if="libraryMovies.length === 0 && librarySeries.length === 0" class="text-center py-6 sm:py-8">
          <i class="pi pi-database text-2xl sm:text-4xl text-gray-600 mb-3 sm:mb-4"></i>
          <p class="text-gray-400 text-xs sm:text-sm">Your library is empty. Add movies and TV shows from their detail pages.</p>
        </div>
      </div>
    </section>

    <!-- My List Section -->
    <section class="mb-8 sm:mb-12">
      <div class="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div class="w-1 h-6 sm:h-8 bg-[#e50914] rounded-full"></div>
        <h2 class="text-lg sm:text-2xl font-bold text-white">My List</h2>
        <span class="text-gray-500 text-xs sm:text-sm">({{ myListItems.length }} items)</span>
      </div>

      <!-- My List items -->
      <div v-if="myListItems.length > 0" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5 sm:gap-4">
        <div
          v-for="item in myListItems"
          :key="`${item.mediaType}-${item.mediaId}`"
          class="group cursor-pointer"
          @click="goToMedia(item.mediaType, item.mediaId)"
        >
          <div
            class="relative aspect-[2/3] rounded-md sm:rounded-lg overflow-hidden bg-zinc-800 mb-1.5 sm:mb-2 border-2 transition-all duration-200"
            :class="isInLibrary(item.mediaId, item.mediaType) ? 'border-amber-500' : 'border-transparent group-hover:border-zinc-600'"
          >
            <img
              v-if="item.posterPath"
              :src="getImageUrl(item.posterPath, 'w300')"
              :alt="item.title"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <i class="pi pi-video text-2xl sm:text-4xl text-gray-600"></i>
            </div>
            <!-- Downloaded/In Library indicator -->
            <div v-if="isInLibrary(item.mediaId, item.mediaType)" class="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500 flex items-center justify-center">
              <i class="pi pi-download text-white text-[10px] sm:text-xs"></i>
            </div>
            <!-- Media type badge -->
            <div class="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5">
              <span class="text-[8px] sm:text-[10px] font-medium text-gray-300 uppercase">{{ item.mediaType === 'movie' ? 'Movie' : 'TV' }}</span>
            </div>
            <!-- Hover overlay with remove button -->
            <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <i class="pi pi-play text-white text-lg sm:text-2xl"></i>
              <button
                class="text-[10px] sm:text-xs text-red-400 hover:text-red-300 transition-colors"
                @click.stop="removeFromList(item.mediaId, item.mediaType)"
              >
                <i class="pi pi-times mr-1"></i>Remove
              </button>
            </div>
          </div>
          <p class="text-xs sm:text-sm text-white truncate">{{ item.title }}</p>
          <p v-if="item.releaseDate" class="text-[10px] sm:text-xs text-gray-500">{{ new Date(item.releaseDate).getFullYear() }}</p>
        </div>
      </div>

      <!-- Empty My List state -->
      <div v-else class="bg-zinc-900/40 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-zinc-800/50 p-6 sm:p-12 text-center">
        <div class="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-zinc-800/80 flex items-center justify-center mb-4 sm:mb-8 mx-auto">
          <i class="pi pi-bookmark text-3xl sm:text-5xl text-gray-500"></i>
        </div>
        <h3 class="text-lg sm:text-2xl font-bold text-white mb-2 sm:mb-3">Your list is empty</h3>
        <p class="text-gray-400 max-w-md mx-auto text-sm sm:text-lg">
          Add movies and TV shows to your list from their detail pages
        </p>
      </div>
    </section>
  </div>
</template>
