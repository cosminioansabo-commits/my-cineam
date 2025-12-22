<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useMediaStore } from '@/stores/mediaStore'
import type { MediaType, Video, CollectionDetails } from '@/types'
import { getImageUrl, getBackdropUrl, getCollectionDetails } from '@/services/tmdbService'
import { libraryService } from '@/services/libraryService'
import { getExternalRatings, type ExternalRatings } from '@/services/omdbService'
import { progressService, type WatchProgress } from '@/services/progressService'
import type { SonarrEpisode } from '@/services/libraryService'
import TorrentSearchModal from '@/components/torrents/TorrentSearchModal.vue'
import TrailerModal from '@/components/media/TrailerModal.vue'
import PlaybackModal from '@/components/media/PlaybackModal.vue'
import SeasonEpisodes from '@/components/media/SeasonEpisodes.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const router = useRouter()
const mediaStore = useMediaStore()
const toast = useToast()

const showTorrentModal = ref(false)
const showTrailerModal = ref(false)
const showPlaybackModal = ref(false)
const torrentSearchQuery = ref('')
const torrentSearchSeason = ref<number | undefined>()
const torrentSearchEpisode = ref<number | undefined>()

// Library state
const libraryStatus = ref<{ inLibrary: boolean; enabled: boolean; id?: number; hasFile?: boolean }>({ inLibrary: false, enabled: false })
const isAddingToLibrary = ref(false)

// Collection state
const collectionDetails = ref<CollectionDetails | null>(null)
const isLoadingCollection = ref(false)

// External ratings state (OMDb)
const externalRatings = ref<ExternalRatings | null>(null)

// Watch progress state (for Resume button)
const movieProgress = ref<WatchProgress | null>(null)

// TV show progress state (for Resume button)
const showProgress = ref<WatchProgress[]>([])
const sonarrEpisodes = ref<SonarrEpisode[]>([])
const tvPlaybackEpisode = ref<{ season: number; episode: number; title: string } | null>(null)

const mediaType = computed(() => route.params.type as MediaType)
const mediaId = computed(() => Number(route.params.id))

const media = computed(() => mediaStore.currentMedia)
const isLoading = computed(() => mediaStore.isLoadingDetails)

const year = computed(() => {
  if (!media.value?.releaseDate) return ''
  return new Date(media.value.releaseDate).getFullYear()
})

const fetchCollection = async () => {
  if (!media.value?.collection) {
    collectionDetails.value = null
    return
  }

  isLoadingCollection.value = true
  try {
    collectionDetails.value = await getCollectionDetails(media.value.collection.id)
  } catch (error) {
    console.error('Error fetching collection:', error)
    collectionDetails.value = null
  } finally {
    isLoadingCollection.value = false
  }
}

const fetchExternalRatings = async () => {
  if (!media.value?.imdbId) {
    externalRatings.value = null
    return
  }

  try {
    externalRatings.value = await getExternalRatings(media.value.imdbId)
  } catch (error) {
    console.error('Error fetching external ratings:', error)
    externalRatings.value = null
  }
}

const fetchMovieProgress = async () => {
  if (!media.value || mediaType.value !== 'movie') {
    movieProgress.value = null
    return
  }

  try {
    movieProgress.value = await progressService.getMovieProgress(media.value.id)
  } catch (error) {
    console.error('Error fetching movie progress:', error)
    movieProgress.value = null
  }
}

// Computed: has resume data for movie
const hasResumeProgress = computed(() => {
  return movieProgress.value && !movieProgress.value.completed && movieProgress.value.positionMs > 30000
})

// Fetch TV show progress and Sonarr episodes
const fetchShowProgress = async () => {
  if (!media.value || mediaType.value !== 'tv' || !libraryStatus.value.id) {
    showProgress.value = []
    sonarrEpisodes.value = []
    return
  }

  try {
    const [progress, episodes] = await Promise.all([
      progressService.getShowProgress(media.value.id),
      libraryService.getSeriesEpisodes(libraryStatus.value.id)
    ])
    showProgress.value = progress
    sonarrEpisodes.value = episodes
  } catch (error) {
    console.error('Error fetching show progress:', error)
    showProgress.value = []
    sonarrEpisodes.value = []
  }
}

// Computed: get the next episode to resume/play for TV shows
const nextTvEpisode = computed(() => {
  if (mediaType.value !== 'tv' || !libraryStatus.value.inLibrary) return null

  // Get downloaded episodes sorted by season and episode number
  const downloadedEpisodes = sonarrEpisodes.value
    .filter(ep => ep.hasFile && ep.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)

  if (downloadedEpisodes.length === 0) return null

  // First, check for any episode with partial progress (not completed, position > 30s)
  const partialProgress = showProgress.value
    .filter(p => !p.completed && p.positionMs > 30000)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  if (partialProgress.length > 0) {
    const resumeEp = partialProgress[0]
    // Verify this episode is still downloaded
    const isDownloaded = downloadedEpisodes.some(
      ep => ep.seasonNumber === resumeEp.seasonNumber && ep.episodeNumber === resumeEp.episodeNumber
    )
    if (isDownloaded) {
      return {
        seasonNumber: resumeEp.seasonNumber!,
        episodeNumber: resumeEp.episodeNumber!,
        hasProgress: true
      }
    }
  }

  // Find the next unwatched episode (first downloaded episode that's not completed)
  const completedSet = new Set(
    showProgress.value
      .filter(p => p.completed)
      .map(p => `${p.seasonNumber}-${p.episodeNumber}`)
  )

  for (const ep of downloadedEpisodes) {
    const key = `${ep.seasonNumber}-${ep.episodeNumber}`
    if (!completedSet.has(key)) {
      return {
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        hasProgress: false
      }
    }
  }

  // All downloaded episodes are watched - play the first one
  if (downloadedEpisodes.length > 0) {
    return {
      seasonNumber: downloadedEpisodes[0].seasonNumber,
      episodeNumber: downloadedEpisodes[0].episodeNumber,
      hasProgress: false
    }
  }

  return null
})

// Play TV show (opens the next episode to watch)
const playTvShow = () => {
  if (!nextTvEpisode.value || !media.value) return

  const { seasonNumber, episodeNumber } = nextTvEpisode.value
  tvPlaybackEpisode.value = {
    season: seasonNumber,
    episode: episodeNumber,
    title: `${media.value.title} - S${seasonNumber}E${episodeNumber}`
  }
  showPlaybackModal.value = true
}

const checkLibraryStatus = async () => {
  if (!media.value) return

  try {
    if (mediaType.value === 'movie') {
      const result = await libraryService.checkMovieInLibrary(media.value.id)
      libraryStatus.value = {
        inLibrary: result.inLibrary,
        enabled: result.enabled,
        id: result.movie?.id,
        hasFile: result.movie?.hasFile
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
  collectionDetails.value = null
  externalRatings.value = null
  movieProgress.value = null
  showProgress.value = []
  sonarrEpisodes.value = []
  tvPlaybackEpisode.value = null
  // Scroll to top on navigation
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

// Check library status, fetch collection, external ratings, and progress when media loads
watch(media, (newMedia) => {
  if (newMedia) {
    checkLibraryStatus()
    fetchCollection()
    fetchExternalRatings()
    fetchMovieProgress()
  }
})

// Fetch show progress once library status is loaded for TV shows
watch(libraryStatus, (newStatus) => {
  if (newStatus.inLibrary && newStatus.id && mediaType.value === 'tv') {
    fetchShowProgress()
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

// Recommendations from TMDB (stored in 'similar' field which contains combined recommendations)
const recommendations = computed(() => {
  return media.value?.similar || []
})

// Collection parts excluding current movie
const otherCollectionParts = computed(() => {
  if (!collectionDetails.value?.parts || !media.value) return []
  return collectionDetails.value.parts.filter(part => part.id !== media.value!.id)
})

// Box office formatting
const formatCurrency = (value: number | undefined): string => {
  if (!value || value === 0) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

const budget = computed(() => formatCurrency(media.value?.budget))
const revenue = computed(() => formatCurrency(media.value?.revenue))
const profit = computed(() => {
  if (!media.value?.budget || !media.value?.revenue) return ''
  const profitValue = media.value.revenue - media.value.budget
  return formatCurrency(profitValue)
})
const profitIsPositive = computed(() => {
  if (!media.value?.budget || !media.value?.revenue) return true
  return media.value.revenue >= media.value.budget
})

// Has box office data
const hasBoxOffice = computed(() => {
  return mediaType.value === 'movie' && (media.value?.budget || media.value?.revenue)
})

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
              <div class="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <!-- Play/Resume Button (for movies with file) -->
                <Button
                  v-if="mediaType === 'movie' && libraryStatus.inLibrary && libraryStatus.hasFile"
                  :label="hasResumeProgress ? 'Resume' : 'Play'"
                  icon="pi pi-play"
                  class="play-btn !text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4 !border-0"
                  @click="showPlaybackModal = true"
                />
                <!-- Play/Resume Button (for TV shows with downloaded episodes) -->
                <Button
                  v-if="mediaType === 'tv' && nextTvEpisode"
                  :label="nextTvEpisode.hasProgress ? 'Resume' : 'Play'"
                  icon="pi pi-play"
                  class="play-btn !text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4 !border-0"
                  @click="playTvShow"
                  v-tooltip.bottom="`S${nextTvEpisode.seasonNumber}E${nextTvEpisode.episodeNumber}`"
                />
                <Button
                  v-if="trailer"
                  label="Trailer"
                  icon="pi pi-youtube"
                  class="trailer-btn !text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4 !border-0"
                  @click="showTrailerModal = true"
                />
                <Button
                  v-if="libraryStatus.enabled"
                  :label="libraryStatus.inLibrary ? 'In Library' : 'Add to Library'"
                  :icon="isAddingToLibrary ? 'pi pi-spin pi-spinner' : (libraryStatus.inLibrary ? 'pi pi-check' : 'pi pi-plus')"
                  :severity="libraryStatus.inLibrary ? 'success' : 'secondary'"
                  :disabled="isAddingToLibrary"
                  class="!text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                  @click="toggleLibrary"
                />
                <!-- Torrent button: hidden if movie already has file -->
                <Button
                  v-if="libraryStatus.enabled && !(mediaType === 'movie' && libraryStatus.hasFile)"
                  label="Torrent"
                  icon="pi pi-download"
                  severity="help"
                  :disabled="!libraryStatus.inLibrary"
                  :title="!libraryStatus.inLibrary ? 'Add to library first to download' : 'Search for torrents'"
                  class="!text-xs sm:!text-sm !py-2 sm:!py-2.5 !px-3 sm:!px-4"
                  @click="handleMainTorrentSearch"
                />
              </div>

              <!-- style improvements -->
              <div v-if="media.tagline" class="mb-4 sm:mb-6 pl-4 border-l-2 border-purple-500/60">
                <p class="text-gray-300 italic text-sm sm:text-base lg:text-lg leading-relaxed">
                  {{ media.tagline }}
                </p>
              </div>

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
                <template v-for="(director, index) in directors" :key="director.id">
                  <RouterLink
                    :to="`/actor/${director.id}`"
                    class="text-white hover:text-purple-400 hover:underline transition-colors"
                  >
                    {{ director.name }}
                  </RouterLink>
                  <span v-if="index < directors.length - 1" class="text-white">, </span>
                </template>
              </div>

              <!-- Box Office (Movies only) -->
              <div v-if="hasBoxOffice" class="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div v-if="budget">
                  <span class="text-gray-400">Budget: </span>
                  <span class="text-white">{{ budget }}</span>
                </div>
                <div v-if="revenue">
                  <span class="text-gray-400">Revenue: </span>
                  <span class="text-white">{{ revenue }}</span>
                </div>
                <div v-if="profit">
                  <span class="text-gray-400">Profit: </span>
                  <span :class="profitIsPositive ? 'text-green-400' : 'text-red-400'">{{ profit }}</span>
                </div>
              </div>

              <!-- External Ratings & Links -->
              <div v-if="media.imdbId || externalRatings" class="flex flex-wrap items-center gap-3">
                <!-- Rotten Tomatoes -->
                <div
                  v-if="externalRatings?.rottenTomatoes"
                  class="h-8 flex items-center gap-2 px-3 bg-zinc-800 rounded"
                  :title="`Rotten Tomatoes: ${externalRatings.rottenTomatoes.rating}%`"
                >
                  <span class="text-base leading-none">🍅</span>
                  <span
                    :class="externalRatings.rottenTomatoes.rating >= 60 ? 'text-red-400' : 'text-green-400'"
                    class="font-bold text-sm"
                  >
                    {{ externalRatings.rottenTomatoes.rating }}%
                  </span>
                </div>

                <!-- Metacritic -->
                <div
                  v-if="externalRatings?.metacritic"
                  class="h-8 flex items-center gap-2 px-3 bg-zinc-800 rounded"
                  :title="`Metacritic: ${externalRatings.metacritic.rating}/100`"
                >
                  <span
                    class="w-5 h-5 flex items-center justify-center text-xs font-bold rounded"
                    :class="[
                      externalRatings.metacritic.rating >= 61 ? 'bg-green-500' :
                      externalRatings.metacritic.rating >= 40 ? 'bg-yellow-500' : 'bg-red-500',
                      'text-white'
                    ]"
                  >
                    {{ externalRatings.metacritic.rating }}
                  </span>
                  <span class="text-gray-400 text-xs">Metacritic</span>
                </div>

                <!-- IMDb Link -->
                <a
                  v-if="media.imdbId"
                  :href="`https://www.imdb.com/title/${media.imdbId}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="h-8 inline-flex items-center gap-2 px-3 bg-[#f5c518] text-black text-sm font-bold rounded hover:bg-[#e0b015] transition-colors"
                >
                  <span>IMDb</span>
                  <span v-if="externalRatings?.imdb" class="text-black/70">{{ externalRatings.imdb.rating.toFixed(1) }}</span>
                  <i class="pi pi-external-link text-xs"></i>
                </a>
              </div>

              <!-- Awards -->
              <div v-if="externalRatings?.awards" class="mt-3 text-sm">
                <span class="text-yellow-500 mr-2">🏆</span>
                <span class="text-gray-300">{{ externalRatings.awards }}</span>
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
            :sonarr-series-id="mediaType === 'tv' && libraryStatus.inLibrary ? libraryStatus.id : undefined"
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

        <!-- Collection Section (Movies only) -->
        <section v-if="collectionDetails && otherCollectionParts.length > 0" class="mt-8 sm:mt-12 md:mt-16 max-w-6xl mx-auto">
          <h2 class="row-title text-lg sm:text-xl mb-4 sm:mb-6">{{ collectionDetails.name }}</h2>
          <div class="flex gap-3 sm:gap-4 overflow-x-auto pb-4 hide-scrollbar">
            <router-link
              v-for="part in otherCollectionParts"
              :key="part.id"
              :to="`/media/movie/${part.id}`"
              class="flex-shrink-0 w-28 sm:w-40 group cursor-pointer"
            >
              <div class="aspect-2/3 rounded-lg sm:rounded-xl overflow-hidden bg-zinc-800 mb-2 sm:mb-3 shadow-lg shadow-black/30 border border-zinc-700/50 group-hover:border-purple-500/50 transition-all duration-200">
                <img
                  v-if="part.posterPath"
                  :src="getImageUrl(part.posterPath, 'w300')"
                  :alt="part.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <i class="pi pi-video text-2xl sm:text-4xl text-gray-600"></i>
                </div>
              </div>
              <p class="font-medium text-xs sm:text-sm text-white truncate">{{ part.title }}</p>
              <p class="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                {{ part.releaseDate?.slice(0, 4) || 'TBA' }}
              </p>
            </router-link>
          </div>
        </section>

        <!-- Recommendations Section -->
        <section v-if="recommendations.length > 0" class="mt-8 sm:mt-12 md:mt-16 max-w-6xl mx-auto">
          <h2 class="row-title text-lg sm:text-xl mb-4 sm:mb-6">More Like This</h2>
          <div class="flex gap-3 sm:gap-4 overflow-x-auto pb-4 hide-scrollbar">
            <router-link
              v-for="item in recommendations"
              :key="`${item.mediaType}-${item.id}`"
              :to="`/media/${item.mediaType}/${item.id}`"
              class="flex-shrink-0 w-28 sm:w-40 group cursor-pointer"
            >
              <div class="aspect-2/3 rounded-lg sm:rounded-xl overflow-hidden bg-zinc-800 mb-2 sm:mb-3 shadow-lg shadow-black/30 border border-zinc-700/50 group-hover:border-purple-500/50 transition-all duration-200">
                <img
                  v-if="item.posterPath"
                  :src="getImageUrl(item.posterPath, 'w300')"
                  :alt="item.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <i class="pi pi-video text-2xl sm:text-4xl text-gray-600"></i>
                </div>
              </div>
              <p class="font-medium text-xs sm:text-sm text-white truncate">{{ item.title }}</p>
              <p class="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                {{ item.releaseDate?.slice(0, 4) || '' }}
              </p>
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
      :original-title="media.originalTitle"
      :original-language="media.originalLanguage"
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

    <!-- Playback Modal (for movies) -->
    <PlaybackModal
      v-if="media && mediaType === 'movie'"
      v-model:visible="showPlaybackModal"
      :tmdb-id="media.id"
      media-type="movie"
      :title="media.title"
    />

    <!-- Playback Modal (for TV shows) -->
    <PlaybackModal
      v-if="media && mediaType === 'tv' && tvPlaybackEpisode"
      v-model:visible="showPlaybackModal"
      media-type="tv"
      :show-tmdb-id="media.id"
      :season-number="tvPlaybackEpisode.season"
      :episode-number="tvPlaybackEpisode.episode"
      :title="tvPlaybackEpisode.title"
    />
  </div>
</template>

<style scoped>
/* Play button with gradient */
.play-btn {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  color: white !important;
  font-weight: 600 !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;
}

.play-btn:hover {
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%) !important;
  transform: scale(1.02) !important;
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4) !important;
}

.play-btn :deep(.pi-play) {
  color: white !important;
}

/* Trailer button with YouTube-style gradient */
.trailer-btn {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%) !important;
  color: white !important;
  font-weight: 600 !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 4px 12px rgba(107, 114, 128, 0.3) !important;
}

.trailer-btn:hover {
  background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%) !important;
  transform: scale(1.02) !important;
  box-shadow: 0 6px 16px rgba(107, 114, 128, 0.4) !important;
}

.trailer-btn :deep(.pi-youtube) {
  color: #ff0000 !important;
}
</style>
