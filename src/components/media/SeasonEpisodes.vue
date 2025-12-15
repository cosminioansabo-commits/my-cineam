<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import type { Season, SeasonDetails, Episode } from '@/types'
import { getTVSeasonDetails, getImageUrl } from '@/services/tmdbService'
import { libraryService, type SonarrEpisode, type SonarrSeasonStats } from '@/services/libraryService'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import Tag from 'primevue/tag'

const props = defineProps<{
  tvId: number
  seasons: Season[]
  showTitle: string
  sonarrSeriesId?: number // Sonarr internal series ID for fetching download status
}>()

const emit = defineEmits<{
  searchTorrent: [query: string, seasonNum?: number, episodeNum?: number]
}>()

// Track loaded season details - use reactive object for better Vue reactivity
const loadedSeasons = ref<Record<number, SeasonDetails>>({})
const loadingSeasons = ref<Record<number, boolean>>({})
const expandedSeasons = ref<number[]>([])

// Sonarr data for download status
const sonarrSeasons = ref<SonarrSeasonStats[]>([])
const sonarrEpisodes = ref<SonarrEpisode[]>([])
const sonarrDataLoaded = ref(false)
const loadingSonarrData = ref(false)

// Computed: Use Sonarr seasons when available (excluding specials), otherwise TMDB
const displaySeasons = computed(() => {
  // If Sonarr data is loaded and has seasons, use Sonarr's structure
  if (sonarrDataLoaded.value && sonarrSeasons.value.length > 0) {
    // Filter out specials (season 0) and map to display format
    return sonarrSeasons.value
      .filter(s => s.seasonNumber > 0)
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map(sonarrSeason => {
        // Try to find matching TMDB season for poster and air date
        const tmdbSeason = props.seasons.find(s => s.seasonNumber === sonarrSeason.seasonNumber)
        return {
          id: sonarrSeason.seasonNumber, // Use season number as ID
          seasonNumber: sonarrSeason.seasonNumber,
          name: tmdbSeason?.name || `Season ${sonarrSeason.seasonNumber}`,
          episodeCount: sonarrSeason.statistics?.episodeCount || 0,
          airDate: tmdbSeason?.airDate || null,
          posterPath: tmdbSeason?.posterPath || null,
          overview: tmdbSeason?.overview || ''
        } as Season
      })
  }
  // Fallback to TMDB seasons
  return props.seasons
})

// Load Sonarr data - get both series (for season stats) and episodes
const loadSonarrData = async () => {
  if (!props.sonarrSeriesId || sonarrDataLoaded.value || loadingSonarrData.value) return

  loadingSonarrData.value = true
  try {
    // Fetch series details (includes season stats) and episodes in parallel
    const [seriesDetails, episodes] = await Promise.all([
      libraryService.getSeriesDetails(props.sonarrSeriesId),
      libraryService.getSeriesEpisodes(props.sonarrSeriesId)
    ])

    if (seriesDetails) {
      sonarrSeasons.value = seriesDetails.seasons
    }
    sonarrEpisodes.value = episodes
    sonarrDataLoaded.value = true
  } catch (error) {
    console.error('Error loading Sonarr data:', error)
  } finally {
    loadingSonarrData.value = false
  }
}

// Get Sonarr season stats for a given season number
const getSonarrSeasonStats = (seasonNumber: number): SonarrSeasonStats | undefined => {
  return sonarrSeasons.value.find(s => s.seasonNumber === seasonNumber)
}

// Check if episode is downloaded using Sonarr episode data
const isEpisodeDownloaded = (seasonNumber: number, episodeNumber: number): boolean => {
  const match = sonarrEpisodes.value.find(
    ep => ep.seasonNumber === seasonNumber && ep.episodeNumber === episodeNumber && ep.hasFile
  )
  return !!match
}

// Get season download count - uses Sonarr's season statistics which are authoritative
const getSeasonDownloadCount = (seasonNumber: number): { downloaded: number; total: number } => {
  const sonarrSeason = getSonarrSeasonStats(seasonNumber)
  if (sonarrSeason?.statistics) {
    return {
      downloaded: sonarrSeason.statistics.episodeFileCount,
      total: sonarrSeason.statistics.episodeCount
    }
  }

  return { downloaded: 0, total: 0 }
}

// Load Sonarr data when sonarrSeriesId is provided
onMounted(() => {
  loadSonarrData()
})

watch(() => props.sonarrSeriesId, (newId) => {
  if (newId) {
    sonarrDataLoaded.value = false
    loadSonarrData()
  }
})

// Check if TMDB and Sonarr have mismatched season structures
// (e.g., TMDB has 1 season with 25 episodes, Sonarr has 2 seasons with 12+13 episodes)
const hasMismatchedSeasons = computed(() => {
  if (!sonarrDataLoaded.value) return false
  const tmdbSeasonCount = props.seasons.filter(s => s.seasonNumber > 0).length
  const sonarrSeasonCount = sonarrSeasons.value.filter(s => s.seasonNumber > 0).length
  return sonarrSeasonCount > tmdbSeasonCount
})

// Calculate absolute episode number for a Sonarr episode (for mapping to TMDB's single-season structure)
const getAbsoluteEpisodeNumber = (seasonNumber: number, episodeNumber: number): number => {
  let absoluteEp = 0
  const sortedSeasons = [...sonarrSeasons.value]
    .filter(s => s.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)

  for (const season of sortedSeasons) {
    if (season.seasonNumber < seasonNumber) {
      // Add all episodes from previous seasons
      absoluteEp += season.statistics?.episodeCount || 0
    } else if (season.seasonNumber === seasonNumber) {
      // Add the episode number within this season
      absoluteEp += episodeNumber
      break
    }
  }
  return absoluteEp
}

// Load season details from TMDB when expanded (for episode details like overview, thumbnail)
const loadSeasonDetails = async (seasonNumber: number) => {
  // For mismatched seasons, always load TMDB season 1 to get absolute episode data
  const tmdbSeasonToLoad = hasMismatchedSeasons.value ? 1 : seasonNumber

  if (loadedSeasons.value[tmdbSeasonToLoad] || loadingSeasons.value[tmdbSeasonToLoad]) {
    return
  }

  loadingSeasons.value[tmdbSeasonToLoad] = true
  try {
    const details = await getTVSeasonDetails(props.tvId, tmdbSeasonToLoad)
    if (details) {
      loadedSeasons.value[tmdbSeasonToLoad] = details
    }
  } catch (error) {
    console.error('Error loading season details:', error)
  } finally {
    loadingSeasons.value[tmdbSeasonToLoad] = false
  }
}

// Watch for accordion expansion - load data for expanded seasons
watch(expandedSeasons, (newExpanded) => {
  newExpanded.forEach(index => {
    const season = displaySeasons.value[index]
    if (season) {
      loadSeasonDetails(season.seasonNumber)
    }
  })
}, { deep: true, immediate: true })

// Get episodes for a season - prefer Sonarr data structure
const getSeasonEpisodes = (seasonNumber: number): Episode[] => {
  // If we have Sonarr data, use it as the source of truth for episode list
  if (sonarrDataLoaded.value) {
    const sonarrEps = sonarrEpisodes.value
      .filter(ep => ep.seasonNumber === seasonNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)

    // Get TMDB episodes for additional metadata (thumbnails, overview)
    // For mismatched seasons, use absolute episode numbering from TMDB season 1
    const tmdbSeasonNum = hasMismatchedSeasons.value ? 1 : seasonNumber
    const tmdbEpisodes = loadedSeasons.value[tmdbSeasonNum]?.episodes || []

    // Map Sonarr episodes to display format, enriching with TMDB data
    return sonarrEps.map(sonarrEp => {
      let tmdbEp: Episode | undefined

      if (hasMismatchedSeasons.value) {
        // Use absolute episode number to find TMDB episode
        const absoluteEpNum = getAbsoluteEpisodeNumber(sonarrEp.seasonNumber, sonarrEp.episodeNumber)
        tmdbEp = tmdbEpisodes.find(ep => ep.episodeNumber === absoluteEpNum)
      } else {
        // Direct season/episode match
        tmdbEp = tmdbEpisodes.find(ep => ep.episodeNumber === sonarrEp.episodeNumber)
      }

      return {
        id: sonarrEp.id,
        seasonNumber: sonarrEp.seasonNumber,
        episodeNumber: sonarrEp.episodeNumber,
        name: sonarrEp.title || tmdbEp?.name || `Episode ${sonarrEp.episodeNumber}`,
        overview: sonarrEp.overview || tmdbEp?.overview || '',
        airDate: sonarrEp.airDate || tmdbEp?.airDate || null,
        stillPath: tmdbEp?.stillPath || null,
        runtime: tmdbEp?.runtime || null,
        voteAverage: tmdbEp?.voteAverage || 0
      } as Episode
    })
  }

  // Fallback to TMDB episodes
  return loadedSeasons.value[seasonNumber]?.episodes || []
}

const isSeasonLoading = (seasonNumber: number): boolean => {
  // For mismatched seasons, check if we're loading TMDB season 1
  const tmdbSeasonToCheck = hasMismatchedSeasons.value ? 1 : seasonNumber
  return !!loadingSeasons.value[tmdbSeasonToCheck]
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
    <!-- Loading state for Sonarr data -->
    <div v-if="loadingSonarrData" class="flex items-center gap-3 py-4 text-gray-400">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="4" />
      <span class="text-sm">Loading season data...</span>
    </div>

    <Accordion v-else v-model:value="expandedSeasons" multiple class="seasons-accordion">
      <AccordionPanel
        v-for="(season, index) in displaySeasons"
        :key="season.seasonNumber"
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
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold text-white">{{ season.name }}</h3>
                <!-- Season download progress -->
                <Tag
                  v-if="sonarrSeriesId && getSeasonDownloadCount(season.seasonNumber).total > 0"
                  :severity="getSeasonDownloadCount(season.seasonNumber).downloaded === getSeasonDownloadCount(season.seasonNumber).total ? 'success' : 'secondary'"
                  class="!text-xs"
                >
                  <i class="pi pi-check mr-1" v-if="getSeasonDownloadCount(season.seasonNumber).downloaded === getSeasonDownloadCount(season.seasonNumber).total"></i>
                  {{ getSeasonDownloadCount(season.seasonNumber).downloaded }}/{{ getSeasonDownloadCount(season.seasonNumber).total }}
                </Tag>
              </div>
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
                  <!-- Downloaded indicator -->
                  <div
                    v-if="isEpisodeDownloaded(episode.seasonNumber, episode.episodeNumber)"
                    class="absolute top-1 right-1 bg-green-500 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                    v-tooltip.top="'Downloaded'"
                  >
                    <i class="pi pi-check text-white text-xs"></i>
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
