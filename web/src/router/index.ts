import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/dashboard/DashboardView.vue'),
      meta: { title: '总览' },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/logs/LogsView.vue'),
      meta: { title: '实时日志' },
    },
    {
      path: '/dimensions',
      name: 'dimensions',
      component: () => import('@/views/dimensions/DimensionsView.vue'),
      meta: { title: '维度分析' },
    },
    {
      path: '/cost',
      name: 'cost',
      component: () => import('@/views/cost/CostView.vue'),
      meta: { title: '成本分析' },
    },
    {
      path: '/alerts',
      name: 'alerts',
      component: () => import('@/views/alerts/AlertsView.vue'),
      meta: { title: '告警中心' },
    },
  ],
});

export default router;
