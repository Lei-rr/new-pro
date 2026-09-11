import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/app/App.vue'
import router from '@/app/router'
import { setUnauthorizedHandler } from '@/shared/api/http'
import { useSessionStore } from '@/features/auth'
import '@/app/styles/index.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

const session = useSessionStore(pinia)
setUnauthorizedHandler(() => {
  session.invalidate()
  if (router.currentRoute.value.path !== '/login') {
    void router.replace('/login')
  }
})

app.use(router)
app.mount('#app')
