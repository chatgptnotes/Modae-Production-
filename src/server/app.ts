import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import path from 'node:path'
import {
  authorizationToken, createApprovalGateway, requestedLiveEntities,
  type ApprovalGateway, type LiveEntity,
} from './approvals.js'
import { createWorkspaceReader, createWorkspaceWriter, WorkspaceCache, type WorkspaceReader, type WorkspaceWriter } from './workspace.js'
import {
  adminUsers, ai, appVersion, locations, purgeWorkspace, sendProposalEmail,
} from './controllers/legacy.js'

type AppOptions = {
  staticDir?: string
  approvalAuth?: ApprovalGateway['authenticate']
  approvalReader?: ApprovalGateway['read']
  liveReader?: ApprovalGateway['readLive']
  approvalPublisher?: ApprovalGateway['publish']
  liveSubscriber?: ApprovalGateway['subscribe']
  workspaceReader?: WorkspaceReader
  workspaceWriter?: WorkspaceWriter
}

const isLocalOrigin = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)

function corsOptions(req: express.Request, callback: (error: Error | null, options?: cors.CorsOptions) => void) {
  const origin = req.get('origin')
  const ownOrigin = origin && `${req.protocol}://${req.get('host')}` === origin
  callback(null, { origin: !origin || ownOrigin || isLocalOrigin(origin), optionsSuccessStatus: 204 })
}

export function createApp({
  staticDir = path.resolve(process.cwd(), 'dist'),
  approvalAuth,
  approvalReader,
  liveReader,
  approvalPublisher,
  liveSubscriber,
  workspaceReader,
  workspaceWriter,
}: AppOptions = {}) {
  const app = express()
  const configuredApprovalGateway = createApprovalGateway()
  const workspaceCache = new WorkspaceCache(workspaceReader || createWorkspaceReader() || (async () => {
    throw new Error('Workspace cache is not configured.')
  }))
  const gateway = {
    authenticate: approvalAuth || configuredApprovalGateway?.authenticate,
    read: approvalReader || configuredApprovalGateway?.read,
    readLive: liveReader || configuredApprovalGateway?.readLive,
    publish: approvalPublisher || configuredApprovalGateway?.publish,
    subscribe: liveSubscriber || configuredApprovalGateway?.subscribe,
  }
  app.disable('x-powered-by')
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '2mb' }))

  app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }))
  app.get('/api/workspace/bootstrap', async (req, res, next) => {
    const token = authorizationToken(req)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!gateway.authenticate) return res.status(503).json({ ok: false, error: 'Workspace sync is not configured.' })
    try {
      if (!await gateway.authenticate(token)) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      return res.status(200).json({ ok: true, data: await workspaceCache.bootstrap() })
    } catch (error) { return next(error) }
  })
  app.post('/api/workspace/save', async (req, res, next) => {
    const token = authorizationToken(req)
    const dirty = req.body?.dirty
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!dirty || typeof dirty !== 'object' || Array.isArray(dirty)) return res.status(400).json({ ok: false, error: 'A workspace change is required.' })
    const writer = workspaceWriter || createWorkspaceWriter()
    if (!gateway.authenticate || !writer) return res.status(503).json({ ok: false, error: 'Workspace writes are not configured.' })
    try {
      if (!await gateway.authenticate(token)) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      await writer(dirty)
      workspaceCache.invalidate()
      const liveChanges = (['leads', 'opportunities', 'approvals'] as const).filter(key => key in dirty)
      if (liveChanges.length && gateway.publish) gateway.publish(liveChanges)
      return res.status(204).end()
    } catch (error) { return next(error) }
  })
  app.post('/api/ai', ai)
  app.post('/api/admin-users', adminUsers)
  app.get('/api/app-version', appVersion)
  app.get('/api/locations', locations)
  app.post('/api/purge-workspace', purgeWorkspace)
  app.post('/api/send-proposal-email', sendProposalEmail)
  app.get('/api/approvals', async (req, res, next) => {
    const token = authorizationToken(req)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!gateway.authenticate || !gateway.read) return res.status(503).json({ ok: false, error: 'Approval sync is not configured.' })
    try {
      const user = await gateway.authenticate(token)
      if (!user) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      return res.status(200).json({ ok: true, approvals: await gateway.read(token, user.id) })
    } catch (error) { return next(error) }
  })
  app.get('/api/live-data', async (req, res, next) => {
    const token = authorizationToken(req)
    const entities = requestedLiveEntities(req.query.entities)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!entities) return res.status(400).json({ ok: false, error: 'Choose one or more supported live entities.' })
    if (!gateway.authenticate) return res.status(503).json({ ok: false, error: 'Live sync is not configured.' })
    try {
      const user = await gateway.authenticate(token)
      if (!user) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      // Production reads come from the Railway cache. The injected reader is
      // retained only for endpoint tests and explicit adapter overrides.
      const data = liveReader && gateway.readLive
        ? await gateway.readLive(token, user.id, entities)
        : await workspaceCache.select(entities)
      return res.status(200).json({ ok: true, data })
    } catch (error) { return next(error) }
  })
  app.get('/api/live-events', async (req, res, next) => {
    const token = authorizationToken(req)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!gateway.authenticate || !gateway.subscribe) {
      return res.status(503).json({ ok: false, error: 'Live sync is not configured.' })
    }
    try {
      if (!await gateway.authenticate(token)) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
      res.flushHeaders()
      res.write(': connected\n\n')
      // A later publish wakes every connected browser, which then performs an
      // RLS-protected selective read for only the affected tables.
      const unsubscribe = gateway.subscribe(entities => {
        res.write(`event: changed\ndata: ${JSON.stringify({ entities })}\n\n`)
      })
      const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000)
      req.on('close', () => { clearInterval(heartbeat); unsubscribe() })
    } catch (error) { return next(error) }
  })
  app.post('/api/live-events/publish', async (req, res, next) => {
    const token = authorizationToken(req)
    const entities = requestedLiveEntities(req.body?.entities)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!entities) return res.status(400).json({ ok: false, error: 'Choose one or more supported live entities.' })
    if (!gateway.authenticate || !gateway.publish) return res.status(503).json({ ok: false, error: 'Live sync is not configured.' })
    try {
      if (!await gateway.authenticate(token)) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      gateway.publish(entities as LiveEntity[])
      return res.status(204).end()
    } catch (error) { return next(error) }
  })
  app.post('/api/approval-events/publish', async (req, res, next) => {
    const token = authorizationToken(req)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!gateway.authenticate || !gateway.publish) return res.status(503).json({ ok: false, error: 'Approval sync is not configured.' })
    try {
      if (!await gateway.authenticate(token)) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      gateway.publish(['approvals'])
      return res.status(204).end()
    } catch (error) { return next(error) }
  })
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
