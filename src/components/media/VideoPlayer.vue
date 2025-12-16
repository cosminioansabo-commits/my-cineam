<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import Hls from 'hls.js'
import Button from 'primevue/button'
import Slider from 'primevue/slider'
import { mediaService } from '@/services/mediaService'

interface SubtitleTrack {
  id: number
  language: string
  languageCode: string
  displayTitle: string
  url?: string
}

interface AudioTrack {
  id: number
  streamIndex: number
  language: string
  languageCode: string
  displayTitle: string
  selected: boolean
}

// Playback strategy from backend
type PlaybackStrategy = 'direct' | 'remux' | 'transcode'

// Quality options for transcoding
type QualityOption = 'original' | '1080p' | '720p' | '480p'

interface QualityOptionItem {
  label: string
  value: QualityOption
  resolution?: string
}

const props = defineProps<{
  streamUrl: string
  title: string
  resumePosition?: number // in milliseconds
  duration?: number // in milliseconds
  subtitles?: SubtitleTrack[]
  audioTracks?: AudioTrack[]
  playbackStrategy?: PlaybackStrategy // New: determines how to handle seeking
  filePath?: string // New: for HLS session management
  onProgress?: (timeMs: number, state: 'playing' | 'paused' | 'stopped') => void
  // Jellyfin-specific props
  jellyfinItemId?: string
  jellyfinMediaSourceId?: string
  jellyfinPlaySessionId?: string
  streamingBackend?: 'native' | 'jellyfin'
}>()

const emit = defineEmits<{
  close: []
  ended: []
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
const settingsTab = ref<'main' | 'subtitleStyle'>('main')

// Subtitle state
const selectedSubtitle = ref<number | null>(null)

// Playback speed state
const playbackSpeed = ref(1)
const speedOptions = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: 'Normal', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 }
]

// Buffering state
const bufferedProgress = ref(0)

// Quality selection state
const qualityOptions: QualityOptionItem[] = [
  { label: 'Original', value: 'original', resolution: 'Source' },
  { label: '1080p', value: '1080p', resolution: '1920x1080' },
  { label: '720p', value: '720p', resolution: '1280x720' },
  { label: '480p', value: '480p', resolution: '854x480' }
]
const selectedQuality = ref<QualityOption>('original')

// HLS session state
const hlsSessionId = ref<string | null>(null)

// Audio track state
const selectedAudioTrack = ref<number>(0)

// Subtitle styling
interface SubtitleStyle {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge'
  fontColor: string
  backgroundColor: string
  backgroundOpacity: number
}

const defaultSubtitleStyle: SubtitleStyle = {
  fontSize: 'medium',
  fontColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.75
}

// Load subtitle style from localStorage
const loadSubtitleStyle = (): SubtitleStyle => {
  try {
    const stored = localStorage.getItem('my-cinema-subtitle-style')
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.error('Failed to load subtitle style:', e)
  }
  return defaultSubtitleStyle
}

const subtitleStyle = ref<SubtitleStyle>(loadSubtitleStyle())

// Save subtitle style to localStorage
const saveSubtitleStyle = () => {
  localStorage.setItem('my-cinema-subtitle-style', JSON.stringify(subtitleStyle.value))
  applySubtitleStyle()
}

// Font size options
const fontSizeOptions = [
  { label: 'Small', value: 'small' as const },
  { label: 'Medium', value: 'medium' as const },
  { label: 'Large', value: 'large' as const },
  { label: 'X-Large', value: 'xlarge' as const }
]

// Font color options
const fontColorOptions = [
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#ffff00' },
  { label: 'Green', value: '#00ff00' },
  { label: 'Cyan', value: '#00ffff' }
]

// Background opacity options
const bgOpacityOptions = [
  { label: 'None', value: 0 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 }
]

// Apply subtitle style to video element
const applySubtitleStyle = () => {
  const video = videoRef.value
  if (!video) return

  // Calculate font size in pixels
  const fontSizes: Record<string, string> = {
    small: '16px',
    medium: '22px',
    large: '28px',
    xlarge: '36px'
  }

  // Create style element for ::cue
  let styleEl = document.getElementById('subtitle-style')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'subtitle-style'
    document.head.appendChild(styleEl)
  }

  const bgColor = subtitleStyle.value.backgroundColor
  const bgOpacity = subtitleStyle.value.backgroundOpacity
  const r = parseInt(bgColor.slice(1, 3), 16)
  const g = parseInt(bgColor.slice(3, 5), 16)
  const b = parseInt(bgColor.slice(5, 7), 16)

  styleEl.textContent = `
    video::cue {
      font-size: ${fontSizes[subtitleStyle.value.fontSize]};
      color: ${subtitleStyle.value.fontColor};
      background-color: rgba(${r}, ${g}, ${b}, ${bgOpacity});
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  `
}

// Double-tap seek state (mobile)
const lastTapTime = ref(0)
const lastTapX = ref(0)
const seekIndicator = ref<{ show: boolean; side: 'left' | 'right'; text: string }>({
  show: false,
  side: 'left',
  text: ''
})
let seekIndicatorTimeout: ReturnType<typeof setTimeout> | null = null

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

  if (isHls) {
    // HLS stream - use HLS.js or native support
    if (Hls.isSupported()) {
      hls.value = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 120 * 1000000,
      })

      hls.value.loadSource(props.streamUrl)
      hls.value.attachMedia(video)

      hls.value.on(Hls.Events.MANIFEST_PARSED, () => {
        isLoading.value = false
        checkResumePosition()
      })

      hls.value.on(Hls.Events.ERROR, (_event, data) => {
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
      }, { once: true })
    }
  } else {
    // Direct file playback - native HTML5 video
    // This is the preferred method for local/LAN streaming
    console.log('Using direct file playback:', props.streamUrl)
    video.src = props.streamUrl

    video.addEventListener('loadedmetadata', () => {
      console.log('Video loaded:', video.duration, 'seconds')
      isLoading.value = false
      checkResumePosition()
    }, { once: true })
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
    // For transcoded streams, add the seek offset to get the actual position
    if (isTranscodeStream.value) {
      currentTime.value = transcodeSeekOffset.value + video.currentTime
    } else {
      currentTime.value = video.currentTime
    }
  })

  video.addEventListener('durationchange', () => {
    // Prefer duration from props (from Radarr/Sonarr) over video element duration
    // This is important for transcoded streams where duration keeps updating
    if (props.duration && props.duration > 0) {
      videoDuration.value = props.duration / 1000 // Convert ms to seconds
    } else if (video.duration && isFinite(video.duration)) {
      videoDuration.value = video.duration
    }
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

  // Track buffered progress
  video.addEventListener('progress', () => {
    if (video.buffered.length > 0 && video.duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      bufferedProgress.value = (bufferedEnd / video.duration) * 100
    }
  })

  // Apply subtitle style on load
  applySubtitleStyle()
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

// Track the current seek offset for transcoded streams
const transcodeSeekOffset = ref(0)

// Check if we're using a transcode URL
const isTranscodeStream = computed(() => props.streamUrl.includes('/transcode/'))

// Check if we're using an HLS stream (.m3u8)
const isHlsStream = computed(() => props.streamUrl.includes('.m3u8'))

// Check if we're using Jellyfin backend
const isJellyfinStream = computed(() => props.streamingBackend === 'jellyfin')

// Determine if we should use native seeking or stream reload
// Direct play and remux (within buffered range) can use native seeking
const canUseNativeSeeking = computed(() => {
  // Direct play always supports native seeking
  if (props.playbackStrategy === 'direct') return true

  // HLS streams support seeking via HLS.js
  if (isHlsStream.value) return true

  // Non-transcode streams support native seeking
  if (!isTranscodeStream.value) return true

  return false
})

// Get the base transcode URL without any start parameter
const getBaseTranscodeUrl = (): string => {
  const url = new URL(props.streamUrl, window.location.origin)
  url.searchParams.delete('start')
  return url.toString()
}

// Debounced seek for smoother slider interaction
let seekTimeout: ReturnType<typeof setTimeout> | null = null

const seek = (value: number | number[]) => {
  const seekValue = Array.isArray(value) ? value[0] : value
  if (videoRef.value && videoDuration.value > 0) {
    const newTime = (seekValue / 100) * videoDuration.value

    // Update visual feedback immediately
    currentTime.value = newTime

    // Debounce the actual seek for transcoded streams
    if (isTranscodeStream.value && !canUseNativeSeeking.value) {
      if (seekTimeout) clearTimeout(seekTimeout)
      seekTimeout = setTimeout(() => {
        seekToTranscodePosition(newTime)
      }, 300) // Wait 300ms after user stops dragging
    } else {
      // For direct/HLS streams, seek immediately
      videoRef.value.currentTime = newTime
    }
  }
}

const seekRelative = (seconds: number) => {
  if (videoRef.value) {
    const newTime = Math.max(0, Math.min(videoDuration.value, currentTime.value + seconds))

    if (isTranscodeStream.value && !canUseNativeSeeking.value) {
      // For transcode streams, check if we can seek within buffer
      const buffered = videoRef.value.buffered
      let canSeekInBuffer = false

      for (let i = 0; i < buffered.length; i++) {
        const actualNewTime = newTime - transcodeSeekOffset.value
        if (actualNewTime >= buffered.start(i) && actualNewTime <= buffered.end(i)) {
          canSeekInBuffer = true
          break
        }
      }

      if (canSeekInBuffer) {
        // Seek within buffer - no reload needed
        videoRef.value.currentTime = newTime - transcodeSeekOffset.value
        currentTime.value = newTime
      } else {
        // Need to reload stream from new position
        seekToTranscodePosition(newTime)
      }
    } else {
      // Direct play or HLS - use native seeking
      videoRef.value.currentTime = newTime
      currentTime.value = newTime
    }
  }
}

// Seek in a transcoded stream by reloading with new start position
// IMPROVED: Better handling to minimize audio sync issues
const seekToTranscodePosition = (targetTime: number) => {
  if (!videoRef.value) return

  const wasPlaying = isPlaying.value
  const currentPlaybackRate = videoRef.value.playbackRate

  isLoading.value = true

  // Update the offset and current time
  transcodeSeekOffset.value = targetTime
  currentTime.value = targetTime

  // Build the new URL with start parameter
  const baseUrl = getBaseTranscodeUrl()
  const separator = baseUrl.includes('?') ? '&' : '?'
  const newUrl = `${baseUrl}${separator}start=${Math.floor(targetTime)}`

  console.log(`Seeking transcode stream to ${targetTime}s (strategy: ${props.playbackStrategy || 'unknown'})`)

  // For non-HLS transcode streams, we need to reload
  // But we DON'T destroy HLS for HLS streams - let HLS.js handle it
  if (!isHlsStream.value && hls.value) {
    hls.value.destroy()
    hls.value = null
  }

  // Update video source
  videoRef.value.src = newUrl
  videoRef.value.load()

  // Resume playback once loaded
  const onCanPlay = () => {
    isLoading.value = false
    // Restore playback rate
    if (videoRef.value) {
      videoRef.value.playbackRate = currentPlaybackRate
    }
    if (wasPlaying) {
      videoRef.value?.play()
    }
  }

  videoRef.value.addEventListener('canplay', onCanPlay, { once: true })

  // Timeout fallback in case canplay doesn't fire
  setTimeout(() => {
    if (isLoading.value) {
      isLoading.value = false
      if (wasPlaying) {
        videoRef.value?.play()
      }
    }
  }, 5000)
}

const toggleMute = () => {
  if (videoRef.value) {
    videoRef.value.muted = !videoRef.value.muted
  }
}

// Playback speed control
const setPlaybackSpeed = (speed: number) => {
  if (videoRef.value) {
    videoRef.value.playbackRate = speed
    playbackSpeed.value = speed
  }
}

const cyclePlaybackSpeed = (direction: 'up' | 'down') => {
  const currentIndex = speedOptions.findIndex(opt => opt.value === playbackSpeed.value)
  let newIndex = currentIndex
  if (direction === 'up' && currentIndex < speedOptions.length - 1) {
    newIndex = currentIndex + 1
  } else if (direction === 'down' && currentIndex > 0) {
    newIndex = currentIndex - 1
  }
  setPlaybackSpeed(speedOptions[newIndex].value)
}

// Double-tap seek handler (mobile)
const handleDoubleTapSeek = (clientX: number) => {
  const container = containerRef.value
  if (!container) return

  const rect = container.getBoundingClientRect()
  const tapX = clientX - rect.left
  const isLeftSide = tapX < rect.width / 2

  if (isLeftSide) {
    seekRelative(-10)
    showSeekIndicator('left', '-10s')
  } else {
    seekRelative(10)
    showSeekIndicator('right', '+10s')
  }
}

const showSeekIndicator = (side: 'left' | 'right', text: string) => {
  seekIndicator.value = { show: true, side, text }
  if (seekIndicatorTimeout) {
    clearTimeout(seekIndicatorTimeout)
  }
  seekIndicatorTimeout = setTimeout(() => {
    seekIndicator.value.show = false
  }, 600)
}

const handleTouchStart = (e: TouchEvent) => {
  const now = Date.now()
  const touch = e.touches[0]

  // Detect double tap (within 300ms and similar position)
  if (now - lastTapTime.value < 300 && Math.abs(touch.clientX - lastTapX.value) < 50) {
    e.preventDefault()
    handleDoubleTapSeek(touch.clientX)
  }

  lastTapTime.value = now
  lastTapX.value = touch.clientX
}

// Toggle settings menu
const toggleSettings = () => {
  showSettings.value = !showSettings.value
  settingsTab.value = 'main'
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

// Load and activate subtitle track
const loadSubtitle = async (subtitleId: number | null) => {
  const video = videoRef.value
  if (!video) return

  // Remove all existing text tracks (except those already in the video)
  const existingTracks = video.querySelectorAll('track')
  existingTracks.forEach(track => track.remove())

  // Hide all text tracks
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = 'hidden'
  }

  if (subtitleId === null) {
    console.log('Subtitles disabled')
    return
  }

  // Find the selected subtitle
  const subtitle = props.subtitles?.find(s => s.id === subtitleId)
  if (!subtitle?.url) {
    console.error('Subtitle not found or no URL:', subtitleId)
    return
  }

  console.log('Loading subtitle:', subtitle.displayTitle, subtitle.url)

  // Create and add the track element
  const track = document.createElement('track')
  track.kind = 'subtitles'
  track.label = subtitle.displayTitle
  track.srclang = subtitle.languageCode
  track.src = subtitle.url
  track.default = true

  // Add track to video
  video.appendChild(track)

  // Wait for track to load and then show it
  track.addEventListener('load', () => {
    console.log('Subtitle track loaded')
    // Find and enable this track
    for (let i = 0; i < video.textTracks.length; i++) {
      if (video.textTracks[i].label === subtitle.displayTitle) {
        video.textTracks[i].mode = 'showing'
        break
      }
    }
  })

  track.addEventListener('error', (e) => {
    console.error('Subtitle track error:', e)
  })
}

// Watch for subtitle selection changes
watch(selectedSubtitle, (newValue) => {
  loadSubtitle(newValue)
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

// Check if quality switching is available (only for remux/transcode strategies)
const canSwitchQuality = computed(() => {
  return props.playbackStrategy === 'remux' || props.playbackStrategy === 'transcode'
})

// Check if audio track switching is available
const canSwitchAudio = computed(() => {
  return props.audioTracks && props.audioTracks.length > 1 && props.filePath
})

// Initialize audio track from props
const initAudioTrack = () => {
  if (props.audioTracks) {
    const selected = props.audioTracks.find(t => t.selected)
    if (selected) {
      selectedAudioTrack.value = selected.streamIndex
    }
  }
}

// Start HLS session for quality/audio switching
const startHlsSession = async (quality: QualityOption, audioTrack: number, startTime: number = 0) => {
  if (!props.filePath) {
    console.warn('Cannot start HLS session: no filePath provided')
    return null
  }

  // Stop existing session if any
  if (hlsSessionId.value) {
    await stopHlsSession()
  }

  console.log(`Starting HLS session: quality=${quality}, audioTrack=${audioTrack}, startTime=${startTime}`)

  const session = await mediaService.startHlsSession(props.filePath, {
    quality,
    audioTrack,
    startTime: Math.floor(startTime)
  })

  if (session) {
    hlsSessionId.value = session.sessionId
    return session.playlistUrl
  }

  return null
}

// Stop current HLS session
const stopHlsSession = async () => {
  if (hlsSessionId.value) {
    await mediaService.stopHlsSession(hlsSessionId.value)
    hlsSessionId.value = null
  }
}

// Switch video quality
const switchQuality = async (quality: QualityOption) => {
  if (!canSwitchQuality.value || quality === selectedQuality.value) return

  const wasPlaying = isPlaying.value
  const currentPos = currentTime.value
  const currentPlaybackRate = videoRef.value?.playbackRate || 1

  isLoading.value = true
  selectedQuality.value = quality

  console.log(`Switching quality to ${quality} at position ${currentPos}s`)

  // For quality switching, we need to use HLS session
  const playlistUrl = await startHlsSession(quality, selectedAudioTrack.value, currentPos)

  if (playlistUrl && videoRef.value) {
    // Cleanup existing HLS instance
    if (hls.value) {
      hls.value.destroy()
      hls.value = null
    }

    // Initialize new HLS stream
    if (Hls.isSupported()) {
      hls.value = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 60,
      })

      hls.value.loadSource(playlistUrl)
      hls.value.attachMedia(videoRef.value)

      hls.value.on(Hls.Events.MANIFEST_PARSED, () => {
        isLoading.value = false
        if (videoRef.value) {
          videoRef.value.playbackRate = currentPlaybackRate
          if (wasPlaying) {
            videoRef.value.play()
          }
        }
      })

      hls.value.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error during quality switch:', data)
        if (data.fatal) {
          hasError.value = true
          errorMessage.value = 'Failed to switch quality'
          isLoading.value = false
        }
      })
    } else if (videoRef.value.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      videoRef.value.src = playlistUrl
      videoRef.value.addEventListener('loadedmetadata', () => {
        isLoading.value = false
        if (videoRef.value) {
          videoRef.value.playbackRate = currentPlaybackRate
          if (wasPlaying) {
            videoRef.value.play()
          }
        }
      }, { once: true })
    }
  } else {
    // Fallback: reload stream with new quality parameter
    console.warn('HLS session failed, using fallback method')
    isLoading.value = false
  }
}

// Switch audio track
const switchAudioTrack = async (streamIndex: number) => {
  if (!canSwitchAudio.value || streamIndex === selectedAudioTrack.value) return

  const wasPlaying = isPlaying.value
  const currentPos = currentTime.value
  const currentPlaybackRate = videoRef.value?.playbackRate || 1

  isLoading.value = true
  selectedAudioTrack.value = streamIndex

  console.log(`Switching audio track to stream ${streamIndex} at position ${currentPos}s`)

  // Jellyfin audio track switching
  if (isJellyfinStream.value && props.jellyfinItemId && props.jellyfinMediaSourceId && props.jellyfinPlaySessionId) {
    const newHlsUrl = await mediaService.getJellyfinAudioTrackUrl(
      props.jellyfinItemId,
      streamIndex,
      props.jellyfinMediaSourceId,
      props.jellyfinPlaySessionId
    )

    if (newHlsUrl && videoRef.value) {
      // Cleanup existing HLS instance
      if (hls.value) {
        hls.value.destroy()
        hls.value = null
      }

      // Initialize new HLS stream with different audio track
      if (Hls.isSupported()) {
        hls.value = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 60,
        })

        hls.value.loadSource(newHlsUrl)
        hls.value.attachMedia(videoRef.value)

        hls.value.on(Hls.Events.MANIFEST_PARSED, () => {
          isLoading.value = false
          if (videoRef.value) {
            // Seek to the position we were at
            videoRef.value.currentTime = currentPos
            videoRef.value.playbackRate = currentPlaybackRate
            if (wasPlaying) {
              videoRef.value.play()
            }
          }
        })

        hls.value.on(Hls.Events.ERROR, (_event, data) => {
          console.error('HLS error during Jellyfin audio switch:', data)
          if (data.fatal) {
            isLoading.value = false
          }
        })
      } else if (videoRef.value.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        videoRef.value.src = newHlsUrl
        videoRef.value.addEventListener('loadedmetadata', () => {
          isLoading.value = false
          if (videoRef.value) {
            videoRef.value.currentTime = currentPos
            videoRef.value.playbackRate = currentPlaybackRate
            if (wasPlaying) {
              videoRef.value.play()
            }
          }
        }, { once: true })
      }
    } else {
      console.error('Failed to get Jellyfin audio track URL')
      isLoading.value = false
    }
    return
  }

  // Native audio switching (non-Jellyfin)
  // For audio switching, we reload the transcode stream with new audio track
  if (props.playbackStrategy === 'remux' || props.playbackStrategy === 'transcode') {
    // Use HLS session for smooth audio switching
    const playlistUrl = await startHlsSession(selectedQuality.value, streamIndex, currentPos)

    if (playlistUrl && videoRef.value) {
      // Cleanup existing HLS instance
      if (hls.value) {
        hls.value.destroy()
        hls.value = null
      }

      // Initialize new HLS stream
      if (Hls.isSupported()) {
        hls.value = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 60,
        })

        hls.value.loadSource(playlistUrl)
        hls.value.attachMedia(videoRef.value)

        hls.value.on(Hls.Events.MANIFEST_PARSED, () => {
          isLoading.value = false
          if (videoRef.value) {
            videoRef.value.playbackRate = currentPlaybackRate
            if (wasPlaying) {
              videoRef.value.play()
            }
          }
        })

        hls.value.on(Hls.Events.ERROR, (_event, data) => {
          console.error('HLS error during audio switch:', data)
          if (data.fatal) {
            isLoading.value = false
          }
        })
      }
    } else {
      // Fallback: reload transcode stream with new audio track
      const baseUrl = getBaseTranscodeUrl()
      const url = new URL(baseUrl)
      url.searchParams.set('start', Math.floor(currentPos).toString())
      url.searchParams.set('audioTrack', streamIndex.toString())

      videoRef.value!.src = url.toString()
      videoRef.value!.load()

      videoRef.value!.addEventListener('canplay', () => {
        isLoading.value = false
        if (videoRef.value) {
          videoRef.value.playbackRate = currentPlaybackRate
          if (wasPlaying) {
            videoRef.value.play()
          }
        }
      }, { once: true })
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

// Report progress to parent and Jellyfin
const reportProgress = (state: 'playing' | 'paused' | 'stopped') => {
  const positionMs = Math.floor(currentTime.value * 1000)

  // Report to parent callback
  if (props.onProgress && currentTime.value > 0) {
    props.onProgress(positionMs, state)
  }

  // Report to Jellyfin if using Jellyfin backend
  if (isJellyfinStream.value && props.jellyfinItemId) {
    if (state === 'stopped') {
      mediaService.reportJellyfinStopped(props.jellyfinItemId, positionMs)
    } else {
      mediaService.reportJellyfinProgress(props.jellyfinItemId, positionMs, state === 'paused')
    }
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
    case '>':
    case '.':
      e.preventDefault()
      cyclePlaybackSpeed('up')
      break
    case '<':
    case ',':
      e.preventDefault()
      cyclePlaybackSpeed('down')
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
const cleanup = async () => {
  // Stop HLS session on cleanup
  if (hlsSessionId.value) {
    await stopHlsSession()
  }
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
  // Set initial duration from props if available (important for transcoded streams)
  if (props.duration && props.duration > 0) {
    videoDuration.value = props.duration / 1000 // Convert ms to seconds
  }

  // Initialize audio track from props
  initAudioTrack()

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
    @touchstart="handleTouchStart"
    tabindex="0"
  >
    <!-- Video Element -->
    <video
      ref="videoRef"
      class="w-full h-full"
      playsinline
      crossorigin="anonymous"
      @click="togglePlay"
      @dblclick="toggleFullscreen"
    />

    <!-- Double-tap Seek Indicator (Mobile) -->
    <Transition name="seek-fade">
      <div
        v-if="seekIndicator.show"
        class="absolute top-1/2 -translate-y-1/2 pointer-events-none"
        :class="seekIndicator.side === 'left' ? 'left-16' : 'right-16'"
      >
        <div class="flex flex-col items-center gap-2">
          <div class="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <i :class="seekIndicator.side === 'left' ? 'pi pi-replay' : 'pi pi-forward'" class="text-2xl text-white"></i>
          </div>
          <span class="text-white text-lg font-semibold">{{ seekIndicator.text }}</span>
        </div>
      </div>
    </Transition>

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
        <!-- Progress Bar with Buffering Indicator -->
        <div class="mb-3 relative">
          <!-- Buffered Progress (gray background bar) -->
          <div class="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-white/20 rounded">
            <div
              class="h-full bg-white/40 rounded transition-all duration-300"
              :style="{ width: `${bufferedProgress}%` }"
            />
          </div>
          <!-- Playback Progress Slider -->
          <Slider
            :modelValue="progress"
            @update:modelValue="seek"
            :min="0"
            :max="100"
            :step="0.1"
            class="w-full video-progress-slider relative z-10"
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
                @update:modelValue="(v: number | number[]) => setVolume((Array.isArray(v) ? v[0] : v) / 100)"
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
                class="absolute bottom-12 right-0 bg-zinc-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-zinc-700 z-20 min-w-[250px] max-h-[400px] overflow-y-auto"
                @click.stop
              >
                <!-- Main Settings Tab -->
                <div v-if="settingsTab === 'main'" class="p-4">
                  <!-- Quality Selection (only for remux/transcode) -->
                  <div v-if="canSwitchQuality" class="mb-4">
                    <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Quality</label>
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="option in qualityOptions"
                        :key="option.value"
                        class="px-3 py-1.5 rounded text-sm transition-colors"
                        :class="selectedQuality === option.value ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                        @click="switchQuality(option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <!-- Playback Speed -->
                  <div class="mb-4">
                    <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Speed</label>
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="option in speedOptions"
                        :key="option.value"
                        class="px-3 py-1.5 rounded text-sm transition-colors"
                        :class="playbackSpeed === option.value ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                        @click="setPlaybackSpeed(option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <!-- Audio Track Selection -->
                  <div v-if="audioTracks && audioTracks.length > 1" class="mb-4">
                    <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Audio</label>
                    <div class="flex flex-col gap-1 max-h-32 overflow-y-auto">
                      <button
                        v-for="track in audioTracks"
                        :key="track.id"
                        class="text-left px-3 py-2 rounded text-sm transition-colors"
                        :class="selectedAudioTrack === track.streamIndex ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                        @click="switchAudioTrack(track.streamIndex)"
                      >
                        {{ track.displayTitle }}
                      </button>
                    </div>
                  </div>

                  <!-- Subtitle Selection -->
                  <div v-if="subtitles && subtitles.length > 0">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-gray-400 text-xs uppercase tracking-wide">Subtitles</label>
                      <button
                        class="text-xs text-gray-400 hover:text-white transition-colors"
                        @click="settingsTab = 'subtitleStyle'"
                      >
                        Style <i class="pi pi-chevron-right text-xs"></i>
                      </button>
                    </div>
                    <div class="flex flex-col gap-1 max-h-32 overflow-y-auto">
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
                </div>

                <!-- Subtitle Style Tab -->
                <div v-else-if="settingsTab === 'subtitleStyle'" class="p-4">
                  <button
                    class="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
                    @click="settingsTab = 'main'"
                  >
                    <i class="pi pi-chevron-left text-xs"></i>
                    <span class="text-sm">Subtitle Style</span>
                  </button>

                  <!-- Font Size -->
                  <div class="mb-4">
                    <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Font Size</label>
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="option in fontSizeOptions"
                        :key="option.value"
                        class="px-3 py-1.5 rounded text-sm transition-colors"
                        :class="subtitleStyle.fontSize === option.value ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                        @click="subtitleStyle.fontSize = option.value; saveSubtitleStyle()"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <!-- Font Color -->
                  <div class="mb-4">
                    <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Font Color</label>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in fontColorOptions"
                        :key="option.value"
                        class="w-8 h-8 rounded-full border-2 transition-all"
                        :class="subtitleStyle.fontColor === option.value ? 'border-red-500 scale-110' : 'border-transparent hover:border-gray-500'"
                        :style="{ backgroundColor: option.value }"
                        :title="option.label"
                        @click="subtitleStyle.fontColor = option.value; saveSubtitleStyle()"
                      />
                    </div>
                  </div>

                  <!-- Background Opacity -->
                  <div>
                    <label class="text-gray-400 text-xs uppercase tracking-wide mb-2 block">Background</label>
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="option in bgOpacityOptions"
                        :key="option.value"
                        class="px-3 py-1.5 rounded text-sm transition-colors"
                        :class="subtitleStyle.backgroundOpacity === option.value ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-zinc-700'"
                        @click="subtitleStyle.backgroundOpacity = option.value; saveSubtitleStyle()"
                      >
                        {{ option.label }}
                      </button>
                    </div>
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

/* Seek indicator fade animation */
.seek-fade-enter-active,
.seek-fade-leave-active {
  transition: opacity 0.3s ease;
}

.seek-fade-enter-from,
.seek-fade-leave-to {
  opacity: 0;
}

/* Make progress slider background transparent for buffering indicator to show */
.video-progress-slider.p-slider {
  background: transparent;
}
</style>
