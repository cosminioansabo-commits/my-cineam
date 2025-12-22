<script setup lang="ts">
import { onMounted, computed } from 'vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import DownloadProgress from '@/components/torrents/DownloadProgress.vue'
import { useTorrentsStore } from '@/stores/torrentsStore'

const torrentsStore = useTorrentsStore()

onMounted(() => {
  torrentsStore.fetchDownloads()
  torrentsStore.connectWebSocket()
})

const activeDownloads = computed(() =>
  torrentsStore.downloads.filter(d =>
    d.status === 'downloading' || d.status === 'paused' || d.status === 'queued'
  )
)

const completedDownloads = computed(() =>
  torrentsStore.downloads.filter(d => d.status === 'completed')
)

const failedDownloads = computed(() =>
  torrentsStore.downloads.filter(d => d.status === 'error')
)
</script>

<template>
  <div class="downloads-view max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-4 sm:mb-6">
      <h1 class="text-xl sm:text-2xl font-bold text-white">Downloads</h1>

      <div class="flex items-center gap-2 text-xs sm:text-sm">
        <span
          class="w-2 h-2 rounded-full"
          :class="torrentsStore.wsConnected ? 'bg-green-500' : 'bg-red-500'"
        ></span>
        <span class="text-gray-400">
          {{ torrentsStore.wsConnected ? 'Server Connected' : 'Disconnected' }}
        </span>
      </div>
    </div>

    <div class="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <Tabs value="active" class="downloads-tabs">
        <TabList class="bg-zinc-900 border-b border-zinc-800 px-2 sm:px-4">
          <Tab value="active" class="downloads-tab">
            Active
            <span v-if="activeDownloads.length" class="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-purple-600 text-white px-1.5 sm:px-2 py-0.5 rounded-full">
              {{ activeDownloads.length }}
            </span>
          </Tab>
          <Tab value="completed" class="downloads-tab">
            Completed
            <span v-if="completedDownloads.length" class="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-green-600 text-white px-1.5 sm:px-2 py-0.5 rounded-full">
              {{ completedDownloads.length }}
            </span>
          </Tab>
          <Tab value="failed" class="downloads-tab">
            Failed
            <span v-if="failedDownloads.length" class="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-red-600 text-white px-1.5 sm:px-2 py-0.5 rounded-full">
              {{ failedDownloads.length }}
            </span>
          </Tab>
        </TabList>

        <TabPanels class="bg-zinc-900">
          <!-- Active Downloads -->
          <TabPanel value="active" class="p-3 sm:p-4">
            <div v-if="activeDownloads.length === 0" class="text-center py-10 sm:py-16">
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <i class="pi pi-download text-2xl sm:text-3xl text-gray-500"></i>
              </div>
              <p class="text-gray-400 text-sm sm:text-base">No active downloads</p>
              <p class="text-gray-500 text-xs sm:text-sm mt-2 max-w-xs mx-auto">
                Find a movie or TV show and click "Find Torrent" to start downloading
              </p>
            </div>

            <div v-else class="flex flex-col gap-2 sm:gap-4 p-2 sm:p-4">
              <DownloadProgress
                v-for="download in activeDownloads"
                :key="download.id"
                :download="download"
                @pause="torrentsStore.pauseDownload"
                @resume="torrentsStore.resumeDownload"
                @cancel="torrentsStore.cancelDownload"
              />
            </div>
          </TabPanel>

          <!-- Completed Downloads -->
          <TabPanel value="completed" class="p-3 sm:p-4">
            <div v-if="completedDownloads.length === 0" class="text-center py-10 sm:py-16">
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <i class="pi pi-check-circle text-2xl sm:text-3xl text-gray-500"></i>
              </div>
              <p class="text-gray-400 text-sm sm:text-base">No completed downloads</p>
            </div>

            <div v-else class="flex flex-col gap-2 sm:gap-4 p-2 sm:p-4">
              <DownloadProgress
                v-for="download in completedDownloads"
                :key="download.id"
                :download="download"
                @cancel="torrentsStore.cancelDownload"
              />
            </div>
          </TabPanel>

          <!-- Failed Downloads -->
          <TabPanel value="failed" class="p-3 sm:p-4">
            <div v-if="failedDownloads.length === 0" class="text-center py-10 sm:py-16">
              <div class="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <i class="pi pi-times-circle text-2xl sm:text-3xl text-gray-500"></i>
              </div>
              <p class="text-gray-400 text-sm sm:text-base">No failed downloads</p>
            </div>

            <div v-else class="flex flex-col gap-2 sm:gap-4 p-2 sm:p-4">
              <DownloadProgress
                v-for="download in failedDownloads"
                :key="download.id"
                :download="download"
                @cancel="torrentsStore.cancelDownload"
              />
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </div>
</template>

<style>
/* Dark mode styling for tabs */
.downloads-tabs .p-tablist {
  background: transparent !important;
  border: none !important;
}

.downloads-tabs .p-tab {
  background: transparent !important;
  border: none !important;
  color: #9ca3af !important;
  padding: 0.75rem 1rem !important;
  font-size: 0.875rem !important;
  transition: all 0.2s !important;
}

@media (max-width: 640px) {
  .downloads-tabs .p-tab {
    padding: 0.625rem 0.75rem !important;
    font-size: 0.75rem !important;
  }
}

.downloads-tabs .p-tab:hover {
  color: #e5e7eb !important;
}

.downloads-tabs .p-tab[data-p-active="true"] {
  color: #a855f7 !important;
  border-bottom: 2px solid #a855f7 !important;
}

.downloads-tabs .p-tablist-active-bar {
  display: none !important;
}

.downloads-tabs .p-tabpanels {
  background: transparent !important;
  padding: 0 !important;
}

.downloads-tabs .p-tabpanel {
  padding: 0 !important;
}
</style>
