<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Badge from 'primevue/badge'
import Button from 'primevue/button'
import OverlayPanel from 'primevue/overlaypanel'
import { ref } from 'vue'
import DownloadProgress from './DownloadProgress.vue'
import { useTorrentsStore } from '@/stores/torrentsStore'

const router = useRouter()
const torrentsStore = useTorrentsStore()
const op = ref()

const activeCount = computed(() => torrentsStore.activeDownloads.length)

onMounted(() => {
  torrentsStore.fetchDownloads()
  torrentsStore.connectWebSocket()
})

onUnmounted(() => {
  torrentsStore.disconnectWebSocket()
})

function toggle(event: Event) {
  op.value.toggle(event)
}

function goToDownloads() {
  op.value.hide()
  router.push('/downloads')
}
</script>

<template>
  <div class="download-manager relative">
    <button
      @click="toggle"
      class="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
      title="Downloads"
    >
      <i class="pi pi-download text-lg"></i>
    </button>
    <Badge
      v-if="activeCount > 0"
      :value="activeCount"
      severity="success"
      class="absolute -top-1 -right-1 !text-[10px] sm:!text-xs !min-w-[18px] !h-[18px] !flex !items-center !justify-center pointer-events-none"
    />

    <OverlayPanel
      ref="op"
      class="!w-[calc(100vw-24px)] sm:!w-[400px]"
    >
      <div class="flex items-center justify-between mb-3 sm:mb-4">
        <h3 class="text-base sm:text-lg font-semibold text-white">Downloads</h3>
        <Button
          label="View All"
          link
          size="small"
          class="!text-xs sm:!text-sm !text-purple-400 hover:!text-purple-300"
          @click="goToDownloads"
        />
      </div>

      <!-- Connection status -->
      <div class="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 text-[10px] sm:text-xs">
        <span
          class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
          :class="torrentsStore.wsConnected ? 'bg-green-500' : 'bg-red-500'"
        ></span>
        <span class="text-gray-400">
          {{ torrentsStore.wsConnected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>

      <!-- No downloads -->
      <div v-if="torrentsStore.downloads.length === 0" class="text-center py-6 sm:py-8">
        <div class="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-3">
          <i class="pi pi-inbox text-xl sm:text-2xl text-gray-500"></i>
        </div>
        <p class="text-gray-400 text-xs sm:text-sm">No downloads yet</p>
      </div>

      <!-- Downloads list -->
      <div v-else class="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
        <DownloadProgress
          v-for="download in torrentsStore.downloads.slice(0, 5)"
          :key="download.id"
          :download="download"
          @pause="torrentsStore.pauseDownload"
          @resume="torrentsStore.resumeDownload"
          @cancel="torrentsStore.cancelDownload"
        />

        <p
          v-if="torrentsStore.downloads.length > 5"
          class="text-center text-xs text-gray-500"
        >
          + {{ torrentsStore.downloads.length - 5 }} more downloads
        </p>
      </div>
    </OverlayPanel>
  </div>
</template>

<style>
/* Download overlay specific styles - base dark mode handled in main.css */
</style>
