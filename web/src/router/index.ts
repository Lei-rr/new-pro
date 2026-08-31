import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('@/views/OverviewView.vue'),
      meta: { title: '总览看板' },
    },
    {
      path: '/dimensions',
      name: 'dimensions',
      component: () => import('@/views/DimensionsView.vue'),
      meta: { title: '多维分析' },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/LogsView.vue'),
      meta: { title: '日志检索' },
    },
    {
      path: '/alerts',
      name: 'alerts',
      component: () => import('@/views/AlertsView.vue'),
      meta: { title: '系统告警' },
    },
    { path: '/cost', redirect: '/overview' },
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
});

export default router;
