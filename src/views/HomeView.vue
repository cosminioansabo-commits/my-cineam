<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import type { Media } from '@/types'
import {
  getFeaturedContent,
  getTrending,
  getPopularMovies,
  getPopularTV,
  getTopRatedMovies,
  getTopRatedTV,
  getNowPlayingMovies,
  getBackdropUrl,
  findByExternalId,
  getMediaDetails,
} from '@/services/tmdbService'
import { libraryService, type RadarrMovie, type SonarrSeries } from '@/services/libraryService'
import { progressService, type ContinueWatchingItem } from '@/services/progressService'
import MediaCarousel from '@/components/media/MediaCarousel.vue'
import ContinueWatchingCarousel, { type ContinueWatchingItem as CarouselItem } from '@/components/media/ContinueWatchingCarousel.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'

// State
const featuredItem = ref<Media | null>(null)
const trendingAll = ref<Media[]>([])
const popularMovies = ref<Media[]>([])
const popularTV = ref<Media[]>([])
const topRatedMovies = ref<Media[]>([])
const topRatedTV = ref<Media[]>([])
const nowPlaying = ref<Media[]>([])
const libraryItems = ref<Media[]>([])
const continueWatchingItems = ref<CarouselItem[]>([])

const isLoadingHero = ref(true)
const isLoadingContent = ref(true)
const isLoadingContinueWatching = ref(false)

const authStore = useAuthStore()

// Computed
const heroBackdrop = computed(() => {
  if (!featuredItem.value?.backdropPath) return ''
  return getBackdropUrl(featuredItem.value.backdropPath, 'original')
})

const heroYear = computed(() => {
  if (!featuredItem.value?.releaseDate) return ''
  return new Date(featuredItem.value.releaseDate).getFullYear()
})

const heroRating = computed(() => {
  if (!featuredItem.value) return '0'
  return Math.round(featuredItem.value.voteAverage * 10)
})

// Fetch continue watching items and enrich with TMDB data
const loadContinueWatching = async () => {
  try {
    isLoadingContinueWatching.value = true
    const items = await progressService.getContinueWatching(10)

    // Enrich each item with TMDB data
    const enrichedItems: CarouselItem[] = await Promise.all(
      items.map(async (item) => {
        try {
          if (item.mediaType === 'movie') {
            const movieDetails = await getMediaDetails('movie', item.tmdbId)
            return {
              ...item,
              title: movieDetails?.title || 'Unknown Movie',
              posterPath: movieDetails?.posterPath || null,
            }
          } else {
            // For episodes, get the TV show details
            const showDetails = await getMediaDetails('tv', item.tmdbId)
            return {
              ...item,
              title: showDetails?.title || 'Unknown Show',
              posterPath: showDetails?.posterPath || null,
              episodeTitle: item.seasonNumber && item.episodeNumber
                ? `S${item.seasonNumber}:E${item.episodeNumber}`
                : undefined,
            }
          }
        } catch {
          return {
            ...item,
            title: 'Unknown',
            posterPath: null,
          }
        }
      })
    )

    continueWatchingItems.value = enrichedItems
  } catch (error) {
    console.error('Failed to load continue watching:', error)
    continueWatchingItems.value = []
  } finally {
    isLoadingContinueWatching.value = false
  }
}

// Fetch library items and convert to Media format
const loadLibraryItems = async () => {
  try {
    const [movies, series] = await Promise.all([
      libraryService.getRadarrMovies(),
      libraryService.getSonarrSeries(),
    ])

    // Convert Radarr movies to Media format
    const movieMedia = await Promise.all(
      movies.slice(0, 10).map(async (movie: RadarrMovie) => {
        const tmdb = await findByExternalId(movie.tmdbId, 'imdb_id').catch(() => null)
        return {
          id: movie.tmdbId,
          title: movie.title,
          posterPath: tmdb?.posterPath || movie.images?.find((i: { coverType: string }) => i.coverType === 'poster')?.remoteUrl || null,
          releaseDate: movie.year ? `${movie.year}-01-01` : '',
          voteAverage: movie.ratings?.tmdb?.value || 0,
          mediaType: 'movie' as const,
          overview: movie.overview || '',
          backdropPath: null,
          voteCount: 0,
          genreIds: [],
          popularity: 0,
        }
      })
    )

    // Convert Sonarr series to Media format
    const seriesMedia = await Promise.all(
      series.slice(0, 10).map(async (s: SonarrSeries) => {
        const tmdb = await findByExternalId(s.tvdbId, 'tvdb_id').catch(() => null)
        return {
          id: tmdb?.id || s.tvdbId,
          title: s.title,
          posterPath: tmdb?.posterPath || s.images?.find((i: { coverType: string }) => i.coverType === 'poster')?.remoteUrl || null,
          releaseDate: s.year ? `${s.year}-01-01` : '',
          voteAverage: s.ratings?.value || 0,
          mediaType: 'tv' as const,
          overview: s.overview || '',
          backdropPath: null,
          voteCount: 0,
          genreIds: [],
          popularity: 0,
        }
      })
    )

    libraryItems.value = [...movieMedia, ...seriesMedia].slice(0, 20)
  } catch (error) {
    console.error('Failed to load library items:', error)
  }
}

// Load data
onMounted(async () => {
  // Load hero content first
  try {
    featuredItem.value = await getFeaturedContent()
  } catch (error) {
    console.error('Failed to load featured content:', error)
  } finally {
    isLoadingHero.value = false
  }

  // Load continue watching and library items in background (only if authenticated)
  if (authStore.isAuthenticated) {
    loadContinueWatching()
    loadLibraryItems()
  }

  // Load all carousels in parallel
  try {
    const [
      trending,
      movies,
      tv,
      topMovies,
      topTV,
      playing,
    ] = await Promise.all([
      getTrending('all', 'week'),
      getPopularMovies(),
      getPopularTV(),
      getTopRatedMovies(),
      getTopRatedTV(),
      getNowPlayingMovies(),
    ])

    trendingAll.value = trending
    popularMovies.value = movies
    popularTV.value = tv
    topRatedMovies.value = topMovies
    topRatedTV.value = topTV
    nowPlaying.value = playing
  } catch (error) {
    console.error('Failed to load content:', error)
  } finally {
    isLoadingContent.value = false
  }
})
</script>

<template>
  <div class="-mx-3 sm:-mx-6 lg:-mx-10 -mt-4 sm:-mt-6">
    <!-- Hero Section -->
    <section class="relative h-[55vh] sm:h-[65vh] md:h-[70vh] min-h-[380px] sm:min-h-[450px] md:min-h-[500px] max-h-[800px] overflow-hidden">
      <!-- Background -->
      <div class="absolute inset-0">
        <template v-if="isLoadingHero">
          <div class="w-full h-full bg-[#141414]">
            <Skeleton width="100%" height="100%" />
          </div>
        </template>
        <template v-else-if="featuredItem">
          <img
            :src="heroBackdrop"
            :alt="featuredItem.title"
            class="w-full h-full object-cover object-top"
          />
          <!-- Gradients -->
          <div class="absolute inset-0 hero-gradient"></div>
          <div class="absolute inset-0 hero-gradient-bottom"></div>
        </template>
      </div>

      <!-- Content -->
      <div class="relative h-full flex items-center">
        <div class="w-full max-w-3xl px-3 sm:px-4 md:px-10 mt-14 sm:mt-20">
          <template v-if="isLoadingHero">
            <Skeleton width="60%" height="2rem" class="mb-3 sm:mb-4" />
            <Skeleton width="40%" height="1.25rem" class="mb-3 sm:mb-4" />
            <Skeleton width="100%" height="3rem" class="mb-4 sm:mb-6" />
            <div class="flex gap-2 sm:gap-3">
              <Skeleton width="100px" height="36px" class="sm:!w-[120px] sm:!h-12" />
              <Skeleton width="100px" height="36px" class="sm:!w-[140px] sm:!h-12" />
            </div>
          </template>

          <template v-else-if="featuredItem">
            <!-- Title -->
            <h1 class="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-shadow mb-2 sm:mb-4">
              {{ featuredItem.title }}
            </h1>

            <!-- Meta -->
            <div class="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4 text-xs sm:text-sm">
              <span class="text-green-500 font-bold">{{ heroRating }}% Match</span>
              <span class="text-gray-300">{{ heroYear }}</span>
              <span class="px-1 sm:px-1.5 border border-gray-500 text-gray-400 text-[10px] sm:text-xs">HD</span>
              <span class="px-1.5 sm:px-2 py-0.5 bg-[#e50914] text-white text-[10px] sm:text-xs font-medium rounded">
                {{ featuredItem.mediaType === 'movie' ? 'Movie' : 'Series' }}
              </span>
            </div>

            <!-- Overview -->
            <p class="text-sm sm:text-base md:text-lg text-gray-200 line-clamp-2 sm:line-clamp-3 mb-4 sm:mb-6 max-w-2xl text-shadow">
              {{ featuredItem.overview }}
            </p>

            <!-- Actions -->
            <div class="flex flex-wrap gap-2 sm:gap-3">
              <RouterLink :to="`/media/${featuredItem.mediaType}/${featuredItem.id}`">
                <Button
                  label="More Info"
                  icon="pi pi-info-circle"
                  class="!bg-white/30 !border-0 hover:!bg-white/20 !text-white font-semibold !text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                />
              </RouterLink>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- Carousels -->
    <div class="relative flex flex-col gap-10 z-10 -mt-16 sm:-mt-24 pb-8 sm:pb-12 px-2 sm:px-0">
      <!-- Continue Watching (if has items) -->
      <ContinueWatchingCarousel
        v-if="continueWatchingItems.length > 0 || isLoadingContinueWatching"
        title="Continue Watching"
        :items="continueWatchingItems"
        :loading="isLoadingContinueWatching"
        @refresh="loadContinueWatching"
      />

      <!-- My Library (if has items) -->
      <MediaCarousel
        v-if="libraryItems.length > 0"
        title="My Library"
        :items="libraryItems"
        see-all-link="/my-library"
      />

      <!-- Trending Now -->
      <MediaCarousel
        title="Trending Now"
        :items="trendingAll"
        :loading="isLoadingContent"
        see-all-link="/browse"
      />

      <!-- Popular Movies -->
      <MediaCarousel
        title="Popular Movies"
        :items="popularMovies"
        :loading="isLoadingContent"
        see-all-link="/browse?type=movie"
      />

      <!-- Popular TV Shows -->
      <MediaCarousel
        title="Popular TV Shows"
        :items="popularTV"
        :loading="isLoadingContent"
        see-all-link="/browse?type=tv"
      />

      <!-- Now Playing in Theaters -->
      <MediaCarousel
        title="Now Playing in Theaters"
        :items="nowPlaying"
        :loading="isLoadingContent"
      />

      <!-- Top Rated Movies -->
      <MediaCarousel
        title="Top Rated Movies"
        :items="topRatedMovies"
        :loading="isLoadingContent"
      />

      <!-- Top Rated TV Shows -->
      <MediaCarousel
        title="Top Rated TV Shows"
        :items="topRatedTV"
        :loading="isLoadingContent"
      />
    </div>
  </div>
</template>
