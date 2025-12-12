<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
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
  getBackdropUrl,
} from '@/services/tmdbService'
import { useListsStore } from '@/stores/listsStore'
import MediaCarousel from '@/components/media/MediaCarousel.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'

const listsStore = useListsStore()

// State
const featuredItem = ref<Media | null>(null)
const trendingAll = ref<Media[]>([])
const popularMovies = ref<Media[]>([])
const popularTV = ref<Media[]>([])
const topRatedMovies = ref<Media[]>([])
const topRatedTV = ref<Media[]>([])
const nowPlaying = ref<Media[]>([])
const upcoming = ref<Media[]>([])

const isLoadingHero = ref(true)
const isLoadingContent = ref(true)

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

const isInMyList = computed(() => {
  if (!featuredItem.value) return false
  return listsStore.isInList('my-list', featuredItem.value.id, featuredItem.value.mediaType)
})

const myListItems = computed(() => {
  const items = listsStore.getListById('my-list')?.items || []
  return items.map(item => ({
    id: item.mediaId,
    title: item.title,
    posterPath: item.posterPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
    mediaType: item.mediaType,
    overview: '',
    backdropPath: null,
    voteCount: 0,
    genreIds: [],
    popularity: 0,
  } as Media)).slice(0, 20)
})

// Actions
const toggleMyList = () => {
  if (!featuredItem.value) return

  if (isInMyList.value) {
    listsStore.removeFromList('my-list', featuredItem.value.id, featuredItem.value.mediaType)
  } else {
    listsStore.addToList('my-list', featuredItem.value)
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

  // Load all carousels in parallel
  try {
    const [
      trending,
      movies,
      tv,
      topMovies,
      topTV,
      playing,
      upcomingMovies,
    ] = await Promise.all([
      getTrending('all', 'week'),
      getPopularMovies(),
      getPopularTV(),
      getTopRatedMovies(),
      getTopRatedTV(),
      getNowPlayingMovies(),
      getUpcomingMovies(),
    ])

    trendingAll.value = trending
    popularMovies.value = movies
    popularTV.value = tv
    topRatedMovies.value = topMovies
    topRatedTV.value = topTV
    nowPlaying.value = playing
    upcoming.value = upcomingMovies
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
              <Button
                :label="isInMyList ? 'In My List' : 'My List'"
                :icon="isInMyList ? 'pi pi-check' : 'pi pi-plus'"
                severity="secondary"
                class="font-semibold !text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                @click="toggleMyList"
              />
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- Carousels -->
    <div class="relative z-10 -mt-16 sm:-mt-24 pb-8 sm:pb-12 space-y-1 sm:space-y-2">
      <!-- My List (if has items) -->
      <MediaCarousel
        v-if="myListItems.length > 0"
        title="My List"
        :items="myListItems"
        see-all-link="/list/my-list"
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

      <!-- Coming Soon -->
      <MediaCarousel
        title="Coming Soon"
        :items="upcoming"
        :loading="isLoadingContent"
      />
    </div>
  </div>
</template>
