<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DownloadManager from '@/components/torrents/DownloadManager.vue'
import { useAuthStore } from '@/stores/authStore'
import { usePWAInstall } from '@/composables/usePWAInstall'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { canInstall, installPWA } = usePWAInstall()

const handleLogout = () => {
  authStore.logout()
  router.push({ name: 'login' })
}

const emit = defineEmits<{
  toggleSidebar: []
}>()

const isScrolled = ref(false)

const navLinks = [
  { path: '/', label: 'Home', icon: 'pi-home' },
  { path: '/browse', label: 'Browse', icon: 'pi-compass' },
  { path: '/my-library', label: 'My Library', icon: 'pi-database' },
  { path: '/calendar', label: 'Calendar', icon: 'pi-calendar' },
]

const isActiveRoute = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

// Scroll handler for header background
const handleScroll = () => {
  isScrolled.value = window.scrollY > 50
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
    :class="[
      isScrolled
        ? 'bg-[#141414]'
        : 'bg-gradient-to-b from-black/80 via-black/40 to-transparent'
    ]"
  >
    <div class="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-12 xl:px-16 h-14 sm:h-16 lg:h-20 flex items-center justify-between gap-2 sm:gap-4">
      <!-- Logo & Mobile Menu -->
      <div class="flex items-center gap-3 sm:gap-6">
        <button
          class="lg:hidden p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
          @click="emit('toggleSidebar')"
        >
          <i class="pi pi-bars text-lg sm:text-xl"></i>
        </button>

        <RouterLink to="/" class="flex items-center gap-0.5 sm:gap-1 font-bold text-lg sm:text-xl md:text-2xl">
          <span class="text-[#e50914]">MY</span>
          <span class="text-white">CINEMA</span>
        </RouterLink>

        <!-- Desktop Navigation -->
        <nav class="hidden lg:flex items-center gap-2">
          <RouterLink
            v-for="link in navLinks"
            :key="link.path"
            :to="link.path"
            class="relative px-5 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium group"
            :class="[
              isActiveRoute(link.path)
                ? 'text-white bg-white/10'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            ]"
          >
            <span class="relative z-10">{{ link.label }}</span>
            <!-- Active indicator -->
            <span
              v-if="isActiveRoute(link.path)"
              class="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#e50914] rounded-full"
            ></span>
          </RouterLink>
        </nav>
      </div>

      <!-- Right side -->
      <div class="flex items-center gap-2 sm:gap-4">
        <!-- Search icon -->
        <RouterLink
          to="/search"
          class="p-2 hover:bg-white/10 rounded-lg transition-colors"
          :class="isActiveRoute('/search') ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white'"
          title="Search"
        >
          <i class="pi pi-search text-lg"></i>
        </RouterLink>

        <!-- Download Manager -->
        <DownloadManager />

        <!-- PWA Install button -->
        <button
          v-if="canInstall"
          @click="installPWA"
          class="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
          title="Install App"
        >
          <i class="pi pi-download text-lg"></i>
        </button>

        <!-- Logout button (only show when auth is enabled and authenticated) -->
        <button
          v-if="authStore.authEnabled && authStore.isAuthenticated"
          @click="handleLogout"
          class="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
          title="Logout"
        >
          <i class="pi pi-sign-out text-lg"></i>
        </button>
      </div>
    </div>
  </header>
</template>
