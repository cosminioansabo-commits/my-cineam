<script setup lang="ts">
import type { Media } from '@/types'
import MediaCard from './MediaCard.vue'
import Card from 'primevue/card'
import Skeleton from 'primevue/skeleton'

defineProps<{
  items: Media[]
  loading?: boolean
  skeletonCount?: number
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
    <!-- Loading skeletons -->
    <template v-if="loading">
      <Card
        v-for="i in (skeletonCount || 12)"
        :key="`skeleton-${i}`"
        :pt="{
          root: { class: 'bg-[#181818] border border-zinc-800/50 shadow-lg shadow-black/30 overflow-hidden' },
          body: { class: '!p-0' },
          content: { class: '!p-0' }
        }"
      >
        <template #header>
          <Skeleton class="!w-full aspect-2/3" />
        </template>
        <template #content>
          <div class="p-2.5 sm:p-4 space-y-2 sm:space-y-3">
            <Skeleton width="75%" height="1rem" />
            <Skeleton width="50%" height="0.75rem" />
          </div>
        </template>
      </Card>
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
