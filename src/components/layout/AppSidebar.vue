<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import Drawer from 'primevue/drawer'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const route = useRoute()

const navLinks = [
  { path: '/', label: 'Home', icon: 'pi-home' },
  { path: '/browse', label: 'Browse', icon: 'pi-compass' },
  { path: '/search', label: 'Search', icon: 'pi-search' },
  { path: '/my-library', label: 'My Library', icon: 'pi-database' },
  { path: '/calendar', label: 'Calendar', icon: 'pi-calendar' },
  { path: '/downloads', label: 'Downloads', icon: 'pi-download' },
]

const isActiveRoute = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const closeSidebar = () => {
  emit('update:visible', false)
}
</script>

<template>
  <Drawer
    :visible="props.visible"
    @update:visible="emit('update:visible', $event)"
    :showCloseIcon="false"
    class="w-80"
  >
    <template #header>
      <div class="flex items-center justify-between w-full border-b px-4 py-2 border-zinc-700">
        <RouterLink to="/" class="flex items-center gap-1 font-bold text-xl" @click="closeSidebar">
          <span class="text-[#e50914]">MY</span>
          <span class="text-white">CINEMA</span>
        </RouterLink>
        <button
          class="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors"
          @click="closeSidebar"
        >
          <i class="pi pi-times text-gray-400"></i>
        </button>
      </div>
    </template>


      <!-- Main Navigation -->
      <nav class="flex flex-col p-4 gap-2">
        <RouterLink
          v-for="link in navLinks"
          :key="link.path"
          :to="link.path"
          class="flex items-center gap-4 p-3 rounded-xl transition-all duration-200"
          :class="[
            isActiveRoute(link.path)
              ? 'bg-[#e50914] text-white shadow-lg shadow-[#e50914]/20'
              : 'text-gray-300 hover:bg-zinc-800 hover:text-white'
          ]"
          @click="closeSidebar"
        >
          <i :class="['pi', link.icon, 'text-lg']"></i>
          <span class="font-medium">{{ link.label }}</span>
        </RouterLink>
      </nav>

  </Drawer>
</template>
