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
  getUpcomingMovies,
  getOnTheAirTV,
  getCriticallyAcclaimed,
  getHiddenGems,
  getNewReleases,
  getAnime,
  getActionAdventure,
  getSciFiFantasy,
  getCrimeThriller,
  getComedy,
  getHorror,
  getDocumentaries,
  getKoreanDramas,
  getBackdropUrl,
  findByExternalId,
  getMediaDetails,
} from '@/services/tmdbService'
import { libraryService, type RadarrMovie, type SonarrSeries } from '@/services/libraryService'
import { progressService } from '@/services/progressService'
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

// New Netflix-style categories
const upcomingMovies = ref<Media[]>([])
const onTheAirTV = ref<Media[]>([])
const criticallyAcclaimedMovies = ref<Media[]>([])
const hiddenGemsMovies = ref<Media[]>([])
const newReleasesMovies = ref<Media[]>([])
const animeTV = ref<Media[]>([])
const actionMovies = ref<Media[]>([])
const sciFiMovies = ref<Media[]>([])
const crimeTV = ref<Media[]>([])
const comedyMovies = ref<Media[]>([])
const horrorMovies = ref<Media[]>([])
const documentaries = ref<Media[]>([])
const kDramas = ref<Media[]>([])

const isLoadingHero = ref(true)
const isLoadingContent = ref(true)
const isLoadingMoreContent = ref(true)
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
      libraryService.getMovies(),
      libraryService.getSeries(),
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

  // Load primary carousels in parallel (most important ones first)
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

  // Load additional Netflix-style categories (secondary load)
  try {
    const [
      upcoming,
      onAir,
      acclaimed,
      hidden,
      newReleases,
      anime,
      action,
      sciFi,
      crime,
      comedy,
      horror,
      docs,
      korean,
    ] = await Promise.all([
      getUpcomingMovies(),
      getOnTheAirTV(),
      getCriticallyAcclaimed('movie'),
      getHiddenGems('movie'),
      getNewReleases('movie'),
      getAnime('tv'),
      getActionAdventure('movie'),
      getSciFiFantasy('movie'),
      getCrimeThriller('tv'),
      getComedy('movie'),
      getHorror('movie'),
      getDocumentaries('movie'),
      getKoreanDramas(),
    ])

    upcomingMovies.value = upcoming
    onTheAirTV.value = onAir
    criticallyAcclaimedMovies.value = acclaimed
    hiddenGemsMovies.value = hidden
    newReleasesMovies.value = newReleases
    animeTV.value = anime
    actionMovies.value = action
    sciFiMovies.value = sciFi
    crimeTV.value = crime
    comedyMovies.value = comedy
    horrorMovies.value = horror
    documentaries.value = docs
    kDramas.value = korean
  } catch (error) {
    console.error('Failed to load additional content:', error)
  } finally {
    isLoadingMoreContent.value = false
  }
})
</script>

<template>
    <!-- Hero Section -->
    <section class="relative h-[55vh] sm:h-[65vh] md:h-[70vh] min-h-[380px] sm:min-h-[450px] md:min-h-[500px] max-h-[800px] -mx-4 overflow-hidden">
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
        <div class="w-full h-full max-w-3xl justify-end flex flex-col px-4 pb-4 sm:pb-10">
          <template v-if="isLoadingHero">
            <Skeleton width="60%" height="2rem" class="mb-2 sm:mb-4" />
            <Skeleton width="40%" height="1.25rem" class="mb-4 sm:mb-4" />
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
    <div class="relative flex flex-col gap-4 sm:gap-10 z-10 pb-8 sm:pb-12">
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

      <!-- New Releases -->
      <MediaCarousel
        v-if="newReleasesMovies.length > 0 || isLoadingMoreContent"
        title="New Releases"
        :items="newReleasesMovies"
        :loading="isLoadingMoreContent"
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

      <!-- Critically Acclaimed -->
      <MediaCarousel
        v-if="criticallyAcclaimedMovies.length > 0 || isLoadingMoreContent"
        title="Critically Acclaimed"
        :items="criticallyAcclaimedMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Now Playing in Theaters -->
      <MediaCarousel
        title="Now Playing in Theaters"
        :items="nowPlaying"
        :loading="isLoadingContent"
      />

      <!-- Coming Soon -->
      <MediaCarousel
        v-if="upcomingMovies.length > 0 || isLoadingMoreContent"
        title="Coming Soon"
        :items="upcomingMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Currently Airing TV -->
      <MediaCarousel
        v-if="onTheAirTV.length > 0 || isLoadingMoreContent"
        title="Currently Airing TV Shows"
        :items="onTheAirTV"
        :loading="isLoadingMoreContent"
      />

      <!-- Action & Adventure -->
      <MediaCarousel
        v-if="actionMovies.length > 0 || isLoadingMoreContent"
        title="Action & Adventure"
        :items="actionMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Sci-Fi & Fantasy -->
      <MediaCarousel
        v-if="sciFiMovies.length > 0 || isLoadingMoreContent"
        title="Sci-Fi & Fantasy"
        :items="sciFiMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Crime & Thriller TV -->
      <MediaCarousel
        v-if="crimeTV.length > 0 || isLoadingMoreContent"
        title="Crime & Thriller Series"
        :items="crimeTV"
        :loading="isLoadingMoreContent"
      />

      <!-- Comedy -->
      <MediaCarousel
        v-if="comedyMovies.length > 0 || isLoadingMoreContent"
        title="Comedy"
        :items="comedyMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Horror -->
      <MediaCarousel
        v-if="horrorMovies.length > 0 || isLoadingMoreContent"
        title="Horror"
        :items="horrorMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Anime -->
      <MediaCarousel
        v-if="animeTV.length > 0 || isLoadingMoreContent"
        title="Anime"
        :items="animeTV"
        :loading="isLoadingMoreContent"
      />

      <!-- K-Dramas -->
      <MediaCarousel
        v-if="kDramas.length > 0 || isLoadingMoreContent"
        title="K-Dramas"
        :items="kDramas"
        :loading="isLoadingMoreContent"
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

      <!-- Hidden Gems -->
      <MediaCarousel
        v-if="hiddenGemsMovies.length > 0 || isLoadingMoreContent"
        title="Hidden Gems"
        :items="hiddenGemsMovies"
        :loading="isLoadingMoreContent"
      />

      <!-- Documentaries -->
      <MediaCarousel
        v-if="documentaries.length > 0 || isLoadingMoreContent"
        title="Documentaries"
        :items="documentaries"
        :loading="isLoadingMoreContent"
      />
    </div>
</template>
