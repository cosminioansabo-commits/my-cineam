<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaStore } from '@/stores/mediaStore'
import SearchBar from '@/components/common/SearchBar.vue'
import MediaGrid from '@/components/media/MediaGrid.vue'
import Button from 'primevue/button'

const route = useRoute()
const router = useRouter()
const mediaStore = useMediaStore()

const searchQuery = ref('')

onMounted(() => {
  const queryParam = route.query.q as string
  if (queryParam) {
    searchQuery.value = queryParam
    mediaStore.search(queryParam)
  }
})

watch(() => route.query.q, (newQuery) => {
  if (newQuery && newQuery !== searchQuery.value) {
    searchQuery.value = newQuery as string
    mediaStore.search(newQuery as string)
  }
})

const handleSearch = (query: string) => {
  if (query.trim()) {
    router.push({ name: 'search', query: { q: query.trim() } })
    mediaStore.search(query.trim())
  }
}

const loadMore = () => {
  mediaStore.loadMoreSearchResults()
}

const hasMore = () => {
  return mediaStore.currentPage < mediaStore.totalPages
}

const clearSearch = () => {
  searchQuery.value = ''
  mediaStore.clearSearch()
  router.push({ name: 'search' })
}
</script>

<template>
  <div class="space-y-4 sm:space-y-6">
    <!-- Search Header -->
    <div class="max-w-2xl mx-auto">
      <SearchBar
        v-model="searchQuery"
        :auto-focus="true"
        @search="handleSearch"
      />
    </div>

    <!-- Results info -->
    <div v-if="searchQuery && mediaStore.totalResults > 0" class="text-center">
      <p class="text-xs sm:text-sm text-gray-400">
        Found <span class="text-white font-semibold">{{ mediaStore.totalResults.toLocaleString() }}</span> results
        for "<span class="text-purple-400">{{ searchQuery }}</span>"
      </p>
    </div>

    <!-- Loading State -->
    <MediaGrid
      v-if="mediaStore.isLoadingSearch && mediaStore.searchResults.length === 0"
      :items="[]"
      :loading="true"
    />

    <!-- Results -->
    <MediaGrid
      v-else-if="mediaStore.searchResults.length > 0"
      :items="mediaStore.searchResults"
    />

    <!-- Empty State - No Query -->
    <div
      v-else-if="!searchQuery"
      class="flex flex-col items-center justify-center py-10 sm:py-16 text-center px-4"
    >
      <i class="pi pi-search text-3xl sm:text-5xl text-gray-600 mb-3 sm:mb-4"></i>
      <h2 class="text-base sm:text-xl font-semibold text-gray-400 mb-1.5 sm:mb-2">Search for movies & TV shows</h2>
      <p class="text-xs sm:text-sm text-gray-500">Enter a title to get started</p>
    </div>

    <!-- Empty State - No Results -->
    <div
      v-else-if="searchQuery && !mediaStore.isLoadingSearch && mediaStore.searchResults.length === 0"
      class="flex flex-col items-center justify-center py-10 sm:py-16 text-center px-4"
    >
      <i class="pi pi-times-circle text-3xl sm:text-5xl text-gray-600 mb-3 sm:mb-4"></i>
      <h2 class="text-base sm:text-xl font-semibold text-gray-400 mb-1.5 sm:mb-2">No results found</h2>
      <p class="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">Try a different search term</p>
      <Button
        label="Clear Search"
        severity="secondary"
        outlined
        class="!text-xs sm:!text-sm"
        @click="clearSearch"
      />
    </div>

    <!-- Load More -->
    <div
      v-if="hasMore() && !mediaStore.isLoadingSearch"
      class="flex justify-center"
    >
      <Button
        label="Load More"
        icon="pi pi-arrow-down"
        severity="secondary"
        outlined
        class="!text-xs sm:!text-sm"
        @click="loadMore"
      />
    </div>

    <!-- Loading indicator for load more -->
    <div
      v-if="mediaStore.isLoadingSearch && mediaStore.searchResults.length > 0"
      class="flex justify-center"
    >
      <i class="pi pi-spin pi-spinner text-xl sm:text-2xl text-purple-500"></i>
    </div>
  </div>
</template>
