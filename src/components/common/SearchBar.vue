<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDebounce } from '@/composables/useDebounce'
import InputText from 'primevue/inputtext'

const props = defineProps<{
  modelValue?: string
  autoFocus?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [query: string]
}>()

const router = useRouter()
const localQuery = ref(props.modelValue || '')
const debouncedQuery = useDebounce(localQuery, 300)

watch(debouncedQuery, (newVal) => {
  emit('update:modelValue', newVal)
  if (newVal.trim()) {
    emit('search', newVal.trim())
  }
})

watch(() => props.modelValue, (newVal) => {
  if (newVal !== localQuery.value) {
    localQuery.value = newVal || ''
  }
})

const handleSubmit = () => {
  if (localQuery.value.trim()) {
    emit('search', localQuery.value.trim())
    router.push({ name: 'search', query: { q: localQuery.value.trim() } })
  }
}

const clearSearch = () => {
  localQuery.value = ''
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="relative group">
    <!-- Search icon with subtle animation -->
    <div class="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 pointer-events-none">
      <i class="pi pi-search text-gray-400 text-base sm:text-lg group-focus-within:text-[#e50914] transition-colors duration-200"></i>
    </div>

    <InputText
      v-model="localQuery"
      placeholder="Search movies & TV shows..."
      class="w-full pl-10 sm:pl-14 pr-10 sm:pr-14 py-3 sm:py-4 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50 rounded-xl sm:rounded-2xl text-white text-sm sm:text-base placeholder-gray-500 focus:ring-2 focus:ring-[#e50914]/30 focus:border-[#e50914]/50 focus:bg-zinc-800 transition-all duration-200 shadow-lg shadow-black/20"
      :autofocus="autoFocus"
      @keydown.enter="handleSubmit"
    />

    <!-- Clear button with better styling -->
    <button
      v-if="localQuery"
      class="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-zinc-700/50 text-gray-400 hover:bg-zinc-600 hover:text-white transition-all duration-200"
      @click="clearSearch"
    >
      <i class="pi pi-times text-xs sm:text-sm"></i>
    </button>
  </div>
</template>
