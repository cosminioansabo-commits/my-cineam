<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaStore } from '@/stores/mediaStore'
import { useListsStore } from '@/stores/listsStore'
import type { MediaType, Media, Video } from '@/types'
import { getImageUrl, getBackdropUrl } from '@/services/tmdbService'
import { libraryService } from '@/services/libraryService'
import TorrentSearchModal from '@/components/torrents/TorrentSearchModal.vue'
import TrailerModal from '@/components/media/TrailerModal.vue'
import SeasonEpisodes from '@/components/media/SeasonEpisodes.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const router = useRouter()
const mediaStore = useMediaStore()
const listsStore = useListsStore()
const toast = useToast()

const showTorrentModal = ref(false)
const showTrailerModal = ref(false)
const torrentSearchQuery = ref('')
const torrentSearchSeason = ref<number | undefined>()
const torrentSearchEpisode = ref<number | undefined>()

// Library state
const libraryStatus = ref<{ inLibrary: boolean; enabled: boolean; id?: number }>({ inLibrary: false, enabled: false })
const isAddingToLibrary = ref(false)

const mediaType = computed(() => route.params.type as MediaType)
const mediaId = computed(() => Number(route.params.id))

const media = computed(() => mediaStore.currentMedia)
const isLoading = computed(() => mediaStore.isLoadingDetails)

const year = computed(() => {
  if (!media.value?.releaseDate) return ''
  return new Date(media.value.releaseDate).getFullYear()
})

const checkLibraryStatus = async () => {
  if (!media.value) return

  try {
    if (mediaType.value === 'movie') {
      const result = await libraryService.checkMovieInLibrary(media.value.id)
      libraryStatus.value = {
        inLibrary: result.inLibrary,
        enabled: result.enabled,
        id: result.movie?.id
      }
    } else {
      // For TV shows, we need the external IDs to get TVDB ID
      // For now, try to lookup by TMDB ID
      const series = await libraryService.lookupSeriesByTmdbId(media.value.id)
      if (series) {
        const result = await libraryService.checkSeriesInLibrary(series.tvdbId)
        libraryStatus.value = {
          inLibrary: result.inLibrary,
          enabled: result.enabled,
          id: result.series?.id
        }
      }
    }
  } catch (error) {
    console.error('Error checking library status:', error)
  }
}

const toggleLibrary = async () => {
  if (!media.value || isAddingToLibrary.value) return

  isAddingToLibrary.value = true
  try {
    if (libraryStatus.value.inLibrary && libraryStatus.value.id) {
      // Remove from library
      let success = false
      if (mediaType.value === 'movie') {
        success = await libraryService.deleteMovie(libraryStatus.value.id)
      } else {
        success = await libraryService.deleteSeries(libraryStatus.value.id)
      }

      if (success) {
        libraryStatus.value = { ...libraryStatus.value, inLibrary: false, id: undefined }
        toast.add({
          severity: 'info',
          summary: 'Removed from Library',
          detail: `${media.value.title} has been removed from your library`,
          life: 3000
        })
      }
    } else {
      // Add to library
      if (mediaType.value === 'movie') {
        const movie = await libraryService.addMovie(
          media.value.id,
          media.value.title,
          year.value ? Number(year.value) : undefined
        )
        if (movie) {
          libraryStatus.value = { inLibrary: true, enabled: true, id: movie.id }
          toast.add({
            severity: 'success',
            summary: 'Added to Library',
            detail: `${media.value.title} has been added to Radarr`,
            life: 3000
          })
        }
      } else {
        // For TV shows, lookup first to get TVDB ID
        const lookup = await libraryService.lookupSeriesByTmdbId(media.value.id)
        if (lookup) {
          const series = await libraryService.addSeries(lookup.tvdbId, media.value.title)
          if (series) {
            libraryStatus.value = { inLibrary: true, enabled: true, id: series.id }
            toast.add({
              severity: 'success',
              summary: 'Added to Library',
              detail: `${media.value.title} has been added to Sonarr`,
              life: 3000
            })
          }
        } else {
          toast.add({
            severity: 'error',
            summary: 'Not Found',
            detail: 'Could not find this series in Sonarr database',
            life: 3000
          })
        }
      }
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to update library',
      life: 3000
    })
  } finally {
    isAddingToLibrary.value = false
  }
}

onMounted(() => {
  mediaStore.fetchMediaDetails(mediaType.value, mediaId.value)
})

watch([mediaType, mediaId], ([newType, newId]) => {
  mediaStore.fetchMediaDetails(newType, Number(newId))
  libraryStatus.value = { inLibrary: false, enabled: false }
  // Scroll to top on navigation
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

// Check library status when media loads
watch(media, (newMedia) => {
  if (newMedia) {
    checkLibraryStatus()
  }
})

const posterUrl = computed(() => media.value ? getImageUrl(media.value.posterPath, 'w500') : '')
const backdropUrl = computed(() => media.value ? getBackdropUrl(media.value.backdropPath, 'original') : '')

const runtime = computed(() => {
  if (!media.value?.runtime) return ''
  const hours = Math.floor(media.value.runtime / 60)
  const minutes = media.value.runtime % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
})

const ratingPercent = computed(() => {
  if (!media.value) return 0
  return Math.round(media.value.voteAverage * 10)
})

const ratingColor = computed(() => {
  const score = media.value?.voteAverage || 0
  if (score >= 7) return 'text-green-500'
  if (score >= 5) return 'text-yellow-500'
  return 'text-red-500'
})

const directors = computed(() => {
  if (!media.value?.credits?.crew) return []
  return media.value.credits.crew.filter(c => c.job === 'Director' || c.job === 'Creator')
})

const cast = computed(() => {
  return media.value?.credits?.cast || []
})

const seasons = computed(() => {
  return media.value?.seasons || []
})

const trailer = computed((): Video | null => {
  if (!media.value?.videos?.length) return null
  // First video is already the best one (sorted by priority in service)
  return media.value.videos[0]
})

// Handle episode/season torrent search from SeasonEpisodes component
const handleEpisodeTorrentSearch = (query: string, seasonNum?: number, episodeNum?: number) => {
  torrentSearchQuery.value = query
  torrentSearchSeason.value = seasonNum
  torrentSearchEpisode.value = episodeNum
  showTorrentModal.value = true
}

// Handle main Find Torrent button
const handleMainTorrentSearch = () => {
  torrentSearchQuery.value = ''
  torrentSearchSeason.value = undefined
  torrentSearchEpisode.value = undefined
  showTorrentModal.value = true
}

// List management
const isInMyList = computed(() => {
  if (!media.value) return false
  return listsStore.isInList('my-list', media.value.id, media.value.mediaType)
})

const mediaForList = computed((): Media | null => {
  if (!media.value) return null
  return {
    id: media.value.id,
    title: media.value.title,
    originalTitle: media.value.originalTitle,
    overview: media.value.overview,
    posterPath: media.value.posterPath,
    backdropPath: media.value.backdropPath,
    mediaType: media.value.mediaType,
    releaseDate: media.value.releaseDate,
    voteAverage: media.value.voteAverage,
    voteCount: media.value.voteCount,
    genreIds: media.value.genreIds,
    popularity: media.value.popularity,
  }
})

const toggleMyList = () => {
  if (!mediaForList.value) return

  if (isInMyList.value) {
    listsStore.removeFromList('my-list', mediaForList.value.id, mediaForList.value.mediaType)
  } else {
    listsStore.addToList('my-list', mediaForList.value)
  }
}

const goBack = () => {
  router.back()
}
</script>

<template>
  <div class="-mx-3 sm:-mx-6 lg:-mx-10 -mt-4 sm:-mt-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div class="h-[50vh] bg-[#181818] mb-8">
        <Skeleton width="100%" height="100%" />
      </div>
      <div class="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto">
        <Skeleton width="250px" height="375px" class="rounded-lg flex-shrink-0" />
        <div class="flex-1 space-y-4">
          <Skeleton height="3rem" width="60%" />
          <Skeleton height="1.5rem" width="40%" />
          <Skeleton height="6rem" />
          <Skeleton height="3rem" width="250px" />
        </div>
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="media">
      <!-- Hero Backdrop -->
      <div class="relative h-[40vh] sm:h-[50vh] min-h-[280px] sm:min-h-[400px] max-h-[600px] overflow-hidden">
        <img
          v-if="backdropUrl"
          :src="backdropUrl"
          :alt="media.title"
          class="w-full h-full object-cover object-top"
        />
        <div v-else class="w-full h-full bg-[#181818]"></div>

        <!-- Gradients -->
        <div class="absolute inset-0 hero-gradient"></div>
        <div class="absolute inset-0 hero-gradient-bottom"></div>

        <!-- Back button -->
        <button
          class="absolute top-16 sm:top-20 left-3 sm:left-4 md:left-8 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors z-10"
          @click="goBack"
        >
          <i class="pi pi-arrow-left text-sm sm:text-base"></i>
        </button>
      </div>

      <!-- Main content -->
      <div class="relative z-10 -mt-32 sm:-mt-48 px-3 sm:px-4 md:px-10">
        <div class="max-w-6xl mx-auto">
          <div class="flex flex-col md:flex-row gap-4 sm:gap-6 md:gap-8">
            <!-- Poster -->
            <div class="flex-shrink-0 hidden md:block">
              <img
                :src="posterUrl"
                :alt="media.title"
                class="w-64 rounded-lg shadow-2xl"
              />
            </div>

            <!-- Details -->
            <div class="flex-1">
              <!-- Title -->
              <h1 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-shadow mb-2 sm:mb-4">
                {{ media.title }}
              </h1>

              <!-- Meta info -->
              <div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4 text-sm sm:text-base">
                <span :class="[ratingColor, 'font-bold']">{{ ratingPercent }}% Match</span>
                <span class="text-gray-400">{{ year }}</span>
                <span v-if="runtime" class="text-gray-400">{{ runtime }}</span>
                <span v-if="media.numberOfSeasons" class="text-gray-400">
                  {{ media.numberOfSeasons }} Season{{ media.numberOfSeasons > 1 ? 's' : '' }}
                </span>
                <span class="px-1.5 border border-gray-500 text-gray-400 text-xs">HD</span>
              </div>

              <!-- Genres -->
              <div class="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                <span
                  v-for="genre in media.genres"
                  :key="genre.id"
                  class="px-2 sm:px-3 py-0.5 sm:py-1 bg-white/10 rounded-full text-xs sm:text-sm text-gray-300"
                >
                  {{ genre.name }}
                </span>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
                <Button
                  v-if="trailer"
                  label="Trailer"
                  icon="pi pi-play"
                  class="trailer-btn !text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4 !border-0"
                  @click="showTrailerModal = true"
                />
                <Button
                  :label="isInMyList ? 'In My List' : 'My List'"
                  :icon="isInMyList ? 'pi pi-check' : 'pi pi-plus'"
                  :severity="isInMyList ? 'success' : undefined"
                  class="!text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                  @click="toggleMyList"
                />
                <Button
                  v-if="libraryStatus.enabled"
                  :label="libraryStatus.inLibrary ? 'Library' : 'Add Library'"
                  :icon="isAddingToLibrary ? 'pi pi-spin pi-spinner' : (libraryStatus.inLibrary ? 'pi pi-database' : 'pi pi-plus-circle')"
                  :severity="libraryStatus.inLibrary ? 'info' : 'secondary'"
                  :disabled="isAddingToLibrary"
                  class="!text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                  @click="toggleLibrary"
                />
                <Button
                  label="Torrent"
                  icon="pi pi-download"
                  severity="help"
                  class="!text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                  @click="handleMainTorrentSearch"
                />
              </div>

              <!-- Tagline -->
              <p v-if="media.tagline" class="text-gray-400 italic mb-3 sm:mb-4 text-sm sm:text-lg">
                "{{ media.tagline }}"
              </p>

              <!-- Overview -->
              <div class="mb-4 sm:mb-6">
                <h3 class="text-white text-base sm:text-lg font-semibold mb-2 sm:mb-3">Overview</h3>
                <p class="text-gray-200 text-sm sm:text-base leading-relaxed">
                  {{ media.overview }}
                </p>
              </div>

              <!-- Director/Creator -->
              <div v-if="directors.length > 0" class="mb-4">
                <span class="text-gray-400">{{ mediaType === 'movie' ? 'Director' : 'Creator' }}: </span>
                <span class="text-white">{{ directors.map(d => d.name).join(', ') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Seasons & Episodes Section (TV Shows only) -->
        <section v-if="mediaType === 'tv' && seasons.length > 0" class="mt-8 sm:mt-12 md:mt-16 max-w-6xl mx-auto">
          <h2 class="row-title text-lg sm:text-xl mb-4 sm:mb-6">Seasons & Episodes</h2>
          <SeasonEpisodes
            :tv-id="media.id"
            :seasons="seasons"
            :show-title="media.title"
            @search-torrent="handleEpisodeTorrentSearch"
          />
        </section>

        <!-- Cast Section -->
        <section v-if="cast.length > 0" class="mt-8 sm:mt-12 md:mt-16 max-w-6xl mx-auto">
          <h2 class="row-title text-lg sm:text-xl mb-4 sm:mb-6">Cast</h2>
          <div class="flex gap-3 sm:gap-5 overflow-x-auto pb-4 sm:pb-6 hide-scrollbar">
            <router-link
              v-for="member in cast"
              :key="member.id"
              :to="`/actor/${member.id}`"
              class="flex-shrink-0 w-24 sm:w-36 text-center group cursor-pointer"
            >
              <div class="aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-zinc-800 mb-2 sm:mb-3 mx-auto w-20 sm:w-28 shadow-lg shadow-black/30 border border-zinc-700/50 group-hover:border-purple-500/50 transition-all duration-200">
                <img
                  v-if="member.profilePath"
                  :src="getImageUrl(member.profilePath, 'w200')"
                  :alt="member.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-zinc-800">
                  <i class="pi pi-user text-2xl sm:text-3xl text-gray-600"></i>
                </div>
              </div>
              <p class="font-semibold text-xs sm:text-sm text-white truncate px-1 group-hover:text-purple-400 transition-colors">{{ member.name }}</p>
              <p class="text-[10px] sm:text-xs text-gray-500 truncate px-1 mt-0.5 sm:mt-1">{{ member.character }}</p>
            </router-link>
          </div>
        </section>

      </div>
    </div>

    <!-- Torrent Search Modal -->
    <TorrentSearchModal
      v-if="media"
      v-model:visible="showTorrentModal"
      :title="media.title"
      :year="year ? Number(year) : undefined"
      :media-type="mediaType"
      :media-id="media.id"
      :custom-query="torrentSearchQuery || undefined"
    />

    <!-- Trailer Modal -->
    <TrailerModal
      v-if="media"
      v-model:visible="showTrailerModal"
      :video="trailer"
      :title="media.title"
    />
  </div>
</template>

<style scoped>
/* Trailer button with red gradient */
.trailer-btn {
  background: linear-gradient(135deg, #e50914 0%, #b81d24 100%) !important;
  color: white !important;
  font-weight: 600 !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 4px 12px rgba(229, 9, 20, 0.3) !important;
}

.trailer-btn:hover {
  background: linear-gradient(135deg, #f40612 0%, #d81f26 100%) !important;
  transform: scale(1.02) !important;
  box-shadow: 0 6px 16px rgba(229, 9, 20, 0.4) !important;
}

.trailer-btn :deep(.pi-play) {
  color: white !important;
}
</style>
