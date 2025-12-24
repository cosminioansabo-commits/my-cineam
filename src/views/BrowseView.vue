<script setup lang="ts">
import { onMounted, watch, ref } from 'vue'
import { useMediaStore } from '@/stores/mediaStore'
import { useFiltersStore } from '@/stores/filtersStore'
import { useLanguage } from '@/composables/useLanguage'
import MediaGrid from '@/components/media/MediaGrid.vue'
import MediaFilters from '@/components/media/MediaFilters.vue'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'

const mediaStore = useMediaStore()
const filtersStore = useFiltersStore()
const { t } = useLanguage()

const showMobileFilters = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const debouncedBrowse = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    mediaStore.browse()
  }, 400)
}

onMounted(async () => {
  await filtersStore.loadGenres()
  mediaStore.browse()
})

// Watch for filter changes and refetch with debounce
watch(
  () => filtersStore.filters,
  () => {
    debouncedBrowse()
  },
  { deep: true }
)

const loadMore = () => {
  mediaStore.loadMoreBrowseResults()
}

const hasMore = () => {
  return mediaStore.currentPage < mediaStore.totalPages
}
</script>

<template>
  <div class="flex flex-col lg:flex-row gap-4 sm:gap-6 py-6">
    <!-- Desktop Filters Sidebar -->
    <aside class="hidden lg:block w-80 flex-shrink-0">
      <div class="sticky top-28 bg-zinc-900/80 backdrop-blur-md rounded-2xl p-6 border border-zinc-800/50 shadow-xl shadow-black/20">
        <MediaFilters />
      </div>
    </aside>

    <!-- Mobile Filter Button -->
    <div class="lg:hidden fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
      <Button
        icon="pi pi-filter"
        rounded
        class="!w-12 !h-12 sm:!w-14 sm:!h-14"
        :badge="filtersStore.activeFilterCount > 0 ? String(filtersStore.activeFilterCount) : undefined"
        badgeSeverity="contrast"
        @click="showMobileFilters = true"
      />
    </div>

    <!-- Mobile Filters Drawer -->
    <Drawer
      v-model:visible="showMobileFilters"
      position="bottom"
      :style="{ height: '80vh' }"
      :pt="{
        root: { class: 'bg-zinc-900' },
        header: { class: 'bg-zinc-900 border-b border-zinc-700 px-4 py-3' },
        content: { class: 'bg-zinc-900 p-3 sm:p-4' },
      }"
    >
      <template #header>
        <h2 class="text-base sm:text-lg font-semibold px-4">{{ t('browse.filters') }}</h2>
      </template>
      <MediaFilters />
    </Drawer>

    <!-- Main Content -->
    <main class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold">{{ t('browse.title') }}</h1>
          <p class="text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1">
            {{ t('browse.results', { count: mediaStore.totalResults.toLocaleString() }) }}
          </p>
        </div>
      </div>

      <MediaGrid
        :items="mediaStore.browseResults"
        :loading="mediaStore.isLoadingBrowse && mediaStore.browseResults.length === 0"
      />

      <!-- Load More -->
      <div
        v-if="hasMore() && !mediaStore.isLoadingBrowse"
        class="flex justify-center mt-6 sm:mt-8"
      >
        <Button
          :label="t('browse.loadMore')"
          icon="pi pi-arrow-down"
          severity="secondary"
          outlined
          class="!text-xs sm:!text-sm"
          @click="loadMore"
        />
      </div>

      <!-- Loading indicator for load more -->
      <div
        v-if="mediaStore.isLoadingBrowse && mediaStore.browseResults.length > 0"
        class="flex justify-center mt-6 sm:mt-8"
      >
        <i class="pi pi-spin pi-spinner text-xl sm:text-2xl text-purple-500"></i>
      </div>
    </main>
  </div>
</template>
