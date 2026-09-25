import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // 开发代理跟随根目录 .env 的 PORT（与后端同一来源），最后才回退默认值
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const backendPort = Number(env.PORT || process.env.PORT) || 3001

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'vue-router', 'pinia', '@vueuse/core'],
            'vendor-ui': ['reka-ui', '@lucide/vue', 'clsx', 'tailwind-merge', 'class-variance-authority'],
            'vendor-echarts': ['echarts', 'vue-echarts'],
          },
        },
      },
    },
  }
})
