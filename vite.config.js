import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:3000', '/healthz': 'http://localhost:3000' } },
  define: {
    __APP_DEPLOYMENT_ID__: JSON.stringify(
      process.env.SUPERBEES_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      'local'
    ),
  },
})
