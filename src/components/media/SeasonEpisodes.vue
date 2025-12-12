<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Season, SeasonDetails, Episode } from '@/types'
import { getTVSeasonDetails, getImageUrl } from '@/services/tmdbService'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'

const props = defineProps<{
  tvId: number
  seasons: Season[]
  showTitle: string
}>()

const emit = defineEmits<{
  searchTorrent: [query: string, seasonNum?: number, episodeNum?: number]
}>()

// Track loaded season details - use reactive object for better Vue reactivity
const loadedSeasons = ref<Record<number, SeasonDetails>>({})
const loadingSeasons = ref<Record<number, boolean>>({})
const expandedSeasons = ref<number[]>([])

// Load season details when expanded
const loadSeasonDetails = async (seasonNumber: number) => {
  if (loadedSeasons.value[seasonNumber] || loadingSeasons.value[seasonNumber]) {
    return
  }

  loadingSeasons.value[seasonNumber] = true
  try {
    const details = await getTVSeasonDetails(props.tvId, seasonNumber)
    if (details) {
      loadedSeasons.value[seasonNumber] = details
    }
  } catch (error) {
    console.error('Error loading season details:', error)
  } finally {
    loadingSeasons.value[seasonNumber] = false
  }
}

// Watch for accordion expansion - immediate to handle initial state
watch(expandedSeasons, (newExpanded) => {
  console.log('Expanded seasons changed:', newExpanded)
  newExpanded.forEach(index => {
    const season = props.seasons[index]
    console.log('Loading season at index', index, ':', season)
    if (season) {
      loadSeasonDetails(season.seasonNumber)
    }
  })
}, { deep: true, immediate: true })

const getSeasonEpisodes = (seasonNumber: number): Episode[] => {
  return loadedSeasons.value[seasonNumber]?.episodes || []
}

const isSeasonLoading = (seasonNumber: number): boolean => {
  return !!loadingSeasons.value[seasonNumber]
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'TBA'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatRuntime = (minutes: number | null): string => {
  if (!minutes) return ''
  return `${minutes}m`
}

const searchSeasonTorrent = (season: Season) => {
  emit('searchTorrent', `${props.showTitle} S${String(season.seasonNumber).padStart(2, '0')}`, season.seasonNumber)
}

const searchEpisodeTorrent = (episode: Episode) => {
  const seasonStr = String(episode.seasonNumber).padStart(2, '0')
  const episodeStr = String(episode.episodeNumber).padStart(2, '0')
  emit('searchTorrent', `${props.showTitle} S${seasonStr}E${episodeStr}`, episode.seasonNumber, episode.episodeNumber)
}

const isEpisodeAired = (airDate: string | null): boolean => {
  if (!airDate) return false
  return new Date(airDate) <= new Date()
}
</script>

<template>
  <div class="seasons-episodes">
    <Accordion v-model:value="expandedSeasons" multiple class="seasons-accordion">
      <AccordionPanel
        v-for="(season, index) in seasons"
        :key="season.id"
        :value="index"
        class="mb-3"
      >
        <AccordionHeader class="season-header">
          <div class="flex items-center gap-4 w-full">
            <!-- Season poster thumbnail -->
            <div class="w-12 h-18 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
              <img
                v-if="season.posterPath"
                :src="getImageUrl(season.posterPath, 'w200')"
                :alt="season.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <i class="pi pi-image text-gray-600"></i>
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold text-white">{{ season.name }}</h3>
              <div class="flex items-center gap-3 text-sm text-gray-400">
                <span>{{ season.episodeCount }} episodes</span>
                <span v-if="season.airDate">{{ formatDate(season.airDate) }}</span>
              </div>
            </div>

            <!-- Search season torrent button -->
            <Button
              icon="pi pi-download"
              severity="help"
              size="small"
              rounded
              text
              @click.stop="searchSeasonTorrent(season)"
              v-tooltip.top="'Find season torrent'"
            />
          </div>
        </AccordionHeader>

        <AccordionContent class="season-content">
          <!-- Loading state -->
          <div v-if="isSeasonLoading(season.seasonNumber)" class="flex justify-center py-8">
            <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
          </div>

          <!-- Episodes list -->
          <div v-else class="episodes-list">
            <div
              v-for="episode in getSeasonEpisodes(season.seasonNumber)"
              :key="episode.id"
              class="episode-item"
              :class="{ 'opacity-50': !isEpisodeAired(episode.airDate) }"
            >
              <div class="flex gap-4">
                <!-- Episode thumbnail -->
                <div class="w-32 h-18 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 relative">
                  <img
                    v-if="episode.stillPath"
                    :src="getImageUrl(episode.stillPath, 'w300')"
                    :alt="episode.name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <i class="pi pi-video text-2xl text-gray-600"></i>
                  </div>
                  <!-- Episode number badge -->
                  <div class="absolute bottom-1 left-1 bg-black/90 px-2 py-1 rounded text-xs font-bold text-white shadow-lg">
                    E{{ episode.episodeNumber }}
                  </div>
                </div>

                <!-- Episode info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <h4 class="font-medium text-white text-sm">
                        {{ episode.name }}
                      </h4>
                      <div class="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <span>{{ formatDate(episode.airDate) }}</span>
                        <span v-if="episode.runtime">{{ formatRuntime(episode.runtime) }}</span>
                        <span v-if="episode.voteAverage > 0" class="flex items-center gap-1">
                          <i class="pi pi-star-fill text-yellow-500 text-xs"></i>
                          {{ episode.voteAverage.toFixed(1) }}
                        </span>
                      </div>
                    </div>

                    <!-- Search episode torrent button -->
                    <Button
                      v-if="isEpisodeAired(episode.airDate)"
                      icon="pi pi-download"
                      severity="help"
                      size="small"
                      rounded
                      text
                      @click="searchEpisodeTorrent(episode)"
                      v-tooltip.left="'Find episode torrent'"
                    />
                    <span v-else class="text-xs text-gray-500 px-2 py-1 bg-zinc-800 rounded">
                      Not aired
                    </span>
                  </div>

                  <p v-if="episode.overview" class="text-xs text-gray-400 mt-2 line-clamp-2">
                    {{ episode.overview }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-if="getSeasonEpisodes(season.seasonNumber).length === 0 && !isSeasonLoading(season.seasonNumber)" class="py-8 text-center text-gray-500">
              No episodes available
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<style scoped>
.seasons-accordion :deep(.p-accordionpanel) {
  background-color: rgb(24 24 27 / 0.6);
  border-radius: 0.75rem;
  border: 1px solid rgb(39 39 42 / 0.5);
  overflow: hidden;
}

.seasons-accordion :deep(.p-accordionheader) {
  background-color: transparent;
  border: none;
  padding: 1rem;
  transition: background-color 0.2s ease;
}

.seasons-accordion :deep(.p-accordionheader:hover) {
  background-color: rgb(39 39 42 / 0.5);
}

.seasons-accordion :deep(.p-accordionheader-toggle-icon) {
  color: rgb(156 163 175);
}

.seasons-accordion :deep(.p-accordioncontent-content) {
  background-color: transparent;
  border-top: 1px solid rgb(39 39 42 / 0.5);
  padding: 1rem;
}

.episode-item {
  padding-top: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgb(39 39 42 / 0.3);
}

.episode-item:last-child {
  border-bottom: none;
}

.episode-item:first-child {
  padding-top: 0;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
