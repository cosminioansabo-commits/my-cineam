<script setup lang="ts">
import { computed } from 'vue'
import ProgressBar from 'primevue/progressbar'
import Button from 'primevue/button'
import type { Download } from '@/types/torrent'

const props = defineProps<{
  download: Download
}>()

const emit = defineEmits<{
  pause: [id: string]
  resume: [id: string]
  cancel: [id: string]
}>()

const statusLabel = computed(() => {
  switch (props.download.status) {
    case 'queued': return 'Queued'
    case 'downloading': return 'Downloading'
    case 'paused': return 'Paused'
    case 'completed': return 'Completed'
    case 'error': return 'Error'
    default: return 'Unknown'
  }
})

const statusIcon = computed(() => {
  switch (props.download.status) {
    case 'queued': return 'pi-clock'
    case 'downloading': return 'pi-download'
    case 'paused': return 'pi-pause'
    case 'completed': return 'pi-check-circle'
    case 'error': return 'pi-times-circle'
    default: return 'pi-question'
  }
})

const statusClass = computed(() => {
  switch (props.download.status) {
    case 'completed': return 'text-green-400'
    case 'error': return 'text-red-400'
    case 'paused': return 'text-yellow-400'
    default: return 'text-blue-400'
  }
})

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatEta(seconds?: number): string {
  if (!seconds || seconds === Infinity) return '--'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}
</script>

<template>
  <div class="bg-[#1e1e1e] rounded-lg p-4">
    <!-- Header -->
    <div class="flex items-start justify-between gap-2 mb-3">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-medium text-white truncate" :title="download.name">
          {{ download.name }}
        </h4>
        <div class="flex items-center gap-2 mt-1">
          <i :class="['pi', statusIcon, 'text-xs', statusClass]"></i>
          <span class="text-xs" :class="statusClass">{{ statusLabel }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1">
        <Button
          v-if="download.status === 'downloading'"
          icon="pi pi-pause"
          severity="secondary"
          text
          rounded
          size="small"
          @click="emit('pause', download.id)"
          aria-label="Pause"
        />
        <Button
          v-if="download.status === 'paused'"
          icon="pi pi-play"
          severity="success"
          text
          rounded
          size="small"
          @click="emit('resume', download.id)"
          aria-label="Resume"
        />
        <Button
          v-if="download.status !== 'completed'"
          icon="pi pi-times"
          severity="danger"
          text
          rounded
          size="small"
          @click="emit('cancel', download.id)"
          aria-label="Cancel"
        />
      </div>
    </div>

    <!-- Progress -->
    <ProgressBar
      :value="download.progress"
      :showValue="false"
      style="height: 6px"
      class="mb-2"
      :pt="{
        root: { class: 'bg-zinc-700 rounded-full overflow-hidden' },
        value: { class: 'bg-green-500' }
      }"
    />

    <!-- Stats -->
    <div class="flex items-center justify-between text-xs text-gray-400">
      <span>{{ download.progress }}%</span>

      <div v-if="download.status === 'downloading'" class="flex items-center gap-3">
        <span>
          <i class="pi pi-arrow-down text-green-400 mr-1"></i>
          {{ formatSpeed(download.downloadSpeed) }}
        </span>
        <span>ETA: {{ formatEta(download.eta) }}</span>
      </div>

      <span>
        {{ formatSize(download.downloaded) }} / {{ formatSize(download.size) }}
      </span>
    </div>

    <!-- Error message -->
    <p v-if="download.error" class="text-xs text-red-400 mt-2">
      {{ download.error }}
    </p>

    <!-- Save path for completed -->
    <p v-if="download.status === 'completed'" class="text-xs text-gray-500 mt-2 truncate" :title="download.savePath">
      <i class="pi pi-folder mr-1"></i>
      {{ download.savePath }}
    </p>
  </div>
</template>
