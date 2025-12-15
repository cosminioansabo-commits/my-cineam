<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import Hls from 'hls.js'
import Button from 'primevue/button'
import Slider from 'primevue/slider'

interface SubtitleTrack {
  id: number
  language: string
  languageCode: string
  displayTitle: string
}

interface AudioTrack {
  id: number
  language: string
  languageCode: string
  displayTitle: string
  selected: boolean
}

const props = defineProps<{
  streamUrl: string
  title: string
  resumePosition?: number // in milliseconds
  duration?: number // in milliseconds
  subtitles?: SubtitleTrack[]
  audioTracks?: AudioTrack[]
  currentQuality?: string // Currently selected quality
  onProgress?: (timeMs: number, state: 'playing' | 'paused' | 'stopped') => void
}>()

const emit = defineEmits<{
  close: []
  ended: []
  qualityChange: [quality: string]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const hls = ref<Hls | null>(null)

// Player state
const isPlaying = ref(false)
const currentTime = ref(0)
const videoDuration = ref(0)
const volume = ref(1)
const isMuted = ref(false)
const isFullscreen = ref(false)
const showControls = ref(true)
const isLoading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const showResumePrompt = ref(false)
const showSettings = ref(false)

// Quality options
const qualityOptions = [
  { label: 'Original', value: 'original' },
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
  { label: '480p', value: '480p' }
]
// Initialize with prop value if provided
const selectedQuality = ref(props.currentQuality || 'original')

// Subtitle state
const selectedSubtitle = ref<number | null>(null)

let controlsTimeout: ReturnType<typeof setTimeout> | null = null
let progressInterval: ReturnType<typeof setInterval> | null = null

// Format time helper
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const progress = computed(() => {
  if (videoDuration.value === 0) return 0
  return (currentTime.value / videoDuration.value) * 100
})

const timeDisplay = computed(() => {
  return `${formatTime(currentTime.value)} / ${formatTime(videoDuration.value)}`
})

// Initialize HLS or native video
const initPlayer = () => {
  const video = videoRef.value
  if (!video || !props.streamUrl) return

  isLoading.value = true
  hasError.value = false

  // Check if it's an HLS stream
  const isHls = props.streamUrl.includes('.m3u8')

  if (isHls && Hls.isSupported()) {
    // Use HLS.js for browsers that don't natively support HLS
    // Optimized settings for high bitrate content (4K)
    hls.value = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      maxBufferLength: 60,           // Buffer up to 60 seconds ahead
      maxMaxBufferLength: 120,       // Allow up to 120 seconds in good conditions
      maxBufferSize: 120 * 1000000,  // 120MB buffer for high bitrate
      maxBufferHole: 0.5,            // Tolerate small gaps
      highBufferWatchdogPeriod: 3,   // Check buffer less frequently
      startLevel: -1,                // Auto-select quality level
      abrEwmaDefaultEstimate: 50000000, // Assume 50Mbps initially for LAN
      fragLoadingTimeOut: 60000,     // 60s timeout for fragments (4K can be slow)
      fragLoadingMaxRetry: 6,        // Retry failed fragments
      levelLoadingTimeOut: 30000,    // 30s timeout for level loading
    })

    hls.value.loadSource(props.streamUrl)
    hls.value.attachMedia(video)

    hls.value.on(Hls.Events.MANIFEST_PARSED, () => {
      isLoading.value = false
      checkResumePosition()
    })

    hls.value.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data)
      if (data.fatal) {
        hasError.value = true
        errorMessage.value = 'Failed to load video stream'
        isLoading.value = false
      }
    })
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS support (Safari)
    video.src = props.streamUrl
    video.addEventListener('loadedmetadata', () => {
      isLoading.value = false
      checkResumePosition()
    })
  } else {
    // Direct play (MP4, etc.)
    video.src = props.streamUrl
    video.addEventListener('loadedmetadata', () => {
      isLoading.value = false
      checkResumePosition()
    })
  }

  // Common event listeners
  video.addEventListener('playing', () => {
    isPlaying.value = true
    isLoading.value = false
  })

  video.addEventListener('pause', () => {
    isPlaying.value = false
  })

  video.addEventListener('timeupdate', () => {
    currentTime.value = video.currentTime
  })

  video.addEventListener('durationchange', () => {
    videoDuration.value = video.duration
  })

  video.addEventListener('ended', () => {
    isPlaying.value = false
    reportProgress('stopped')
    emit('ended')
  })

  video.addEventListener('waiting', () => {
    isLoading.value = true
  })

  video.addEventListener('canplay', () => {
    isLoading.value = false
  })

  video.addEventListener('error', () => {
    hasError.value = true
    errorMessage.value = 'Failed to play video'
    isLoading.value = false
  })

  video.addEventListener('volumechange', () => {
    volume.value = video.volume
    isMuted.value = video.muted
  })
}

const checkResumePosition = () => {
  if (props.resumePosition && props.resumePosition > 0) {
    const resumeSeconds = props.resumePosition / 1000
    // Only show resume prompt if we're more than 30 seconds in and not near the end
    if (resumeSeconds > 30 && videoDuration.value > 0 && resumeSeconds < videoDuration.value - 60) {
      showResumePrompt.value = true
    }
  }
}

const resumeFromPosition = () => {
  if (videoRef.value && props.resumePosition) {
    videoRef.value.currentTime = props.resumePosition / 1000
  }
  showResumePrompt.value = false
  play()
}

const startFromBeginning = () => {
  showResumePrompt.value = false
  play()
}

// Playback controls
const togglePlay = () => {
  if (isPlaying.value) {
    pause()
  } else {
    play()
  }
}

const play = () => {
  videoRef.value?.play()
}

const pause = () => {
  videoRef.value?.pause()
}

const seek = (value: number | number[]) => {
  const seekValue = Array.isArray(value) ? value[0] : value
  if (videoRef.value && videoDuration.value > 0) {
    const newTime = (seekValue / 100) * videoDuration.value
    videoRef.value.currentTime = newTime
    currentTime.value = newTime
  }
}

const seekRelative = (seconds: number) => {
  if (videoRef.value) {
    videoRef.value.currentTime = Math.max(0, Math.min(videoDuration.value, videoRef.value.currentTime + seconds))
  }
}

const toggleMute = () => {
  if (videoRef.value) {
    videoRef.value.muted = !videoRef.value.muted
  }
}

// Quality change handler
const changeQuality = (quality: string) => {
  selectedQuality.value = quality
  showSettings.value = false
  emit('qualityChange', quality)
}

// Toggle settings menu
const toggleSettings = () => {
  showSettings.value = !showSettings.value
}

// Subtitle options for display
const subtitleOptions = computed(() => {
  const options = [{ label: 'Off', value: null as number | null }]
  if (props.subtitles) {
    props.subtitles.forEach(sub => {
      options.push({ label: sub.displayTitle, value: sub.id })
    })
  }
  return options
})

const setVolume = (value: number | number[]) => {
  const volumeValue = Array.isArray(value) ? value[0] : value
  if (videoRef.value) {
    videoRef.value.volume = volumeValue
    if (volumeValue > 0 && videoRef.value.muted) {
      videoRef.value.muted = false
    }
  }
}

const toggleFullscreen = async () => {
  if (!containerRef.value) return

  try {
    if (!document.fullscreenElement) {
      await containerRef.value.requestFullscreen()
      isFullscreen.value = true
    } else {
      await document.exitFullscreen()
      isFullscreen.value = false
    }
  } catch (err) {
    console.error('Fullscreen error:', err)
  }
}

// Report progress to parent
const reportProgress = (state: 'playing' | 'paused' | 'stopped') => {
  if (props.onProgress && currentTime.value > 0) {
    props.onProgress(Math.floor(currentTime.value * 1000), state)
  }
}

// Controls visibility
const showControlsTemporarily = () => {
  showControls.value = true
  if (controlsTimeout) {
    clearTimeout(controlsTimeout)
  }
  if (isPlaying.value) {
    controlsTimeout = setTimeout(() => {
      showControls.value = false
    }, 3000)
  }
}

const handleMouseMove = () => {
  showControlsTemporarily()
}

const handleKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault()
      togglePlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      seekRelative(-10)
      break
    case 'ArrowRight':
      e.preventDefault()
      seekRelative(10)
      break
    case 'ArrowUp':
      e.preventDefault()
      setVolume(Math.min(1, volume.value + 0.1))
      break
    case 'ArrowDown':
      e.preventDefault()
      setVolume(Math.max(0, volume.value - 0.1))
      break
    case 'f':
      e.preventDefault()
      toggleFullscreen()
      break
    case 'm':
      e.preventDefault()
      toggleMute()
      break
    case 'Escape':
      if (!document.fullscreenElement) {
        emit('close')
      }
      break
  }
  showControlsTemporarily()
}

// Handle fullscreen change from browser
const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

// Cleanup
const cleanup = () => {
  if (hls.value) {
    hls.value.destroy()
    hls.value = null
  }
  if (controlsTimeout) {
    clearTimeout(controlsTimeout)
  }
  if (progressInterval) {
    clearInterval(progressInterval)
  }
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
}

// Lifecycle
onMounted(() => {
  initPlayer()
  document.addEventListener('fullscreenchange', handleFullscreenChange)

  // Report progress every 10 seconds
  progressInterval = setInterval(() => {
    if (isPlaying.value) {
      reportProgress('playing')
    }
  }, 10000)
})

onUnmounted(() => {
  reportProgress(isPlaying.value ? 'paused' : 'stopped')
  cleanup()
})

watch(() => props.streamUrl, () => {
  cleanup()
  initPlayer()
})

// Expose for parent component
defineExpose({
  play,
  pause,
  seek
})
</script>

<template>
  <div
    ref="containerRef"
    class="video-player relative w-full h-full bg-black select-none"
    :class="{ 'cursor-none': !showControls && isPlaying }"
    @mousemove="handleMouseMove"
    @keydown="handleKeydown"
    tabindex="0"
  >
    <!-- Video Element -->
    <video
      ref="videoRef"
      class="w-full h-full"
      playsinline
      @click="togglePlay"
      @dblclick="toggleFullscreen"
    />

    <!-- Loading Spinner -->
    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-black/50"
    >
      <i class="pi pi-spin pi-spinner text-5xl text-white"></i>
    </div>

    <!-- Error State -->
    <div
      v-if="hasError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-black/80"
    >
      <i class="pi pi-exclamation-triangle text-5xl text-red-500 mb-4"></i>
      <p class="text-white text-lg mb-4">{{ errorMessage }}</p>
      <Button label="Close" severity="secondary" @click="emit('close')" />
    </div>

    <!-- Resume Prompt -->
    <div
      v-if="showResumePrompt"
      class="absolute inset-0 flex items-center justify-center bg-black/80 z-20"
    >
      <div class="bg-zinc-900 rounded-xl p-6 max-w-md text-center">
        <p class="text-white text-lg mb-2">Resume playback?</p>
        <p class="text-gray-400 mb-6">
          Continue from {{ formatTime((resumePosition || 0) / 1000) }}
        </p>
        <div class="flex gap-3 justify-center">
          <Button
            label="Start Over"
            severity="secondary"
            @click="startFromBeginning"
          />
          <Button
            label="Resume"
            @click="resumeFromPosition"
          />
        </div>
      </div>
    </div>

    <!-- Controls Overlay -->
    <div
      v-show="showControls && !showResumePrompt"
      class="absolute inset-0 flex flex-col justify-between transition-opacity duration-300"
      :class="showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'"
    >
      <!-- Top Bar - Title -->
      <div class="bg-gradient-to-b from-black/80 to-transparent p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-white text-lg font-semibold truncate pr-4">{{ title }}</h2>
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            @click="emit('close')"
            class="!text-white hover:!bg-white/20"
          />
        </div>
      </div>

      <!-- Center Play Button -->
      <div class="flex-1 flex items-center justify-center">
        <button
          v-if="!isPlaying && !isLoading"
          class="w-20 h-20 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          @click="togglePlay"
        >
          <i class="pi pi-play text-4xl text-white ml-1"></i>
        </button>
      </div>

      <!-- Bottom Controls -->
      <div class="bg-gradient-to-t from-black/80 to-transparent p-4">
        <!-- Progress Bar -->
        <div class="mb-3">
          <Slider
            :modelValue="progress"
            @update:modelValue="seek"
            :min="0"
            :max="100"
            :step="0.1"
            class="w-full video-progress-slider"
          />
        </div>

        <!-- Control Buttons -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <!-- Play/Pause -->
            <Button
              :icon="isPlaying ? 'pi pi-pause' : 'pi pi-play'"
              severity="secondary"
              text
              rounded
              @click="togglePlay"
              class="!text-white hover:!bg-white/20"
            />

            <!-- Rewind 10s -->
            <Button
              icon="pi pi-replay"
              severity="secondary"
              text
              rounded
              @click="seekRelative(-10)"
              class="!text-white hover:!bg-white/20"
              v-tooltip.top="'-10s'"
            />

            <!-- Forward 10s -->
            <Button
              icon="pi pi-forward"
              severity="secondary"
              text
              rounded
              @click="seekRelative(10)"
              class="!text-white hover:!bg-white/20"
              v-tooltip.top="'+10s'"
            />

            <!-- Volume -->
            <div class="flex items-center gap-2 ml-2">
              <Button
                :icon="isMuted || volume === 0 ? 'pi pi-volume-off' : 'pi pi-volume-up'"
                severity="secondary"
                text
                rounded
                @click="toggleMute"
                class="!text-white hover:!bg-white/20"
              />
              <Slider
                :modelValue="isMuted ? 0 : volume * 100"
                @update:modelValue="(v) => setVolume(v / 100)"
                :min="0"
                :max="100"
                class="w-20 volume-slider"
              />
            </div>

            <!-- Time Display -->
            <span class="text-white text-sm ml-4 font-mono">{{ timeDisplay }}</span>
          </div>

          <div class="flex items-center gap-2">
            <!-- Settings (Quality & Subtitles) -->
            <div class="relative">
              <Button
                icon="pi pi-cog"
                severity="secondary"
                text
                rounded
                @click="toggleSettings"
                class="!text-white hover:!bg-white/20"
                v-tooltip.top="'Settings'"
              />

              <!-- Settings Menu -->
              <div
                v-if="showSettings"
                class="absolute bottom-12 right-0 bg-zinc-900/95 backdrop-blur-sm rounded-lg p-4 min-w-[200px] shadow-xl border border-zinc-700 z-20"
                @click.stop
              >
                <!-- Quality Selection -->
                <div :class="{ 'mb-4': subtitles && subtitles.length > 0 }">
                  <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Quality</label>
                  <div class="flex flex-col gap-1">
                    <button
                      v-for="option in qualityOptions"
                      :key="option.value"
                      class="text-left px-3 py-2 rounded text-sm transition-colors"
                      :class="selectedQuality === option.value ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                      @click="changeQuality(option.value)"
                    >
                      {{ option.label }}
                      <span v-if="option.value === 'original'" class="text-xs text-gray-400 ml-1">(Direct)</span>
                    </button>
                  </div>
                </div>

                <!-- Subtitle Selection -->
                <div v-if="subtitles && subtitles.length > 0" class="mt-4">
                  <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Subtitles</label>
                  <div class="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    <button
                      v-for="option in subtitleOptions"
                      :key="option.value ?? 'off'"
                      class="text-left px-3 py-2 rounded text-sm transition-colors"
                      :class="selectedSubtitle === option.value ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                      @click="selectedSubtitle = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- Audio Track Selection -->
                <div v-if="audioTracks && audioTracks.length > 1" class="mt-4">
                  <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Audio</label>
                  <div class="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    <button
                      v-for="track in audioTracks"
                      :key="track.id"
                      class="text-left px-3 py-2 rounded text-sm transition-colors"
                      :class="track.selected ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                    >
                      {{ track.displayTitle }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Fullscreen -->
            <Button
              :icon="isFullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
              severity="secondary"
              text
              rounded
              @click="toggleFullscreen"
              class="!text-white hover:!bg-white/20"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Click outside to close settings -->
    <div
      v-if="showSettings"
      class="absolute inset-0 z-10"
      @click="showSettings = false"
    />
  </div>
</template>

<style>
.video-player:focus {
  outline: none;
}

/* Progress slider styling */
.video-progress-slider.p-slider {
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.video-progress-slider.p-slider:hover {
  height: 6px;
}

.video-progress-slider .p-slider-range {
  background: #e50914;
}

.video-progress-slider .p-slider-handle {
  width: 14px;
  height: 14px;
  background: #e50914;
  border: none;
  margin-top: -5px;
  opacity: 0;
  transition: opacity 0.2s;
}

.video-progress-slider:hover .p-slider-handle {
  opacity: 1;
}

/* Volume slider styling */
.volume-slider.p-slider {
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.volume-slider .p-slider-range {
  background: white;
}

.volume-slider .p-slider-handle {
  width: 12px;
  height: 12px;
  background: white;
  border: none;
  margin-top: -4px;
}
</style>
