import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import path from 'node:path'
import {
  adminUsers, ai, appVersion, locations, purgeWorkspace, sendProposalEmail,
} from './controllers/legacy.js'

type AppOptions = { staticDir?: string }

const isLocalOrigin = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)

function corsOptions(req: express.Request, callback: (error: Error | null, options?: cors.CorsOptions) => void) {
  const origin = req.get('origin')
  const ownOrigin = origin && `${req.protocol}://${req.get('host')}` === origin
  callback(null, { origin: !origin || ownOrigin || isLocalOrigin(origin), optionsSuccessStatus: 204 })
}

export function createApp({ staticDir = path.resolve(process.cwd(), 'dist') }: AppOptions = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '2mb' }))

  app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }))
  app.post('/api/ai', ai)
  app.post('/api/admin-users', adminUsers)
  app.get('/api/app-version', appVersion)
  app.get('/api/locations', locations)
  app.post('/api/purge-workspace', purgeWorkspace)
  app.post('/api/send-proposal-email', sendProposalEmail)
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'API route not found' }))

  if (staticDir) {
    app.use(express.static(staticDir))
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')))
  }

  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ ok: false, error: 'Malformed JSON request body' })
    console.error('Unhandled server error:', error)
    return res.status(500).json({ ok: false, error: 'Internal server error' })
  }
  app.use(errors)
  return app
}
