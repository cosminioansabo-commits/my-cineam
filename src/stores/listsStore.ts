import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MediaList, MediaListItem, MediaType, Media } from '@/types'
import { getFromLocalStorage, saveToLocalStorage } from '@/composables/useLocalStorage'

const LISTS_STORAGE_KEY = 'my-cinema-lists'

const DEFAULT_LISTS: MediaList[] = [
  {
    id: 'my-list',
    name: 'My List',
    description: 'My saved movies and TV shows',
    icon: 'pi-bookmark',
    color: '#e50914',
    isDefault: true,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export const useListsStore = defineStore('lists', () => {
  // State
  const lists = ref<MediaList[]>(getFromLocalStorage(LISTS_STORAGE_KEY, DEFAULT_LISTS))

  // Getters
  const defaultLists = computed(() => lists.value.filter(l => l.isDefault))
  const customLists = computed(() => lists.value.filter(l => !l.isDefault))

  const getListById = (id: string) => lists.value.find(l => l.id === id)

  const isInList = (listId: string, mediaId: number, mediaType: MediaType): boolean => {
    const list = getListById(listId)
    return list?.items.some(item => item.mediaId === mediaId && item.mediaType === mediaType) ?? false
  }

  const getListsContainingMedia = (mediaId: number, mediaType: MediaType): MediaList[] => {
    return lists.value.filter(list =>
      list.items.some(item => item.mediaId === mediaId && item.mediaType === mediaType)
    )
  }

  // Actions
  function saveLists() {
    saveToLocalStorage(LISTS_STORAGE_KEY, lists.value)
  }

  function addToList(listId: string, media: Media) {
    const list = getListById(listId)
    if (!list) return

    // Check if already in list
    if (isInList(listId, media.id, media.mediaType)) return

    const item: MediaListItem = {
      mediaId: media.id,
      mediaType: media.mediaType,
      addedAt: new Date().toISOString(),
      title: media.title,
      posterPath: media.posterPath,
      releaseDate: media.releaseDate,
      voteAverage: media.voteAverage,
    }

    list.items.unshift(item)
    list.updatedAt = new Date().toISOString()
    saveLists()
  }

  function removeFromList(listId: string, mediaId: number, mediaType: MediaType) {
    const list = getListById(listId)
    if (!list) return

    const index = list.items.findIndex(
      item => item.mediaId === mediaId && item.mediaType === mediaType
    )

    if (index !== -1) {
      list.items.splice(index, 1)
      list.updatedAt = new Date().toISOString()
      saveLists()
    }
  }

  function moveToList(fromListId: string, toListId: string, mediaId: number, mediaType: MediaType) {
    const fromList = getListById(fromListId)
    const toList = getListById(toListId)
    if (!fromList || !toList) return

    const itemIndex = fromList.items.findIndex(
      item => item.mediaId === mediaId && item.mediaType === mediaType
    )

    if (itemIndex !== -1) {
      const [item] = fromList.items.splice(itemIndex, 1)
      // Check if already in target list
      if (!isInList(toListId, mediaId, mediaType)) {
        toList.items.unshift(item)
      }
      fromList.updatedAt = new Date().toISOString()
      toList.updatedAt = new Date().toISOString()
      saveLists()
    }
  }

  function markAsWatched(listId: string, mediaId: number, mediaType: MediaType) {
    const list = getListById(listId)
    if (!list) return

    const item = list.items.find(
      i => i.mediaId === mediaId && i.mediaType === mediaType
    )

    if (item) {
      item.watchedAt = new Date().toISOString()
      list.updatedAt = new Date().toISOString()
      saveLists()
    }
  }

  function updateItemRating(listId: string, mediaId: number, mediaType: MediaType, rating: number) {
    const list = getListById(listId)
    if (!list) return

    const item = list.items.find(
      i => i.mediaId === mediaId && i.mediaType === mediaType
    )

    if (item) {
      item.rating = rating
      list.updatedAt = new Date().toISOString()
      saveLists()
    }
  }

  function updateItemNotes(listId: string, mediaId: number, mediaType: MediaType, notes: string) {
    const list = getListById(listId)
    if (!list) return

    const item = list.items.find(
      i => i.mediaId === mediaId && i.mediaType === mediaType
    )

    if (item) {
      item.notes = notes
      list.updatedAt = new Date().toISOString()
      saveLists()
    }
  }

  function createList(name: string, description?: string, icon = 'pi-list', color = '#6b7280') {
    const id = `list-${Date.now()}`
    const newList: MediaList = {
      id,
      name,
      description,
      icon,
      color,
      isDefault: false,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    lists.value.push(newList)
    saveLists()
    return newList
  }

  function updateList(id: string, updates: Partial<Pick<MediaList, 'name' | 'description' | 'icon' | 'color'>>) {
    const list = getListById(id)
    if (!list || list.isDefault) return

    Object.assign(list, updates)
    list.updatedAt = new Date().toISOString()
    saveLists()
  }

  function deleteList(id: string) {
    const index = lists.value.findIndex(l => l.id === id)
    if (index === -1) return

    const list = lists.value[index]
    if (list.isDefault) return // Cannot delete default lists

    lists.value.splice(index, 1)
    saveLists()
  }

  return {
    // State
    lists,
    // Getters
    defaultLists,
    customLists,
    getListById,
    isInList,
    getListsContainingMedia,
    // Actions
    addToList,
    removeFromList,
    moveToList,
    markAsWatched,
    updateItemRating,
    updateItemNotes,
    createList,
    updateList,
    deleteList,
  }
})
