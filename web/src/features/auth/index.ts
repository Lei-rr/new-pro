import { defineStore } from 'pinia'
import { ref } from 'vue'
import { http } from '@/shared/api/http'

export interface SessionInfo {
  authenticated: boolean
  username: string | null
  dbConnected: boolean
  version: string
}

export const useSessionStore = defineStore('session', () => {
  const authenticated = ref(false)
  const username = ref<string | null>(null)
  const dbConnected = ref(false)
  const version = ref('1.0.0')
  const loaded = ref(false)

  async function load() {
    try {
      const res = await http.get<SessionInfo>('/api/auth/session')
      authenticated.value = res.authenticated
      username.value = res.username
      dbConnected.value = res.dbConnected
      version.value = res.version
      loaded.value = true
      return res
    } catch (err) {
      authenticated.value = false
      username.value = null
      loaded.value = true
      throw err
    }
  }

  async function login(user: string, pass: string) {
    const res = await http.post<{ username: string; token: string; version: string }>('/api/auth/login', {
      username: user,
      password: pass,
    })
    authenticated.value = true
    username.value = res.username
    version.value = res.version
    return res
  }

  async function logout() {
    try {
      await http.post('/api/auth/logout', {})
    } catch (_) {
      // 网络或响应失败时兜底执行本地会话注销
    } finally {
      authenticated.value = false
      username.value = null
    }
  }

  function invalidate() {
    authenticated.value = false
    username.value = null
  }

  return {
    authenticated,
    username,
    dbConnected,
    version,
    loaded,
    load,
    login,
    logout,
    invalidate,
  }
})
