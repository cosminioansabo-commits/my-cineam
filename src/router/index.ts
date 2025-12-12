import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/browse',
      name: 'browse',
      component: () => import('@/views/BrowseView.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchView.vue'),
    },
    {
      path: '/media/:type/:id',
      name: 'media-detail',
      component: () => import('@/views/MediaDetailView.vue'),
      props: true,
    },
    {
      path: '/my-lists',
      name: 'my-lists',
      component: () => import('@/views/MyListsView.vue'),
    },
    {
      path: '/list/:id',
      name: 'list-detail',
      component: () => import('@/views/ListDetailView.vue'),
      props: true,
    },
    {
      path: '/downloads',
      name: 'downloads',
      component: () => import('@/views/DownloadsView.vue'),
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('@/views/CalendarView.vue'),
    },
    {
      path: '/actor/:id',
      name: 'actor',
      component: () => import('@/views/ActorView.vue'),
      props: true,
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
})

export default router
