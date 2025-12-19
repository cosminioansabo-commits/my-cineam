import { ref, onMounted, onUnmounted } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const canInstall = ref(false)
const isInstalled = ref(false)

export function usePWAInstall() {
  const handleBeforeInstallPrompt = (e: Event) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault()
    // Store the event so it can be triggered later
    deferredPrompt.value = e as BeforeInstallPromptEvent
    canInstall.value = true
  }

  const handleAppInstalled = () => {
    deferredPrompt.value = null
    canInstall.value = false
    isInstalled.value = true
  }

  const checkIfInstalled = () => {
    // Check if running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isInstalled.value = true
      canInstall.value = false
    }
    // Check for iOS standalone mode
    if ((navigator as { standalone?: boolean }).standalone === true) {
      isInstalled.value = true
      canInstall.value = false
    }
  }

  const installPWA = async () => {
    if (!deferredPrompt.value) return false

    // Show the install prompt
    await deferredPrompt.value.prompt()

    // Wait for the user's response
    const { outcome } = await deferredPrompt.value.userChoice

    // Clear the deferred prompt
    deferredPrompt.value = null
    canInstall.value = false

    return outcome === 'accepted'
  }

  onMounted(() => {
    checkIfInstalled()
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
  })

  return {
    canInstall,
    isInstalled,
    installPWA
  }
}
