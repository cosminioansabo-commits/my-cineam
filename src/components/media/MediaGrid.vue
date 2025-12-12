<script setup lang="ts">
import type { Media } from '@/types'
import MediaCard from './MediaCard.vue'
import Skeleton from 'primevue/skeleton'

defineProps<{
  items: Media[]
  loading?: boolean
  skeletonCount?: number
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4 md:gap-5 lg:gap-6">
    <!-- Loading skeletons with better styling -->
    <template v-if="loading">
      <div
        v-for="i in (skeletonCount || 12)"
        :key="`skeleton-${i}`"
        class="bg-[#181818] rounded-lg sm:rounded-xl overflow-hidden shadow-lg shadow-black/30 border border-zinc-800/50 animate-pulse"
      >
        <div class="aspect-[2/3] bg-zinc-800"></div>
        <div class="p-2.5 sm:p-4 space-y-2 sm:space-y-3">
          <div class="h-3 sm:h-4 bg-zinc-700 rounded-md w-3/4"></div>
          <div class="h-2.5 sm:h-3 bg-zinc-700/60 rounded-md w-1/2"></div>
        </div>
      </div>
    </template>

    <!-- Media cards -->
    <template v-else>
      <MediaCard
        v-for="item in items"
        :key="`${item.mediaType}-${item.id}`"
        :media="item"
      />
    </template>
  </div>

  <!-- Empty state with better styling -->
  <div
    v-if="!loading && items.length === 0"
    class="flex flex-col items-center justify-center py-12 sm:py-24 text-center"
  >
    <div class="w-16 h-16 sm:w-24 sm:h-24 rounded-xl sm:rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4 sm:mb-8 border border-zinc-700/50">
      <i class="pi pi-video text-2xl sm:text-4xl text-gray-500"></i>
    </div>
    <h3 class="text-lg sm:text-2xl font-semibold text-gray-200 mb-2 sm:mb-3">No results found</h3>
    <p class="text-gray-500 max-w-md text-sm sm:text-base px-4">Try adjusting your filters or search for something else</p>
  </div>
</template>
