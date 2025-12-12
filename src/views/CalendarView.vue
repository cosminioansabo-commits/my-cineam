<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { libraryService, type CalendarEpisode, type SonarrSeries } from '@/services/libraryService'
import { findTVByExternalId, getImageUrl } from '@/services/tmdbService'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import SelectButton from 'primevue/selectbutton'
import TorrentSearchModal from '@/components/torrents/TorrentSearchModal.vue'

const router = useRouter()

const episodes = ref<CalendarEpisode[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const daysOptions = [
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 }
]
const selectedDays = ref(14)

// Torrent search state
const showTorrentModal = ref(false)
const torrentSearchQuery = ref('')
const currentSeries = ref<SonarrSeries | null>(null)

// Cache for TMDB data (keyed by TVDB ID)
const tmdbCache = ref<Map<number, { posterPath: string | null; tmdbId: number }>>(new Map())

const fetchTmdbDataForSeries = async (tvdbIds: number[]) => {
  const uniqueIds = [...new Set(tvdbIds)].filter(id => !tmdbCache.value.has(id))

  await Promise.all(uniqueIds.map(async (tvdbId) => {
    const result = await findTVByExternalId(tvdbId, 'tvdb_id')
    if (result) {
      tmdbCache.value.set(tvdbId, {
        posterPath: result.posterPath,
        tmdbId: result.id
      })
    }
  }))
}

const fetchCalendar = async () => {
  isLoading.value = true
  error.value = null
  try {
    episodes.value = await libraryService.getUpcomingEpisodes(selectedDays.value)

    // Fetch TMDB data for all series
    const tvdbIds = episodes.value
      .map(ep => ep.series?.tvdbId)
      .filter((id): id is number => id !== undefined)

    await fetchTmdbDataForSeries(tvdbIds)
  } catch (err) {
    console.error('Error fetching calendar:', err)
    error.value = 'Failed to load upcoming episodes. Make sure Sonarr is connected.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchCalendar()
})

// Group episodes by date
const groupedEpisodes = computed(() => {
  const groups: Record<string, CalendarEpisode[]> = {}

  episodes.value.forEach(episode => {
    const date = episode.airDate || 'Unknown Date'
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(episode)
  })

  // Sort by date
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Unknown Date') return 1
    if (b === 'Unknown Date') return -1
    return new Date(a).getTime() - new Date(b).getTime()
  })
})

const formatDate = (dateStr: string): string => {
  if (dateStr === 'Unknown Date') return dateStr
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Check if today
  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }

  // Check if tomorrow
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow'
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

const getSeriesPoster = (series: SonarrSeries | null): string => {
  if (!series) return ''
  const cached = tmdbCache.value.get(series.tvdbId)
  if (cached?.posterPath) {
    return getImageUrl(cached.posterPath, 'w200')
  }
  return ''
}

const goToSeries = (episode: CalendarEpisode) => {
  if (!episode.series) return
  const cached = tmdbCache.value.get(episode.series.tvdbId)
  if (cached) {
    router.push(`/media/tv/${cached.tmdbId}`)
  }
}

const searchEpisodeTorrent = (episode: CalendarEpisode) => {
  if (!episode.series) return
  const seasonStr = String(episode.seasonNumber).padStart(2, '0')
  const episodeStr = String(episode.episodeNumber).padStart(2, '0')
  torrentSearchQuery.value = `${episode.series.title} S${seasonStr}E${episodeStr}`
  currentSeries.value = episode.series
  showTorrentModal.value = true
}

const isAired = (airDateUtc: string | undefined): boolean => {
  if (!airDateUtc) return false
  return new Date(airDateUtc) <= new Date()
}
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10">
      <div>
        <div class="flex items-center gap-4 mb-3">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <i class="pi pi-calendar text-2xl text-white"></i>
          </div>
          <h1 class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Calendar
          </h1>
        </div>
        <p class="text-gray-400 text-lg ml-0 sm:ml-[4.5rem]">Upcoming episodes from your library</p>
      </div>

      <div class="flex items-center gap-4">
        <SelectButton
          v-model="selectedDays"
          :options="daysOptions"
          optionLabel="label"
          optionValue="value"
          @change="fetchCalendar"
          :pt="{
            root: { class: 'bg-zinc-800 rounded-lg border border-zinc-700' },
            pcToggleButton: {
              root: ({ context }: { context: { active: boolean } }) => ({
                class: [
                  'px-4 py-2 text-sm transition-colors',
                  context.active
                    ? 'bg-purple-600 text-white'
                    : 'bg-transparent text-gray-400 hover:text-white'
                ]
              })
            }
          }"
        />
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          rounded
          @click="fetchCalendar"
          :loading="isLoading"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-24">
      <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="4" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-24">
      <div class="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6 mx-auto">
        <i class="pi pi-exclamation-triangle text-4xl text-red-500"></i>
      </div>
      <p class="text-gray-400 mb-4">{{ error }}</p>
      <Button label="Retry" icon="pi pi-refresh" @click="fetchCalendar" />
    </div>

    <!-- Empty State -->
    <div v-else-if="episodes.length === 0" class="text-center py-24">
      <div class="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-6 mx-auto">
        <i class="pi pi-calendar-times text-4xl text-gray-500"></i>
      </div>
      <h3 class="text-xl font-semibold text-white mb-2">No upcoming episodes</h3>
      <p class="text-gray-400">No episodes scheduled in the next {{ selectedDays }} days.</p>
      <p class="text-gray-500 text-sm mt-2">Add TV shows to your library to see upcoming episodes here.</p>
    </div>

    <!-- Calendar Content -->
    <div v-else class="space-y-8">
      <div v-for="[date, dateEpisodes] in groupedEpisodes" :key="date" class="calendar-day">
        <!-- Date Header -->
        <div class="flex items-center gap-4 mb-4">
          <div class="w-1 h-8 bg-purple-500 rounded-full"></div>
          <h2 class="text-xl font-bold text-white">{{ formatDate(date) }}</h2>
          <span class="text-gray-500 text-sm">{{ dateEpisodes.length }} episode{{ dateEpisodes.length > 1 ? 's' : '' }}</span>
        </div>

        <!-- Episodes for this date -->
        <div class="grid gap-4 ml-5">
          <div
            v-for="episode in dateEpisodes"
            :key="episode.id"
            class="bg-zinc-900/60 rounded-xl border border-zinc-800/50 p-4 hover:border-zinc-700/50 transition-colors"
          >
            <div class="flex gap-4">
              <!-- Series Poster -->
              <div
                class="w-20 h-28 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 cursor-pointer group"
                @click="goToSeries(episode)"
              >
                <img
                  v-if="getSeriesPoster(episode.series)"
                  :src="getSeriesPoster(episode.series)"
                  :alt="episode.series?.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <i class="pi pi-desktop text-2xl text-gray-600"></i>
                </div>
              </div>

              <!-- Episode Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <h3
                      class="font-semibold text-white cursor-pointer hover:text-purple-400 transition-colors"
                      @click="goToSeries(episode)"
                    >
                      {{ episode.series?.title || 'Unknown Series' }}
                    </h3>
                    <p class="text-sm text-gray-400 mt-1">
                      S{{ String(episode.seasonNumber).padStart(2, '0') }}E{{ String(episode.episodeNumber).padStart(2, '0') }}
                      <span v-if="episode.title" class="text-gray-500"> - {{ episode.title }}</span>
                    </p>
                  </div>

                  <!-- Status Badge -->
                  <div class="flex items-center gap-2">
                    <span
                      v-if="episode.hasFile"
                      class="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400"
                    >
                      <i class="pi pi-check mr-1"></i>Downloaded
                    </span>
                    <span
                      v-else-if="isAired(episode.airDateUtc)"
                      class="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400"
                    >
                      Aired
                    </span>
                    <span
                      v-else
                      class="px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400"
                    >
                      Upcoming
                    </span>
                  </div>
                </div>

                <p v-if="episode.overview" class="text-xs text-gray-500 mt-2 line-clamp-2">
                  {{ episode.overview }}
                </p>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2 mt-3">
                  <Button
                    v-if="isAired(episode.airDateUtc) && !episode.hasFile"
                    label="Find Torrent"
                    icon="pi pi-download"
                    size="small"
                    severity="help"
                    @click="searchEpisodeTorrent(episode)"
                  />
                  <Button
                    label="View Series"
                    icon="pi pi-external-link"
                    size="small"
                    severity="secondary"
                    text
                    @click="goToSeries(episode)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Torrent Search Modal -->
    <TorrentSearchModal
      v-if="currentSeries"
      v-model:visible="showTorrentModal"
      :title="currentSeries.title"
      media-type="tv"
      :media-id="currentSeries.id"
      :custom-query="torrentSearchQuery"
    />
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
