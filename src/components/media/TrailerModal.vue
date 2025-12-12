<script setup lang="ts">
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import type { Video } from '@/types'

const props = defineProps<{
  visible: boolean
  video: Video | null
  title: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const youtubeUrl = computed(() => {
  if (!props.video?.key) return ''
  return `https://www.youtube.com/embed/${props.video.key}?autoplay=1&rel=0`
})
</script>

<template>
  <Dialog
    v-model:visible="isOpen"
    :header="video?.name || `${title} - Trailer`"
    modal
    dismissableMask
    :pt="{
      root: { class: 'trailer-dialog' },
      mask: { class: 'backdrop-blur-sm' }
    }"
  >
    <div class="relative w-full aspect-video bg-black">
      <iframe
        v-if="video?.key && isOpen"
        :src="youtubeUrl"
        class="absolute inset-0 w-full h-full"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
      <div v-else class="absolute inset-0 flex items-center justify-center">
        <i class="pi pi-spin pi-spinner text-4xl text-gray-500"></i>
      </div>
    </div>
  </Dialog>
</template>

<style>
/* Trailer dialog - needs to be unscoped to target PrimeVue Dialog */
.trailer-dialog.p-dialog {
  width: 100vw !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 0 !important;
}

.trailer-dialog .p-dialog-header {
  background-color: rgb(24 24 27 / 0.95) !important;
  color: white !important;
  border: none !important;
  border-bottom: 1px solid rgb(39 39 42) !important;
  padding: 0.75rem 1rem !important;
  border-radius: 0 !important;
}

.trailer-dialog .p-dialog-content {
  background-color: black !important;
  padding: 0 !important;
  border: none !important;
}

.trailer-dialog .p-dialog-header-actions button {
  color: rgb(156 163 175) !important;
}

.trailer-dialog .p-dialog-header-actions button:hover {
  color: white !important;
  background-color: rgb(63 63 70) !important;
}

/* Mobile landscape - full screen immersive mode */
@media (max-width: 639px) and (orientation: landscape) {
  .trailer-dialog.p-dialog {
    width: 100vw !important;
    height: 100vh !important;
    max-height: 100vh !important;
  }

  .trailer-dialog .p-dialog-header {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 10 !important;
    background-color: rgba(24, 24, 27, 0.8) !important;
    backdrop-filter: blur(8px) !important;
    padding: 0.5rem 1rem !important;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .trailer-dialog:hover .p-dialog-header,
  .trailer-dialog .p-dialog-header:focus-within {
    opacity: 1;
  }

  .trailer-dialog .p-dialog-content {
    height: 100vh !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  .trailer-dialog .p-dialog-content > div {
    width: 100% !important;
    height: 100% !important;
    max-height: 100vh !important;
  }

  .trailer-dialog .p-dialog-content iframe {
    width: 100% !important;
    height: 100% !important;
  }
}

@media (min-width: 640px) {
  .trailer-dialog.p-dialog {
    width: 90vw !important;
    max-width: 1200px !important;
    max-height: 90vh !important;
    margin: auto !important;
    border-radius: 0.75rem !important;
  }

  .trailer-dialog .p-dialog-header {
    border-radius: 0.75rem 0.75rem 0 0 !important;
  }

  .trailer-dialog .p-dialog-content {
    border-radius: 0 0 0.75rem 0.75rem !important;
  }
}
</style>
