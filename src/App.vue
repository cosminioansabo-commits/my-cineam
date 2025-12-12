<script setup lang="ts">
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import Toast from 'primevue/toast'

const sidebarVisible = ref(false)

const toggleSidebar = () => {
  sidebarVisible.value = !sidebarVisible.value
}
</script>

<template>
  <div class="dark-mode min-h-screen bg-[#141414] text-white">
    <AppHeader @toggle-sidebar="toggleSidebar" />
    <AppSidebar v-model:visible="sidebarVisible" />

    <main class="pt-16 sm:pt-20 min-h-screen">
      <div class="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-10 xl:px-14 py-4 sm:py-6">
        <RouterView />
      </div>
    </main>

    <Toast position="bottom-right" />
  </div>
</template>
