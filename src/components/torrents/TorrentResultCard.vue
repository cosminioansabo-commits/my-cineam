<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import type { TorrentResult } from '@/types/torrent'

const props = defineProps<{
  torrent: TorrentResult
  loading?: boolean
}>()

const emit = defineEmits<{
  download: [torrent: TorrentResult]
}>()

// Parse torrent name to extract show title, season, episode info
const parsedInfo = computed(() => {
  let name = props.torrent.name
  // Remove indexer suffix like [FileList.io]
  name = name.replace(/\s*\[.*?\]\s*$/, '')

  // Try to extract season and episode info
  // Patterns: S01E02, S01.E02, Season 1 Episode 2, etc.
  const seasonEpisodeMatch = name.match(/[.\s]S(\d{1,2})E(\d{1,2})/i)
  const seasonOnlyMatch = name.match(/[.\s]S(\d{1,2})(?![E\d])/i)
  const completeMatch = name.match(/complete|full.?series|all.?seasons/i)

  let title = name
  let season: number | null = null
  let episode: number | null = null
  let isComplete = false

  if (seasonEpisodeMatch) {
    season = parseInt(seasonEpisodeMatch[1])
    episode = parseInt(seasonEpisodeMatch[2])
    // Get title before the season/episode marker
    title = name.substring(0, seasonEpisodeMatch.index || 0)
  } else if (seasonOnlyMatch) {
    season = parseInt(seasonOnlyMatch[1])
    // Get title before the season marker
    title = name.substring(0, seasonOnlyMatch.index || 0)
  } else if (completeMatch) {
    isComplete = true
    title = name.substring(0, completeMatch.index || 0)
  }

  // Clean up title: replace dots and underscores with spaces, remove quality markers
  title = title
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(1080p|2160p|720p|480p|4K|UHD|HDR|BluRay|WEB-DL|WEBRip|HDTV|BRRip|DVDRip).*$/i, '')
    .trim()

  // Extract codec/format info for subtitle
  const codecMatch = name.match(/(x264|x265|H\.?264|H\.?265|HEVC|AVC|DDP?5\.1|Atmos|TrueHD)/i)
  const sourceMatch = name.match(/(BluRay|WEB-DL|WEBRip|HDTV|BRRip|NF|AMZN|DSNP|HMAX)/i)

  let formatInfo = ''
  if (sourceMatch) formatInfo = sourceMatch[1].toUpperCase()
  if (codecMatch) formatInfo += formatInfo ? ` ${codecMatch[1]}` : codecMatch[1]

  return { title, season, episode, isComplete, formatInfo }
})

// Format season/episode display
const seasonEpisodeLabel = computed(() => {
  const { season, episode, isComplete } = parsedInfo.value

  if (isComplete) return 'Complete Series'
  if (season && episode) return `Season ${season}, Episode ${episode}`
  if (season) return `Season ${season}`
  return null
})

// Extract source/indexer from name
const indexer = computed(() => {
  const match = props.torrent.name.match(/\[([^\]]+)\]\s*$/)
  return match ? match[1] : props.torrent.source.toUpperCase()
})

const is4K = computed(() => {
  const q = props.torrent.quality?.toLowerCase()
  return q?.includes('2160') || q?.includes('4k')
})

const qualityClass = computed(() => {
  const q = props.torrent.quality?.toLowerCase()
  if (q?.includes('2160') || q?.includes('4k')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  if (q?.includes('1080')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  if (q?.includes('720')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
})

const seedsClass = computed(() => {
  const seeds = props.torrent.seeds
  if (seeds >= 100) return 'text-green-400'
  if (seeds >= 20) return 'text-yellow-400'
  return 'text-red-400'
})
</script>

<template>
  <div class="group bg-[#1e1e1e] hover:bg-[#252525] rounded-lg p-3 sm:p-4 transition-all duration-200 border border-transparent hover:border-[#333]">
    <div class="flex items-start gap-2.5 sm:gap-4">
      <!-- Quality Badge -->
      <div
        class="flex-shrink-0 w-11 h-11 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center font-bold text-[10px] sm:text-xs border"
        :class="qualityClass"
      >
        <div class="text-center">
          <div v-if="is4K">4K</div>
          <div v-else>{{ torrent.quality || '?' }}</div>
        </div>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <!-- Title -->
        <h4 class="text-xs sm:text-sm font-semibold text-white leading-tight line-clamp-2">
          {{ parsedInfo.title }}
        </h4>

        <!-- Season/Episode Tags -->
        <div v-if="parsedInfo.season || parsedInfo.isComplete" class="flex flex-wrap gap-1 sm:gap-1.5 mt-1 sm:mt-1.5">
          <Tag
            v-if="parsedInfo.isComplete"
            value="Complete Series"
            severity="success"
            class="!text-[9px] sm:!text-[10px] !px-1.5 sm:!px-2 !py-0.5"
          />
          <Tag
            v-else-if="parsedInfo.season"
            :value="`S${String(parsedInfo.season).padStart(2, '0')}`"
            severity="info"
            class="!text-[9px] sm:!text-[10px] !px-1.5 sm:!px-2 !py-0.5"
          />
          <Tag
            v-if="parsedInfo.episode"
            :value="`E${String(parsedInfo.episode).padStart(2, '0')}`"
            severity="secondary"
            class="!text-[9px] sm:!text-[10px] !px-1.5 sm:!px-2 !py-0.5"
          />
          <Tag
            v-if="parsedInfo.formatInfo"
            :value="parsedInfo.formatInfo"
            severity="contrast"
            class="!text-[9px] sm:!text-[10px] !px-1.5 sm:!px-2 !py-0.5"
          />
        </div>

        <div class="flex flex-wrap items-center gap-x-2.5 sm:gap-x-4 gap-y-1 text-[10px] sm:text-xs mt-1.5 sm:mt-2">
          <!-- Source -->
          <span class="text-gray-500">
            <i class="pi pi-server mr-0.5 sm:mr-1 text-[9px] sm:text-xs"></i>{{ indexer }}
          </span>

          <!-- Size -->
          <span class="text-gray-400">
            <i class="pi pi-database mr-0.5 sm:mr-1 text-[9px] sm:text-xs"></i>{{ torrent.size }}
          </span>

          <!-- Seeds -->
          <span :class="seedsClass">
            <i class="pi pi-arrow-up mr-0.5 sm:mr-1 text-[9px] sm:text-xs"></i>{{ torrent.seeds }}
          </span>

          <!-- Peers -->
          <span class="text-gray-500">
            <i class="pi pi-arrow-down mr-0.5 sm:mr-1 text-[9px] sm:text-xs"></i>{{ torrent.peers }}
          </span>
        </div>
      </div>

      <!-- Download Button -->
      <div class="flex-shrink-0">
        <Button
          icon="pi pi-download"
          severity="success"
          rounded
          :loading="loading"
          @click="emit('download', torrent)"
          aria-label="Download"
          class="!w-8 !h-8 sm:!w-10 sm:!h-10"
        />
      </div>
    </div>
  </div>
</template>
