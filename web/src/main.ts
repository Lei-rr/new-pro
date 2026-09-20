import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/app/App.vue'
import router from '@/app/router'
import { setUnauthorizedHandler } from '@/shared/api/http'
import { resetRealtimeConnection } from '@/shared/api/websocket'
import { useSessionStore } from '@/features/auth'
import '@/app/styles/index.css'

const app = createApp(App)
app.use(createPinia())

// 兜底渲染异常，避免单个组件报错导致整页白屏
app.config.errorHandler = (err, _instance, info) => {
  console.error(`[Vue Error] ${info}`, err)
}

const session = useSessionStore()
setUnauthorizedHandler(() => {
  resetRealtimeConnection()
  session.invalidate()
  if (router.currentRoute.value.name !== 'login') {
    void router.replace({ name: 'login' })
  }
})

app.use(router)
app.mount('#app')
