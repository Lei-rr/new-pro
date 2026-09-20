import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/features/auth'
import AppLayout from '@/app/layouts/AppLayout.vue'
import LoginPage from '@/pages/login/LoginPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { public: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/pages/dashboard/DashboardPage.vue'),
        },
        {
          path: 'dimensions',
          name: 'dimensions',
          component: () => import('@/pages/dimensions/DimensionsPage.vue'),
        },
        {
          path: 'risks',
          name: 'risks',
          component: () => import('@/pages/risks/RisksPage.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.loaded) await session.load()

  if (to.meta.public) {
    return session.authenticated ? { name: 'dashboard' } : true
  }
  return session.authenticated ? true : { name: 'login', query: { redirect: to.fullPath } }
})

export default router
