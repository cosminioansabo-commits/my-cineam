import type { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios'
import { useAuthStore } from '@/stores/authStore'
import router from '@/router'

// Endpoints that should NOT trigger logout on 401
// These are non-critical features that may fail silently
const SOFT_FAILURE_ENDPOINTS = [
  '/api/progress',
  '/continue-watching',
]

export function setupAuthInterceptor(axiosInstance: AxiosInstance): void {
  // Request interceptor - add auth token to requests
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const authStore = useAuthStore()

      if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`
      }

      return config
    },
    (error) => Promise.reject(error)
  )

  // Response interceptor - handle 401 errors
  axiosInstance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Check if this is a soft-failure endpoint
        const requestUrl = error.config?.url || ''
        const isSoftFailure = SOFT_FAILURE_ENDPOINTS.some(endpoint =>
          requestUrl.includes(endpoint)
        )

        // Only logout for critical endpoints
        if (!isSoftFailure) {
          const authStore = useAuthStore()

          // Clear auth state and redirect to login
          authStore.logout()
          router.push({ name: 'login' })
        }
      }

      return Promise.reject(error)
    }
  )
}
