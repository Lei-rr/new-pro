import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi } from '@/shared/api/endpoints'
import { APP_VERSION } from '@/shared/constants/version'

export const useSessionStore = defineStore('session', () => {
  const authenticated = ref(false)
  const username = ref<string | null>(null)
  const dbConnected = ref(false)
  const version = ref(APP_VERSION)
  const pulseIntervalSec = ref(3)
  const calibrationIntervalSec = ref(60)
  const loaded = ref(false)
  const loading = ref(false)

  async function load(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const info = await authApi.session()
      authenticated.value = info.authenticated
      username.value = info.username
      dbConnected.value = info.dbConnected
      version.value = info.version
      pulseIntervalSec.value = info.pulseIntervalSec
      calibrationIntervalSec.value = info.calibrationIntervalSec
    } catch {
      authenticated.value = false
      username.value = null
      dbConnected.value = false
    } finally {
      loaded.value = true
      loading.value = false
    }
  }

  async function login(user: string, pass: string): Promise<void> {
    const result = await authApi.login(user, pass)
    authenticated.value = true
    username.value = result.username
    version.value = result.version
    dbConnected.value = result.dbConnected
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      invalidate()
    }
  }

  function invalidate(): void {
    authenticated.value = false
    username.value = null
    dbConnected.value = false
  }

  return {
    authenticated,
    username,
    dbConnected,
    version,
    pulseIntervalSec,
    calibrationIntervalSec,
    loaded,
    loading,
    load,
    login,
    logout,
    invalidate,
  }
})
