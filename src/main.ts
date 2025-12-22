import './assets/main.css'
import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import ToastService from 'primevue/toastservice'

import { CinemaPreset } from './theme/preset'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: CinemaPreset,
    options: {
      darkModeSelector: '.dark-mode',
      cssLayer: false,
    },
  },
})
app.use(ToastService)

app.directive('tooltip', Tooltip)

app.mount('#app')
