import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import phoneWorkspaceCss from './scripts/phone-workspace-css.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = `http://127.0.0.1:${process.env.PORT || env.PORT || 3000}`
  return {
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [phoneWorkspaceCss()] } },
  server: { proxy: { '/api': apiTarget, '/healthz': apiTarget } },
  define: {
    __APP_DEPLOYMENT_ID__: JSON.stringify(
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.SUPERBEES_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      'local'
    ),
  },
  }
})
