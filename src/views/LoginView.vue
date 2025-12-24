<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'

const router = useRouter()
const authStore = useAuthStore()

const password = ref('')
const showPassword = ref(false)

const handleLogin = async () => {
  if (!password.value) {
    authStore.error = 'Please enter a password'
    return
  }

  const success = await authStore.login(password.value)
  if (success) {
    router.push('/')
  }
}

const handleKeyPress = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[#141414] p-6">
    <!-- Background gradient -->
    <div class="fixed inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#141414] to-[#0f0f0f] -z-10"></div>

    <!-- Login Card -->
    <div class="w-full max-w-md">
      <!-- Logo/Brand -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#e50914] to-[#b20710] flex items-center justify-center shadow-lg shadow-[#e50914]/20">
          <i class="pi pi-play text-3xl text-white"></i>
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">My Cinema</h1>
        <p class="text-gray-400">Enter your password to continue</p>
      </div>

      <!-- Login Form -->
      <div class="bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-zinc-800/50 p-8">
        <form @submit.prevent="handleLogin" class="space-y-6">
          <!-- Password Input -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div class="relative">
              <InputText
                v-if="showPassword"
                id="password"
                v-model="password"
                type="text"
                placeholder="Enter your password"
                class="w-full !bg-zinc-800 !border-zinc-700 !text-white focus:!border-[#e50914] !rounded-lg !py-3 !px-4"
                @keypress="handleKeyPress"
                :disabled="authStore.isLoading"
                autofocus
              />
              <Password
                v-else
                id="password"
                v-model="password"
                placeholder="Enter your password"
                :feedback="false"
                toggleMask
                class="w-full"
                inputClass="w-full !bg-zinc-800 !border-zinc-700 !text-white focus:!border-[#e50914] !rounded-lg !py-3 !px-4"
                @keypress="handleKeyPress"
                :disabled="authStore.isLoading"
                autofocus
              />
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="authStore.error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p class="text-red-400 text-sm flex items-center gap-2">
              <i class="pi pi-exclamation-circle"></i>
              {{ authStore.error }}
            </p>
          </div>

          <!-- Submit Button -->
          <Button
            type="submit"
            label="Sign In"
            :loading="authStore.isLoading"
            :disabled="authStore.isLoading || !password"
            class="w-full !py-3 !text-base !font-semibold login-btn"
          />
        </form>
      </div>

      <!-- Footer -->
      <p class="text-center text-gray-500 text-sm mt-6">
        Secure access to your media library
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-btn {
  background: linear-gradient(135deg, #e50914 0%, #b81d24 100%) !important;
  border: none !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 4px 12px rgba(229, 9, 20, 0.3) !important;
}

.login-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #f40612 0%, #d81f26 100%) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 6px 16px rgba(229, 9, 20, 0.4) !important;
}

.login-btn:disabled {
  opacity: 0.6 !important;
  cursor: not-allowed !important;
}

/* Override PrimeVue Password component styles */
:deep(.p-password) {
  width: 100%;
}

:deep(.p-password-input) {
  width: 100%;
  background: rgb(39 39 42) !important;
  border-color: rgb(63 63 70) !important;
  color: white !important;
  border-radius: 0.5rem !important;
  padding: 0.75rem 1rem !important;
}

:deep(.p-password-input:focus) {
  border-color: #e50914 !important;
  box-shadow: 0 0 0 1px #e50914 !important;
}

:deep(.p-password-toggle-icon) {
  color: rgb(156 163 175) !important;
}
</style>
