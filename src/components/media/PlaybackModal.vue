<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import Dialog from 'primevue/dialog'
import VideoPlayer from './VideoPlayer.vue'
import { playbackService, type PlaybackInfo } from '@/services/playbackService'

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
const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null)

// Fetch playback info when modal opens
const fetchPlaybackInfo = async () => {
  if (!props.visible) return

  isLoading.value = true
  hasError.value = false
  playbackInfo.value = null

  try {
    console.log('Fetching playback info:', { mediaType: props.mediaType, tmdbId: props.tmdbId, showTmdbId: props.showTmdbId, season: props.seasonNumber, episode: props.episodeNumber })

    if (props.mediaType === 'movie' && props.tmdbId) {
      playbackInfo.value = await playbackService.getMoviePlayback(props.tmdbId)
    } else if (props.mediaType === 'tv' && props.showTmdbId && props.seasonNumber && props.episodeNumber) {
      playbackInfo.value = await playbackService.getEpisodePlayback(
        props.showTmdbId,
        props.seasonNumber,
        props.episodeNumber
      )
    }

    console.log('Playback info received:', playbackInfo.value)

    if (!playbackInfo.value) {
      hasError.value = true
      errorMessage.value = 'Media not found in Plex. Make sure Plex has scanned your library.'
    }
  } catch (error) {
    console.error('Error fetching playback info:', error)
    hasError.value = true
    errorMessage.value = 'Failed to connect to playback service'
  } finally {
    isLoading.value = false
  }
}

// Handle progress updates
const handleProgress = async (timeMs: number, state: 'playing' | 'paused' | 'stopped') => {
  if (playbackInfo.value?.ratingKey) {
    try {
      await playbackService.reportProgress(
        playbackInfo.value.ratingKey,
        timeMs,
        state,
        playbackInfo.value.duration
      )
    } catch (error) {
      console.error('Error reporting progress:', error)
    }
  }
}

// Handle close - confirm if playing
const handleClose = () => {
  // Just close for now, VideoPlayer handles its own progress reporting on unmount
  isOpen.value = false
}

// Handle video ended
const handleEnded = () => {
  // Could auto-advance to next episode for TV shows
  // For now, just close after a delay
  setTimeout(() => {
    isOpen.value = false
  }, 2000)
}

// Watch for modal open - use immediate: true in case component mounts with visible=true
watch(() => props.visible, (newValue) => {
  console.log('PlaybackModal visible changed:', newValue, { mediaType: props.mediaType, tmdbId: props.tmdbId, showTmdbId: props.showTmdbId })
  if (newValue) {
    fetchPlaybackInfo()
  } else {
    // Cleanup when closing
    playbackInfo.value = null
  }
}, { immediate: true })

// Cleanup on unmount
onUnmounted(() => {
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
    <div v-else-if="playbackInfo && playbackInfo.streamUrl" class="h-[80vh]">
      <VideoPlayer
        ref="playerRef"
        :stream-url="playbackInfo.streamUrl"
        :title="displayTitle"
        :resume-position="playbackInfo.viewOffset"
        :duration="playbackInfo.duration"
        :subtitles="playbackInfo.subtitles"
        :audio-tracks="playbackInfo.audioTracks"
        :on-progress="handleProgress"
        @close="handleClose"
        @ended="handleEnded"
      />
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
</style>
