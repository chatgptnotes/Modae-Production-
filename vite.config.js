import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import phoneWorkspaceCss from './scripts/phone-workspace-css.js'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [phoneWorkspaceCss()] } },
  server: { proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' } },
  define: {
    __APP_DEPLOYMENT_ID__: JSON.stringify(
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.SUPERBEES_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      'local'
    ),
  },
})
