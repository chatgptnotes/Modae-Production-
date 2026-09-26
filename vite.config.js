import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Vercel serverless functions under /api are not served by `vite dev`, so the
// Submission panel's quote-email call (and the AI route) would die against
// Vite's HTML fallback. This dev-only middleware mounts every api/*.js handler
// on its matching route, adapting the express-style contract they use (a JSON
// req.body plus res.status(...).json(...)) onto Node's raw response. Secrets
// from .env.local are loaded into process.env exactly as Vercel injects them,
// so local dev behaves like the deployed app — including real Gmail sending
// once GMAIL_ACCOUNT and GMAIL_APP_PASSWORD are configured (see DEPLOYMENT.md).
function vercelApiDevServer() {
  const apiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'api')
  const routes = new Map(fs.readdirSync(apiDir)
    .filter(name => name.endsWith('.js'))
    .map(name => [`/api/${name.slice(0, -3)}`, path.join(apiDir, name)]))
  const handlers = new Map()
  return {
    name: 'vercel-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      for (const [key, value] of Object.entries(loadEnv(server.config.mode, server.config.root, ''))) {
        if (!(key in process.env)) process.env[key] = value
      }
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const file = routes.get(url)
        if (!file) return next()
        try {
          if (!handlers.has(file)) handlers.set(file, (await import(pathToFileURL(file).href)).default)
          const handler = handlers.get(file)
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const raw = Buffer.concat(chunks).toString('utf8')
          try { req.body = raw ? JSON.parse(raw) : {} } catch { req.body = raw }
          res.status = code => { res.statusCode = code; return res }
          res.json = body => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(body))
          }
          await handler(req, res)
        } catch (error) {
          console.error(`API function failed on ${url}`, error?.message || error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'API function crashed — see the dev server log' }))
          } else {
            res.end()
          }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDevServer()],
  define: {
    __APP_DEPLOYMENT_ID__: JSON.stringify(
      process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'local'
    ),
  },
})
