<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getImageUrl } from '@/services/tmdbService'
import PlaybackModal from './PlaybackModal.vue'

export interface ContinueWatchingItem {
  id: number
  mediaType: 'movie' | 'episode'
  tmdbId: number
  seasonNumber: number | null
  episodeNumber: number | null
  positionMs: number
  durationMs: number
  progress: number
  updatedAt: string
  // TMDB enriched data
  title?: string
  posterPath?: string | null
  episodeTitle?: string
}

const props = withDefaults(defineProps<{
  title: string
  items: ContinueWatchingItem[]
  loading?: boolean
  cardWidth?: number
}>(), {
  cardWidth: 180,
})

const emit = defineEmits<{
  refresh: []
}>()

const trackRef = ref<HTMLElement>()
const canScrollLeft = ref(false)
const canScrollRight = ref(true)
const isMobile = ref(false)

// Playback modal state
const showPlayback = ref(false)
const playbackItem = ref<ContinueWatchingItem | null>(null)

const cardStyle = computed(() => ({
  width: isMobile.value ? '130px' : `${props.cardWidth}px`,
}))

const updateScrollButtons = () => {
  if (!trackRef.value) return

  const { scrollLeft, scrollWidth, clientWidth } = trackRef.value
  canScrollLeft.value = scrollLeft > 0
  canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 10
}

const scroll = (direction: 'left' | 'right') => {
  if (!trackRef.value) return

  const scrollAmount = props.cardWidth * 4
  const newPosition = direction === 'left'
    ? trackRef.value.scrollLeft - scrollAmount
    : trackRef.value.scrollLeft + scrollAmount

  trackRef.value.scrollTo({
    left: newPosition,
    behavior: 'smooth',
  })
}

// Format remaining time
const formatRemainingTime = (positionMs: number, durationMs: number): string => {
  const remainingMs = durationMs - positionMs
  const totalMinutes = Math.ceil(remainingMs / 60000)

  if (totalMinutes < 60) {
    return `${totalMinutes}m left`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`
}

// Handle item click - resume playback
const handleItemClick = (item: ContinueWatchingItem) => {
  playbackItem.value = item
  showPlayback.value = true
}

// Handle playback modal visibility change
const handlePlaybackVisibilityChange = (visible: boolean) => {
  if (!visible) {
    // Modal closed - refresh the continue watching list
    playbackItem.value = null
    emit('refresh')
  }
}

// Get poster URL
const getItemPoster = (item: ContinueWatchingItem): string => {
  if (item.posterPath) {
    return getImageUrl(item.posterPath, 'w300') || ''
  }
  return ''
}

// Get display title
const getDisplayTitle = (item: ContinueWatchingItem): string => {
  if (item.mediaType === 'episode' && item.seasonNumber && item.episodeNumber) {
    return `S${item.seasonNumber}:E${item.episodeNumber}`
  }
  return item.title || 'Unknown'
}

onMounted(() => {
  if (trackRef.value) {
    trackRef.value.addEventListener('scroll', updateScrollButtons)
    updateScrollButtons()
  }
  // Check for mobile
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 640
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  if (trackRef.value) {
    trackRef.value.removeEventListener('scroll', updateScrollButtons)
  }
})
</script>

<template>
  <section v-if="items.length > 0 || loading" class="carousel-section">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="row-title text-base sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3">
        <i class="pi pi-play-circle text-[#e50914]"></i>
        {{ title }}
      </h2>
    </div>

    <!-- Carousel -->
    <div class="carousel-container group">
      <!-- Left Arrow -->
      <button
        v-show="canScrollLeft && !loading"
        class="carousel-btn carousel-btn-left hidden sm:flex"
        @click="scroll('left')"
        aria-label="Scroll left"
      >
        <i class="pi pi-chevron-left text-base sm:text-lg"></i>
      </button>

      <!-- Track -->
      <div
        ref="trackRef"
        class="carousel-track"
      >
        <!-- Loading skeletons -->
        <template v-if="loading">
          <div
            v-for="i in 6"
            :key="`skeleton-${i}`"
            class="carousel-item"
            :style="cardStyle"
          >
            <div class="bg-[#181818] rounded-xl overflow-hidden shadow-lg shadow-black/30 border border-zinc-800/50 animate-pulse">
              <div class="aspect-2/3 bg-zinc-800"></div>
            </div>
          </div>
        </template>

        <!-- Continue watching cards -->
        <template v-else>
          <div
            v-for="item in items"
            :key="`${item.mediaType}-${item.tmdbId}-${item.seasonNumber}-${item.episodeNumber}`"
            class="carousel-item cursor-pointer"
            :style="cardStyle"
            @click="handleItemClick(item)"
          >
            <div class="continue-watching-card group/card relative bg-[#181818] rounded-xl overflow-hidden shadow-lg shadow-black/30 border border-zinc-800/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:border-zinc-700/50">
              <!-- Poster -->
              <div class="aspect-2/3 relative">
                <img
                  v-if="getItemPoster(item)"
                  :src="getItemPoster(item)"
                  :alt="item.title || 'Media'"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <div v-else class="w-full h-full bg-zinc-800 flex items-center justify-center">
                  <i class="pi pi-image text-3xl text-zinc-600"></i>
                </div>

                <!-- Play Overlay -->
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                  <div class="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                    <i class="pi pi-play text-2xl text-black ml-1"></i>
                  </div>
                </div>

                <!-- Episode Badge -->
                <div
                  v-if="item.mediaType === 'episode'"
                  class="absolute top-2 left-2 px-2 py-1 bg-black/80 rounded text-xs font-medium text-white"
                >
                  {{ getDisplayTitle(item) }}
                </div>
              </div>

              <!-- Progress Bar -->
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
                <div
                  class="h-full bg-[#e50914] transition-all"
                  :style="{ width: `${item.progress}%` }"
                />
              </div>

              <!-- Info Overlay -->
              <div class="absolute bottom-1 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                <p class="text-white text-xs font-medium truncate">{{ item.title || 'Unknown' }}</p>
                <p class="text-gray-400 text-[10px]">{{ formatRemainingTime(item.positionMs, item.durationMs) }}</p>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Right Arrow -->
      <button
        v-show="canScrollRight && !loading"
        class="carousel-btn carousel-btn-right hidden sm:flex"
        @click="scroll('right')"
        aria-label="Scroll right"
      >
        <i class="pi pi-chevron-right text-base sm:text-lg"></i>
      </button>
    </div>

    <!-- Playback Modal -->
    <PlaybackModal
      v-if="playbackItem"
      v-model:visible="showPlayback"
      :tmdb-id="playbackItem.mediaType === 'movie' ? playbackItem.tmdbId : undefined"
      :show-tmdb-id="playbackItem.mediaType === 'episode' ? playbackItem.tmdbId : undefined"
      :media-type="playbackItem.mediaType === 'movie' ? 'movie' : 'tv'"
      :season-number="playbackItem.seasonNumber ?? undefined"
      :episode-number="playbackItem.episodeNumber ?? undefined"
      :title="playbackItem.title || 'Continue Watching'"
      @update:visible="handlePlaybackVisibilityChange"
    />
  </section>
</template>

<style scoped>
.continue-watching-card {
  aspect-ratio: 2/3;
}
</style>
