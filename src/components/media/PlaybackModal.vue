<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import VideoPlayer from './VideoPlayer.vue'
import { mediaService, type PlaybackInfo } from '@/services/mediaService'
import { progressService } from '@/services/progressService'
import { getTVSeasonDetails, getMediaDetails } from '@/services/tmdbService'

interface NextEpisodeInfo {
  seasonNumber: number
  episodeNumber: number
  name: string
  overview: string
  stillPath: string | null
}

const props = defineProps<{
  visible: boolean
  tmdbId?: number
  mediaType: 'movie' | 'tv'
  // For TV episodes
  seasonNumber?: number
  episodeNumber?: number
  showTmdbId?: number
  // Display info
  title: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const isLoading = ref(false)
const hasError = ref(false)
const errorMessage = ref('')
const playbackInfo = ref<PlaybackInfo | null>(null)
const resumePosition = ref(0)

// Next episode auto-play state
const nextEpisode = ref<NextEpisodeInfo | null>(null)
const showNextEpisodeCountdown = ref(false)
const countdownSeconds = ref(10)
let countdownInterval: ReturnType<typeof setInterval> | null = null

// Current episode state for auto-play
const currentSeasonNumber = ref(props.seasonNumber)
const currentEpisodeNumber = ref(props.episodeNumber)

// Get the effective TMDB ID for progress tracking
const effectiveTmdbId = computed(() => {
  return props.mediaType === 'movie' ? props.tmdbId : props.showTmdbId
})

// Fetch next episode info for TV shows
const fetchNextEpisode = async () => {
  if (props.mediaType !== 'tv' || !props.showTmdbId || !currentSeasonNumber.value || !currentEpisodeNumber.value) {
    nextEpisode.value = null
    return
  }

  try {
    // Get current season details
    const seasonDetails = await getTVSeasonDetails(props.showTmdbId, currentSeasonNumber.value)
    if (!seasonDetails?.episodes) {
      nextEpisode.value = null
      return
    }

    // Check if there's a next episode in current season
    const nextEpInSeason = seasonDetails.episodes.find(
      ep => ep.episodeNumber === (currentEpisodeNumber.value ?? 0) + 1
    )

    if (nextEpInSeason) {
      nextEpisode.value = {
        seasonNumber: currentSeasonNumber.value,
        episodeNumber: nextEpInSeason.episodeNumber,
        name: nextEpInSeason.name,
        overview: nextEpInSeason.overview,
        stillPath: nextEpInSeason.stillPath,
      }
      return
    }

    // Check if there's a next season
    const showDetails = await getMediaDetails('tv', props.showTmdbId)
    if (!showDetails?.numberOfSeasons || currentSeasonNumber.value >= showDetails.numberOfSeasons) {
      nextEpisode.value = null
      return
    }

    // Get first episode of next season
    const nextSeasonDetails = await getTVSeasonDetails(props.showTmdbId, currentSeasonNumber.value + 1)
    if (!nextSeasonDetails?.episodes || nextSeasonDetails.episodes.length === 0) {
      nextEpisode.value = null
      return
    }

    const firstEpNextSeason = nextSeasonDetails.episodes[0]
    nextEpisode.value = {
      seasonNumber: currentSeasonNumber.value + 1,
      episodeNumber: firstEpNextSeason.episodeNumber,
      name: firstEpNextSeason.name,
      overview: firstEpNextSeason.overview,
      stillPath: firstEpNextSeason.stillPath,
    }
  } catch (error) {
    console.error('Error fetching next episode:', error)
    nextEpisode.value = null
  }
}

// Fetch playback info and saved progress when modal opens
const fetchPlaybackInfo = async () => {
  if (!props.visible) return

  isLoading.value = true
  hasError.value = false
  playbackInfo.value = null
  resumePosition.value = 0
  showNextEpisodeCountdown.value = false
  nextEpisode.value = null

  try {
    console.log('Fetching playback info:', { mediaType: props.mediaType, tmdbId: props.tmdbId, showTmdbId: props.showTmdbId, season: currentSeasonNumber.value, episode: currentEpisodeNumber.value })

    // Fetch playback info and saved progress in parallel
    const [playbackResult, savedProgress] = await Promise.all([
      props.mediaType === 'movie' && props.tmdbId
        ? mediaService.getMoviePlayback(props.tmdbId)
        : props.mediaType === 'tv' && props.showTmdbId && currentSeasonNumber.value && currentEpisodeNumber.value
          ? mediaService.getEpisodePlayback(props.showTmdbId, currentSeasonNumber.value, currentEpisodeNumber.value)
          : Promise.resolve(null),
      effectiveTmdbId.value
        ? props.mediaType === 'movie'
          ? progressService.getMovieProgress(effectiveTmdbId.value)
          : currentSeasonNumber.value && currentEpisodeNumber.value
            ? progressService.getEpisodeProgress(effectiveTmdbId.value, currentSeasonNumber.value, currentEpisodeNumber.value)
            : Promise.resolve(null)
        : Promise.resolve(null)
    ])

    playbackInfo.value = playbackResult

    // Set resume position from saved progress (if not already completed)
    if (savedProgress && !savedProgress.completed && savedProgress.positionMs > 0) {
      resumePosition.value = savedProgress.positionMs
      console.log('Resume position loaded:', resumePosition.value)
    }

    console.log('Playback info received:', playbackInfo.value)

    if (!playbackInfo.value) {
      hasError.value = true
      errorMessage.value = 'Media not found. Make sure Radarr/Sonarr has the file.'
    } else {
      // Fetch next episode info for TV shows
      fetchNextEpisode()
    }
  } catch (error) {
    console.error('Error fetching playback info:', error)
    hasError.value = true
    errorMessage.value = 'Failed to connect to media service'
  } finally {
    isLoading.value = false
  }
}

// Save progress to backend database
// Called every 10 seconds by VideoPlayer interval, and on pause/stop
const handleProgress = async (timeMs: number, state: 'playing' | 'paused' | 'stopped') => {
  if (!effectiveTmdbId.value || !playbackInfo.value?.duration) return

  const durationMs = playbackInfo.value.duration
  const progressType = props.mediaType === 'movie' ? 'movie' : 'episode'

  await progressService.saveProgress(
    progressType,
    effectiveTmdbId.value,
    timeMs,
    durationMs,
    currentSeasonNumber.value,
    currentEpisodeNumber.value
  )
  console.log(`Progress saved: ${timeMs}ms / ${durationMs}ms (${state})`)
}

// Handle close - confirm if playing
const handleClose = () => {
  // Just close for now, VideoPlayer handles its own progress reporting on unmount
  isOpen.value = false
}

// Start countdown to next episode
const startNextEpisodeCountdown = () => {
  countdownSeconds.value = 10
  showNextEpisodeCountdown.value = true

  countdownInterval = setInterval(() => {
    countdownSeconds.value--
    if (countdownSeconds.value <= 0) {
      playNextEpisode()
    }
  }, 1000)
}

// Cancel countdown and close
const cancelCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
  showNextEpisodeCountdown.value = false
  isOpen.value = false
}

// Play next episode
const playNextEpisode = async () => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }

  if (!nextEpisode.value || !props.showTmdbId) {
    cancelCountdown()
    return
  }

  // Update current episode state
  currentSeasonNumber.value = nextEpisode.value.seasonNumber
  currentEpisodeNumber.value = nextEpisode.value.episodeNumber

  console.log(`Playing next episode: S${currentSeasonNumber.value}E${currentEpisodeNumber.value}`)

  // Refetch playback info for next episode
  showNextEpisodeCountdown.value = false
  await fetchPlaybackInfo()
}

// Handle video ended - mark as watched and show next episode countdown or close
const handleEnded = async () => {
  // Mark as fully watched
  if (effectiveTmdbId.value && playbackInfo.value?.duration) {
    const progressType = props.mediaType === 'movie' ? 'movie' : 'episode'
    await progressService.markAsWatched(
      progressType,
      effectiveTmdbId.value,
      playbackInfo.value.duration,
      currentSeasonNumber.value,
      currentEpisodeNumber.value
    )
    console.log('Marked as watched')
  }

  // For TV shows with a next episode, show countdown
  if (props.mediaType === 'tv' && nextEpisode.value) {
    startNextEpisodeCountdown()
  } else {
    // For movies or shows without next episode, close after a delay
    setTimeout(() => {
      isOpen.value = false
    }, 2000)
  }
}

// Watch for modal open - use immediate: true in case component mounts with visible=true
watch(() => props.visible, (newValue) => {
  console.log('PlaybackModal visible changed:', newValue, { mediaType: props.mediaType, tmdbId: props.tmdbId, showTmdbId: props.showTmdbId })
  if (newValue) {
    // Reset episode state when modal opens
    currentSeasonNumber.value = props.seasonNumber
    currentEpisodeNumber.value = props.episodeNumber
    fetchPlaybackInfo()
  } else {
    // Cleanup when closing
    if (countdownInterval) {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
    showNextEpisodeCountdown.value = false
    playbackInfo.value = null
    nextEpisode.value = null
  }
}, { immediate: true })

// Cleanup on unmount
onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
  playbackInfo.value = null
})

// Display title
const displayTitle = computed(() => {
  if (playbackInfo.value?.title) {
    return playbackInfo.value.title
  }
  return props.title
})
</script>

<template>
  <Dialog
    v-model:visible="isOpen"
    :header="displayTitle"
    modal
    dismissableMask
    :closable="true"
    :pt="{
      root: { class: 'playback-dialog' },
      mask: { class: 'backdrop-blur-sm bg-black/90' },
      header: { class: 'playback-dialog-header' },
      content: { class: 'playback-dialog-content' }
    }"
    @hide="handleClose"
  >
    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center h-[60vh]">
      <i class="pi pi-spin pi-spinner text-5xl text-white mb-4"></i>
      <p class="text-gray-400">Loading playback...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-[60vh]">
      <i class="pi pi-exclamation-triangle text-5xl text-red-500 mb-4"></i>
      <p class="text-white text-lg mb-2">Unable to play</p>
      <p class="text-gray-400 text-center max-w-md">{{ errorMessage }}</p>
    </div>

    <!-- Video Player -->
    <div v-else-if="playbackInfo && playbackInfo.streamUrl" class="h-[80vh] relative">
      <VideoPlayer
        :stream-url="playbackInfo.streamUrl"
        :title="displayTitle"
        :resume-position="resumePosition"
        :duration="playbackInfo.duration"
        :subtitles="playbackInfo.subtitles"
        :audio-tracks="playbackInfo.audioTracks"
        :file-path="playbackInfo.filePath"
        :on-progress="handleProgress"
        :jellyfin-item-id="playbackInfo.jellyfinItemId"
        :jellyfin-media-source-id="playbackInfo.jellyfinMediaSourceId"
        :jellyfin-play-session-id="playbackInfo.jellyfinPlaySessionId"
        :tmdb-id="effectiveTmdbId"
        :media-type="mediaType"
        :season-number="currentSeasonNumber"
        :episode-number="currentEpisodeNumber"
        @close="handleClose"
        @ended="handleEnded"
      />

      <!-- Next Episode Countdown Overlay -->
      <Transition name="fade">
        <div
          v-if="showNextEpisodeCountdown && nextEpisode"
          class="absolute inset-0 bg-black/90 flex items-center justify-center z-50"
        >
          <div class="text-center max-w-lg px-6">
            <p class="text-gray-400 text-sm uppercase tracking-wide mb-2">Up Next</p>
            <h3 class="text-white text-2xl font-bold mb-2">
              S{{ nextEpisode.seasonNumber }}:E{{ nextEpisode.episodeNumber }} - {{ nextEpisode.name }}
            </h3>
            <p v-if="nextEpisode.overview" class="text-gray-400 text-sm line-clamp-2 mb-6">
              {{ nextEpisode.overview }}
            </p>

            <!-- Countdown ring -->
            <div class="relative w-24 h-24 mx-auto mb-6">
              <svg class="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="#333"
                  stroke-width="4"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="#e50914"
                  stroke-width="4"
                  stroke-linecap="round"
                  :stroke-dasharray="276.46"
                  :stroke-dashoffset="276.46 * (1 - countdownSeconds / 10)"
                  class="transition-all duration-1000"
                />
              </svg>
              <span class="absolute inset-0 flex items-center justify-center text-white text-3xl font-bold">
                {{ countdownSeconds }}
              </span>
            </div>

            <div class="flex gap-4 justify-center">
              <Button
                label="Cancel"
                severity="secondary"
                class="!bg-zinc-700 !border-0 hover:!bg-zinc-600"
                @click="cancelCountdown"
              />
              <Button
                label="Play Now"
                class="!bg-[#e50914] !border-0 hover:!bg-[#f40612]"
                @click="playNextEpisode"
              />
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Debug info for development -->
    <div v-else-if="!isLoading && !hasError" class="flex flex-col items-center justify-center h-[60vh]">
      <i class="pi pi-exclamation-circle text-5xl text-yellow-500 mb-4"></i>
      <p class="text-white text-lg mb-2">No stream available</p>
      <p class="text-gray-400 text-center max-w-md text-sm">
        playbackInfo: {{ playbackInfo ? 'exists' : 'null' }}<br>
        streamUrl: {{ playbackInfo?.streamUrl || 'none' }}
      </p>
    </div>
  </Dialog>
</template>

<style>
/* Playback dialog - full screen player */
.playback-dialog.p-dialog {
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  max-height: 100vh !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}

.playback-dialog .p-dialog-header {
  display: none !important;
}

.playback-dialog .p-dialog-content {
  background-color: black !important;
  padding: 0 !important;
  border: none !important;
  height: 100vh !important;
  overflow: hidden !important;
}

/* Desktop: Allow some margin */
@media (min-width: 1024px) {
  .playback-dialog.p-dialog {
    width: 95vw !important;
    max-width: 1600px !important;
    height: 90vh !important;
    max-height: 900px !important;
    margin: auto !important;
    border-radius: 0.75rem !important;
  }

  .playback-dialog .p-dialog-content {
    height: 100% !important;
    border-radius: 0.75rem !important;
  }
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
