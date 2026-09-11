import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '@/features/auth'

import AppLayout from '@/app/layouts/AppLayout.vue'
import LoginPage from '@/pages/login/LoginPage.vue'
import DashboardPage from '@/pages/dashboard/DashboardPage.vue'
import DimensionsPage from '@/pages/dimensions/DimensionsPage.vue'
import RisksPage from '@/pages/risks/RisksPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      component: LoginPage,
      meta: { public: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', component: DashboardPage },
        { path: 'dimensions', component: DimensionsPage },
        { path: 'risks', component: RisksPage },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.loaded) {
    try {
      await session.load()
    } catch (_) {}
  }

  if (to.meta.public) {
    if (session.authenticated) {
      return '/'
    }
    return true
  }

  if (!session.authenticated) {
    return '/login'
  }

  return true
})

export default router
