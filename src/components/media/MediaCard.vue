<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Media } from '@/types'
import { getImageUrl } from '@/services/tmdbService'
import { useListsStore } from '@/stores/listsStore'
import { useFiltersStore } from '@/stores/filtersStore'

const props = withDefaults(defineProps<{
  media: Media
  showAddButton?: boolean
  variant?: 'default' | 'compact' | 'wide'
}>(), {
  showAddButton: true,
  variant: 'default',
})

const listsStore = useListsStore()
const filtersStore = useFiltersStore()
const imageLoaded = ref(false)

const posterUrl = computed(() => getImageUrl(props.media.posterPath, 'w300'))

const year = computed(() => {
  if (!props.media.releaseDate) return ''
  return new Date(props.media.releaseDate).getFullYear()
})

const rating = computed(() => {
  return props.media.voteAverage.toFixed(1)
})

const ratingPercent = computed(() => {
  return Math.round(props.media.voteAverage * 10)
})

const matchColor = computed(() => {
  const score = props.media.voteAverage
  if (score >= 7) return 'text-green-500'
  if (score >= 5) return 'text-yellow-500'
  return 'text-red-500'
})

const matchBgColor = computed(() => {
  const score = props.media.voteAverage
  if (score >= 7) return 'bg-green-500/20'
  if (score >= 5) return 'bg-yellow-500/20'
  return 'bg-red-500/20'
})

const isInMyList = computed(() => {
  return listsStore.isInList('my-list', props.media.id, props.media.mediaType)
})

const toggleMyList = (e: Event) => {
  e.preventDefault()
  e.stopPropagation()

  if (isInMyList.value) {
    listsStore.removeFromList('my-list', props.media.id, props.media.mediaType)
  } else {
    listsStore.addToList('my-list', props.media)
  }
}

const mediaTypeLabel = computed(() => props.media.mediaType === 'movie' ? 'Movie' : 'Series')

// Get genre names from IDs
const genreNames = computed(() => {
  if (!props.media.genreIds || props.media.genreIds.length === 0) return []
  const allGenres = props.media.mediaType === 'movie'
    ? filtersStore.movieGenres
    : filtersStore.tvGenres
  return props.media.genreIds
    .slice(0, 2)
    .map(id => allGenres.find(g => g.id === id)?.name)
    .filter(Boolean)
})

const onImageLoad = () => {
  imageLoaded.value = true
}
</script>

<template>
  <!-- Compact variant for carousels -->
  <RouterLink
    v-if="variant === 'compact'"
    :to="`/media/${media.mediaType}/${media.id}`"
    class="media-card block rounded-lg sm:rounded-xl overflow-hidden bg-[#181818] group shadow-lg shadow-black/30 border border-zinc-800/50"
  >
    <div class="aspect-[2/3] relative overflow-hidden">
      <!-- Skeleton placeholder -->
      <div
        v-if="!imageLoaded"
        class="absolute inset-0 bg-zinc-800 animate-pulse"
      ></div>

      <img
        :src="posterUrl"
        :alt="media.title"
        class="w-full h-full object-cover transition-opacity duration-300"
        :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
        loading="lazy"
        @load="onImageLoad"
      />

      <!-- Hover overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
        <!-- Bottom info on hover -->
        <div class="absolute bottom-0 left-0 right-0 p-2.5 sm:p-4">
          <h3 class="font-semibold text-xs sm:text-sm text-white line-clamp-2 mb-1.5 sm:mb-2">
            {{ media.title }}
          </h3>
          <div class="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
            <span :class="[matchColor, matchBgColor]" class="font-bold px-1.5 sm:px-2 py-0.5 rounded">{{ ratingPercent }}%</span>
            <span class="text-gray-400">{{ year }}</span>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="absolute top-2 right-2 sm:top-3 sm:right-3 flex gap-1.5 sm:gap-2">
          <button
            class="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-black/80 backdrop-blur-sm border border-zinc-600 flex items-center justify-center hover:border-white hover:scale-110 transition-all duration-200"
            @click="toggleMyList"
            :title="isInMyList ? 'In My List' : 'Add to My List'"
          >
            <i :class="['pi text-xs sm:text-sm', isInMyList ? 'pi-check text-green-500' : 'pi-plus text-white']"></i>
          </button>
        </div>
      </div>
    </div>
  </RouterLink>

  <!-- Default variant for grids - with expand/maximize effect -->
  <div v-else class="media-card-wrapper">
    <RouterLink
      :to="`/media/${media.mediaType}/${media.id}`"
      class="media-card-expand group block"
    >
      <!-- Card content container -->
      <div class="card-content rounded-lg sm:rounded-xl overflow-hidden bg-[#181818] shadow-lg shadow-black/30 border border-zinc-800/50">
        <!-- Poster -->
        <div class="aspect-[2/3] relative overflow-hidden rounded-t-lg sm:rounded-t-xl">
          <!-- Skeleton placeholder -->
          <div
            v-if="!imageLoaded"
            class="absolute inset-0 bg-zinc-800 animate-pulse"
          ></div>

          <img
            :src="posterUrl"
            :alt="media.title"
            class="w-full h-full object-cover rounded-t-lg sm:rounded-t-xl"
            :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
            loading="lazy"
            @load="onImageLoad"
          />

          <!-- Always visible rating badge -->
          <div class="absolute top-2 left-2 sm:top-3 sm:left-3 rating-badge rounded-md sm:rounded-lg px-1.5 sm:px-2 py-0.5 sm:py-1 flex items-center gap-1 sm:gap-1.5 backdrop-blur-md">
            <i class="pi pi-star-fill text-[#f5c518] text-[10px] sm:text-xs"></i>
            <span class="text-white text-[10px] sm:text-xs font-bold">{{ rating }}</span>
          </div>

          <!-- Media type badge -->
          <div class="absolute top-2 right-2 sm:top-3 sm:right-3 bg-black/60 backdrop-blur-sm rounded-md sm:rounded-lg px-1.5 sm:px-2 py-0.5 sm:py-1 opacity-100 group-hover:opacity-0 transition-opacity">
            <span class="text-[8px] sm:text-[10px] font-medium text-gray-300 uppercase tracking-wide">{{ mediaTypeLabel }}</span>
          </div>
        </div>

        <!-- Default info below poster -->
        <div class="p-2.5 sm:p-4 default-info">
          <h3 class="font-semibold text-xs sm:text-sm text-[#e5e5e5] truncate">
            {{ media.title }}
          </h3>
          <div class="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5">
            <span class="text-[10px] sm:text-xs text-gray-500">{{ year }}</span>
            <span v-if="genreNames.length > 0" class="text-[10px] sm:text-xs text-gray-600">•</span>
            <span v-if="genreNames.length > 0" class="text-[10px] sm:text-xs text-gray-500 truncate">{{ genreNames[0] }}</span>
          </div>
        </div>
      </div>

      <!-- Expanded details panel (appears on hover) - outside card-content for absolute positioning -->
      <div class="expanded-details hidden sm:block">
        <!-- Action buttons -->
        <div class="flex items-center gap-2 mb-3">
          <button class="flex-1 h-10 rounded-lg bg-white flex items-center justify-center gap-2 hover:bg-white/90 transition-colors">
            <i class="pi pi-play text-black text-sm"></i>
            <span class="text-black text-sm font-semibold">Play</span>
          </button>
          <button
            class="w-10 h-10 rounded-lg border-2 border-zinc-500 flex items-center justify-center hover:border-white transition-colors bg-zinc-800/80"
            @click="toggleMyList"
          >
            <i :class="['pi text-sm', isInMyList ? 'pi-check text-green-500' : 'pi-plus text-white']"></i>
          </button>
        </div>

        <!-- Meta info row -->
        <div class="flex items-center gap-2 mb-2">
          <span :class="[matchColor]" class="font-bold text-sm">{{ ratingPercent }}% Match</span>
          <span class="px-1.5 py-0.5 border border-zinc-600 text-gray-400 text-[10px] rounded">HD</span>
          <span class="text-gray-400 text-sm">{{ year }}</span>
        </div>

        <!-- Genres row -->
        <div v-if="genreNames.length > 0" class="flex items-center flex-wrap gap-1 mb-2">
          <span
            v-for="(genre, index) in genreNames"
            :key="genre"
            class="text-xs text-white"
          >
            {{ genre }}<span v-if="index < genreNames.length - 1" class="text-zinc-500 mx-1">•</span>
          </span>
        </div>

        <!-- Overview -->
        <p v-if="media.overview" class="text-xs text-gray-400 line-clamp-2">
          {{ media.overview }}
        </p>
      </div>
    </RouterLink>
  </div>
</template>
