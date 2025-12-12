<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import Message from 'primevue/message'
import TorrentResultCard from './TorrentResultCard.vue'
import { useTorrentsStore } from '@/stores/torrentsStore'
import type { TorrentResult } from '@/types/torrent'
import type { MediaType } from '@/types'

const props = defineProps<{
  visible: boolean
  title: string
  year?: number
  mediaType: MediaType
  mediaId: number
  customQuery?: string // For episode-specific searches like "Show Name S01E05"
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const torrentsStore = useTorrentsStore()
const downloadingId = ref<string | null>(null)

const dialogVisible = ref(props.visible)

// Filter results to only show 2160p and 1080p quality
const filteredResults = computed(() => {
  return torrentsStore.searchResults.filter(torrent => {
    const quality = torrent.quality?.toLowerCase() || ''
    return quality.includes('2160') || quality.includes('4k') || quality.includes('1080') || quality.includes('720')
  })
})

watch(() => props.visible, (val) => {
  dialogVisible.value = val
  if (val) {
    performSearch()
  }
})

watch(dialogVisible, (val) => {
  emit('update:visible', val)
  if (!val) {
    torrentsStore.clearSearch()
  }
})

onMounted(() => {
  if (props.visible) {
    performSearch()
  }
})

// Compute the actual search query - use customQuery for episode searches
const searchQuery = computed(() => props.customQuery || props.title)
const displayTitle = computed(() => props.customQuery || props.title)

async function performSearch() {
  await torrentsStore.search({
    title: searchQuery.value,
    year: props.customQuery ? undefined : props.year, // Don't include year for episode searches
    type: props.mediaType
  })
}

async function handleDownload(torrent: TorrentResult) {
  downloadingId.value = torrent.id
  try {
    await torrentsStore.startDownload(torrent, props.mediaId, props.mediaType)
    dialogVisible.value = false
  } catch (error) {
    console.error('Download error:', error)
  } finally {
    downloadingId.value = null
  }
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    :style="{ width: '90vw', maxWidth: '800px', border: 'none' }"
    :breakpoints="{ '640px': '96vw' }"
    :draggable="false"
    class="torrent-search-modal"
    :pt="{
      header: { class: 'bg-[#1a1a1a] border-b border-[#2a2a2a] px-3 sm:px-6 py-3 sm:py-4' },
      content: { class: 'bg-[#141414] p-0' },
      footer: { class: 'bg-[#1a1a1a] border-t border-[#2a2a2a] px-3 sm:px-6 py-3 sm:py-4' }
    }"
  >
    <template #header>
      <div class="flex items-center gap-2 sm:gap-3">
        <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <i class="pi pi-search text-primary text-sm sm:text-lg"></i>
        </div>
        <div>
          <h2 class="text-sm sm:text-lg font-semibold text-white">Find Torrent</h2>
          <p class="text-xs sm:text-sm text-gray-400 truncate max-w-[180px] sm:max-w-none">
            {{ displayTitle }}<span v-if="year && !customQuery" class="text-gray-500"> ({{ year }})</span>
          </p>
        </div>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="torrentsStore.isSearching" class="flex flex-col items-center py-10 sm:py-16 px-4 sm:px-6">
      <ProgressSpinner
        style="width: 40px; height: 40px"
        class="sm:!w-12 sm:!h-12"
        strokeWidth="3"
        animationDuration=".8s"
      />
      <p class="mt-3 sm:mt-4 text-gray-400 text-xs sm:text-sm">Searching for torrents...</p>
    </div>

    <!-- Error -->
    <div v-else-if="torrentsStore.searchError" class="p-4 sm:p-6">
      <Message severity="error" :closable="false" class="mb-4 text-xs sm:text-sm">
        {{ torrentsStore.searchError }}
      </Message>
    </div>

    <!-- No Results -->
    <div v-else-if="filteredResults.length === 0" class="flex flex-col items-center py-10 sm:py-16 px-4 sm:px-6">
      <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#2a2a2a] flex items-center justify-center mb-3 sm:mb-4">
        <i class="pi pi-inbox text-2xl sm:text-3xl text-gray-500"></i>
      </div>
      <p class="text-gray-400 mb-1 text-sm sm:text-base">No HD torrents found</p>
      <p class="text-gray-500 text-xs sm:text-sm mb-3 sm:mb-4">Only showing 4K and 1080p results</p>
      <Button
        label="Search Again"
        icon="pi pi-refresh"
        severity="secondary"
        size="small"
        class="!text-xs sm:!text-sm"
        @click="performSearch"
      />
    </div>

    <!-- Results -->
    <div v-else class="max-h-[55vh] sm:max-h-[60vh] overflow-y-auto">
      <div class="px-3 sm:px-6 py-2 sm:py-3 bg-[#1a1a1a] border-b border-[#2a2a2a] sticky top-0 z-10">
        <span class="text-[10px] sm:text-xs text-gray-400">
          Showing {{ filteredResults.length }} HD results (4K & 1080p only)
        </span>
      </div>
      <div class="p-2 sm:p-4 space-y-1.5 sm:space-y-2">
        <TorrentResultCard
          v-for="torrent in filteredResults"
          :key="torrent.id"
          :torrent="torrent"
          :loading="downloadingId === torrent.id"
          @download="handleDownload"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <Button
          label="Close"
          severity="secondary"
          outlined
          class="!text-xs sm:!text-sm !py-1.5 sm:!py-2 !px-3 sm:!px-4"
          @click="dialogVisible = false"
        />
      </div>
    </template>
  </Dialog>
</template>

<style>
.torrent-search-modal .p-dialog-mask {
  backdrop-filter: blur(4px);
}

.torrent-search-modal .p-dialog {
  border: 1px solid #2a2a2a !important;
  border-radius: 12px;
  overflow: hidden;
}

.torrent-search-modal .p-dialog-header {
  border-bottom: 1px solid #2a2a2a;
}

.torrent-search-modal .p-dialog-header-icons .p-dialog-header-close {
  color: #888 !important;
  background: transparent !important;
  border: none !important;
}

.torrent-search-modal .p-dialog-header-icons .p-dialog-header-close:hover {
  color: #fff !important;
  background: #333 !important;
}

.torrent-search-modal .p-dialog-footer .p-button-secondary.p-button-outlined {
  border-color: #444 !important;
  color: #aaa !important;
}

.torrent-search-modal .p-dialog-footer .p-button-secondary.p-button-outlined:hover {
  border-color: #666 !important;
  color: #fff !important;
  background: #333 !important;
}

</style>
