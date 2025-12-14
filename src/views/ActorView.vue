<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getPersonDetails,
  getPersonCredits,
  getImageUrl,
  type PersonDetails,
  type PersonCombinedCredits,
} from '@/services/tmdbService'
import Skeleton from 'primevue/skeleton'

const route = useRoute()
const router = useRouter()

const person = ref<PersonDetails | null>(null)
const credits = ref<PersonCombinedCredits | null>(null)
const isLoading = ref(true)
const showFullBio = ref(false)

const personId = computed(() => Number(route.params.id))

const fetchPerson = async () => {
  isLoading.value = true
  try {
    const [personData, creditsData] = await Promise.all([
      getPersonDetails(personId.value),
      getPersonCredits(personId.value),
    ])
    person.value = personData
    credits.value = creditsData
  } catch (error) {
    console.error('Error fetching person:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchPerson)

watch(personId, () => {
  fetchPerson()
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

const age = computed(() => {
  if (!person.value?.birthday) return null
  const birth = new Date(person.value.birthday)
  const end = person.value.deathday ? new Date(person.value.deathday) : new Date()
  let age = end.getFullYear() - birth.getFullYear()
  const monthDiff = end.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    age--
  }
  return age
})

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const truncatedBio = computed(() => {
  if (!person.value?.biography) return ''
  if (person.value.biography.length <= 500 || showFullBio.value) {
    return person.value.biography
  }
  return person.value.biography.slice(0, 500) + '...'
})

// Known For: top items sorted by vote_count (like TMDB website)
// Uses the already-fetched combined_credits data
const knownFor = computed(() => {
  if (!credits.value || !person.value) return []

  const isActor = person.value.knownForDepartment === 'Acting'

  // Get relevant credits based on department
  const relevantCredits = isActor ? credits.value.cast : credits.value.crew

  // Filter, deduplicate, and sort by vote_count
  const unique = relevantCredits
    .filter(c => c.posterPath)
    .filter((item, index, self) =>
      index === self.findIndex(t => t.id === item.id && t.mediaType === item.mediaType)
    )
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, 10)

  return unique
})

const filmography = computed(() => {
  if (!credits.value) return []

  // Combine cast and crew credits
  const allCredits = [...credits.value.cast, ...credits.value.crew]

  // Remove duplicates - keep the one with character/job info
  const unique = allCredits.filter((item, index, self) => {
    const firstIndex = self.findIndex(t => t.id === item.id && t.mediaType === item.mediaType)
    return index === firstIndex
  })

  // Sort by release date (newest first) and filter those with posters
  return unique
    .filter(c => c.posterPath)
    .sort((a, b) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      return dateB - dateA
    })
    .slice(0, 50)
})

const goToMedia = (id: number, mediaType: string) => {
  router.push(`/media/${mediaType}/${id}`)
}

const goBack = () => {
  router.back()
}

const profileUrl = computed(() => {
  return person.value?.profilePath
    ? getImageUrl(person.value.profilePath, 'w500')
    : ''
})
</script>

<template>
  <div class="-mx-3 sm:-mx-6 lg:-mx-10 -mt-4 sm:-mt-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div class="max-w-6xl mx-auto">
        <div class="flex flex-col md:flex-row gap-8">
          <Skeleton width="250px" height="375px" class="rounded-lg flex-shrink-0" />
          <div class="flex-1 space-y-4">
            <Skeleton height="3rem" width="60%" />
            <Skeleton height="1.5rem" width="40%" />
            <Skeleton height="6rem" />
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="person" class="px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
      <!-- Back button -->
      <button
        class="mb-4 sm:mb-6 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
        @click="goBack"
      >
        <i class="pi pi-arrow-left text-sm sm:text-base"></i>
      </button>

      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex flex-col md:flex-row gap-6 md:gap-10 mb-8 sm:mb-12">
          <!-- Profile Image -->
          <div class="flex-shrink-0 mx-auto md:mx-0">
            <div class="w-48 sm:w-64 aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-800 shadow-2xl">
              <img
                v-if="profileUrl"
                :src="profileUrl"
                :alt="person.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <i class="pi pi-user text-6xl text-gray-600"></i>
              </div>
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 text-center md:text-left">
            <h1 class="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
              {{ person.name }}
            </h1>

            <!-- Meta info -->
            <div class="flex flex-wrap justify-center md:justify-start items-center gap-3 sm:gap-4 text-sm sm:text-base text-gray-400 mb-4 sm:mb-6">
              <span v-if="person.knownForDepartment" class="flex items-center gap-2">
                <i class="pi pi-star text-purple-500"></i>
                {{ person.knownForDepartment }}
              </span>
              <span v-if="person.birthday" class="flex items-center gap-2">
                <i class="pi pi-calendar text-blue-500"></i>
                {{ formatDate(person.birthday) }}
                <span v-if="age" class="text-gray-500">({{ age }} years{{ person.deathday ? ' old at death' : '' }})</span>
              </span>
              <span v-if="person.deathday" class="flex items-center gap-2 text-gray-500">
                <i class="pi pi-minus"></i>
                {{ formatDate(person.deathday) }}
              </span>
              <span v-if="person.placeOfBirth" class="flex items-center gap-2">
                <i class="pi pi-map-marker text-red-500"></i>
                {{ person.placeOfBirth }}
              </span>
            </div>

            <!-- Biography -->
            <div v-if="person.biography" class="mb-6">
              <h3 class="text-gray-400 text-xs sm:text-sm mb-2">Biography</h3>
              <p class="text-gray-200 text-sm sm:text-base leading-relaxed whitespace-pre-line">
                {{ truncatedBio }}
              </p>
              <button
                v-if="person.biography.length > 500"
                class="text-purple-400 hover:text-purple-300 text-sm mt-2 transition-colors"
                @click="showFullBio = !showFullBio"
              >
                {{ showFullBio ? 'Show less' : 'Read more' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Known For Section -->
        <section v-if="knownFor.length > 0" class="mb-8 sm:mb-12">
          <h2 class="text-lg sm:text-2xl font-bold text-white mb-4 sm:mb-6">Known For</h2>
          <div class="flex gap-3 sm:gap-4 overflow-x-auto pb-4 hide-scrollbar">
            <div
              v-for="item in knownFor"
              :key="`known-${item.mediaType}-${item.id}`"
              class="flex-shrink-0 w-28 sm:w-40 cursor-pointer group"
              @click="goToMedia(item.id, item.mediaType)"
            >
              <div class="aspect-[2/3] rounded-lg sm:rounded-xl overflow-hidden bg-zinc-800 mb-2 sm:mb-3 shadow-lg shadow-black/30 border border-zinc-700/50 group-hover:border-purple-500/50 transition-all duration-200">
                <img
                  :src="getImageUrl(item.posterPath, 'w300')"
                  :alt="item.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <p class="font-medium text-xs sm:text-sm text-white truncate">{{ item.title }}</p>
              <p class="text-[10px] sm:text-xs text-gray-600 mt-0.5">
                {{ item.releaseDate?.slice(0, 4) || 'TBA' }}
              </p>
            </div>
          </div>
        </section>

        <!-- Filmography Section -->
        <section v-if="filmography.length > 0">
          <h2 class="text-lg sm:text-2xl font-bold text-white mb-4 sm:mb-6">Filmography</h2>
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
            <div
              v-for="credit in filmography"
              :key="`film-${credit.mediaType}-${credit.id}`"
              class="cursor-pointer group"
              @click="goToMedia(credit.id, credit.mediaType)"
            >
              <div class="aspect-[2/3] rounded-lg sm:rounded-xl overflow-hidden bg-zinc-800 mb-2 shadow-lg shadow-black/30 border border-zinc-700/50 group-hover:border-purple-500/50 transition-all duration-200">
                <img
                  :src="getImageUrl(credit.posterPath, 'w300')"
                  :alt="credit.title"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <p class="font-medium text-xs sm:text-sm text-white truncate">{{ credit.title }}</p>
              <p v-if="credit.character" class="text-[10px] sm:text-xs text-gray-500 truncate mt-0.5">
                {{ credit.character }}
              </p>
              <p v-else-if="credit.job" class="text-[10px] sm:text-xs text-gray-500 truncate mt-0.5">
                {{ credit.job }}
              </p>
              <p class="text-[10px] sm:text-xs text-gray-600 mt-0.5">
                {{ credit.releaseDate?.slice(0, 4) || 'TBA' }}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
