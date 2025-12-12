<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useFiltersStore } from '@/stores/filtersStore'
import { getImageUrl } from '@/services/tmdbService'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Slider from 'primevue/slider'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import ToggleSwitch from 'primevue/toggleswitch'

const filtersStore = useFiltersStore()

onMounted(() => {
  filtersStore.loadGenres()
})

const currentYear = new Date().getFullYear()

const mediaTypeOptions = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
]

const platformsWithLogos = computed(() =>
  filtersStore.streamingPlatforms.map(p => ({
    ...p,
    logo: getImageUrl(p.logo, 'w200'),
  }))
)

const selectedGenres = computed({
  get: () => filtersStore.filters.genres,
  set: (val) => filtersStore.setGenres(val),
})

const selectedPlatforms = computed({
  get: () => filtersStore.filters.platforms,
  set: (val) => filtersStore.setPlatforms(val),
})

const yearRange = computed({
  get: () => filtersStore.filters.yearRange,
  set: (val) => filtersStore.setYearRange(val as [number, number]),
})

const ratingRange = computed({
  get: () => filtersStore.filters.ratingRange,
  set: (val) => filtersStore.setRatingRange(val as [number, number]),
})
</script>

<template>
  <div class="space-y-7">
    <!-- Header -->
    <div class="flex items-center justify-between pb-4 border-b border-zinc-700/50">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[#e50914]/10 flex items-center justify-center">
          <i class="pi pi-filter text-[#e50914]"></i>
        </div>
        <h2 class="text-xl font-bold text-white">Filters</h2>
      </div>
      <Button
        v-if="filtersStore.hasActiveFilters"
        label="Clear All"
        text
        size="small"
        class="text-gray-400 hover:text-white"
        @click="filtersStore.resetFilters()"
      />
    </div>

    <!-- Active filters chips -->
    <div v-if="filtersStore.hasActiveFilters" class="flex flex-wrap gap-2">
      <Chip
        v-if="filtersStore.filters.mediaType !== 'all'"
        :label="filtersStore.filters.mediaType === 'movie' ? 'Movies' : 'TV Shows'"
        removable
        class="bg-[#e50914]/20 border border-[#e50914]/30"
        @remove="filtersStore.resetFilter('mediaType')"
      />
      <Chip
        v-if="filtersStore.filters.genres.length > 0"
        :label="`${filtersStore.filters.genres.length} genre(s)`"
        removable
        class="bg-purple-500/20 border border-purple-500/30"
        @remove="filtersStore.resetFilter('genres')"
      />
      <Chip
        v-if="filtersStore.filters.platforms.length > 0"
        :label="`${filtersStore.filters.platforms.length} platform(s)`"
        removable
        class="bg-blue-500/20 border border-blue-500/30"
        @remove="filtersStore.resetFilter('platforms')"
      />
      <Chip
        v-if="filtersStore.filters.animeOnly"
        label="Anime"
        removable
        class="bg-pink-500/20 border border-pink-500/30"
        @remove="filtersStore.resetFilter('animeOnly')"
      />
    </div>

    <!-- Media Type -->
    <div class="filter-section">
      <label class="filter-label">
        <i class="pi pi-video text-xs"></i>
        Type
      </label>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="option in mediaTypeOptions"
          :key="option.value"
          class="py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200"
          :class="[
            filtersStore.filters.mediaType === option.value
              ? 'bg-[#e50914] text-white shadow-lg shadow-[#e50914]/25'
              : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700 hover:text-white border border-zinc-700/50'
          ]"
          @click="filtersStore.setMediaType(option.value as 'all' | 'movie' | 'tv')"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Anime Toggle -->
    <div class="filter-section">
      <div class="flex items-center justify-between">
        <label class="filter-label mb-0 flex items-center gap-2">
          <span class="anime-icon" :class="{ 'anime-icon-active': filtersStore.filters.animeOnly }">アニメ</span>
          Anime Only
        </label>
        <ToggleSwitch
          :modelValue="filtersStore.filters.animeOnly"
          @update:modelValue="filtersStore.setAnimeOnly"
          :pt="{
            root: { class: 'w-11' },
            slider: { class: filtersStore.filters.animeOnly ? 'bg-pink-500' : 'bg-zinc-600' }
          }"
        />
      </div>
      <p class="text-xs text-gray-500 mt-2">Filter to show only Japanese animation</p>
    </div>

    <!-- Genres -->
    <div class="filter-section">
      <label class="filter-label">
        <i class="pi pi-tag text-xs"></i>
        Genres
      </label>
      <MultiSelect
        v-model="selectedGenres"
        :options="filtersStore.availableGenres"
        optionLabel="name"
        optionValue="id"
        placeholder="Select genres"
        display="chip"
        :maxSelectedLabels="3"
        class="w-full filter-input"
      />
    </div>

    <!-- Streaming Platforms -->
    <div class="filter-section">
      <label class="filter-label">
        <i class="pi pi-desktop text-xs"></i>
        Streaming On
      </label>
      <MultiSelect
        v-model="selectedPlatforms"
        :options="platformsWithLogos"
        optionLabel="name"
        optionValue="id"
        placeholder="Select platforms"
        display="chip"
        :maxSelectedLabels="2"
        class="w-full filter-input"
      >
        <template #option="{ option }">
          <div class="flex items-center gap-3">
            <img :src="option.logo" :alt="option.name" class="w-7 h-7 rounded-lg" />
            <span>{{ option.name }}</span>
          </div>
        </template>
      </MultiSelect>
    </div>

    <!-- Year Range -->
    <div class="filter-section">
      <div class="flex items-center justify-between mb-3">
        <label class="filter-label mb-0">
          <i class="pi pi-calendar text-xs"></i>
          Year
        </label>
        <span class="text-sm font-medium text-white bg-zinc-800 px-3 py-1 rounded-lg">
          {{ yearRange[0] }} - {{ yearRange[1] }}
        </span>
      </div>
      <div class="px-1">
        <Slider
          v-model="yearRange"
          range
          :min="1900"
          :max="currentYear"
          class="w-full"
        />
      </div>
    </div>

    <!-- Rating Range -->
    <div class="filter-section">
      <div class="flex items-center justify-between mb-3">
        <label class="filter-label mb-0">
          <i class="pi pi-star text-xs"></i>
          Rating
        </label>
        <span class="text-sm font-medium text-white bg-zinc-800 px-3 py-1 rounded-lg flex items-center gap-1">
          <i class="pi pi-star-fill text-[#f5c518] text-xs"></i>
          {{ ratingRange[0] }} - {{ ratingRange[1] }}
        </span>
      </div>
      <div class="px-1">
        <Slider
          v-model="ratingRange"
          range
          :min="0"
          :max="10"
          :step="0.5"
          class="w-full"
        />
      </div>
    </div>

    <!-- Sort By -->
    <div class="filter-section">
      <label class="filter-label">
        <i class="pi pi-sort-alt text-xs"></i>
        Sort By
      </label>
      <Select
        v-model="filtersStore.filters.sortBy"
        :options="filtersStore.sortOptions"
        optionLabel="label"
        optionValue="value"
        class="w-full filter-input"
      />
    </div>
  </div>
</template>

<style scoped>
.anime-icon {
  font-size: 10px;
  font-weight: 700;
  color: #9ca3af;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(156, 163, 175, 0.3);
  background-color: rgba(156, 163, 175, 0.1);
  transition: all 0.3s ease;
}

.anime-icon-active {
  color: #f472b6;
  border-color: rgba(244, 114, 182, 0.5);
  background-color: rgba(244, 114, 182, 0.15);
}
</style>
