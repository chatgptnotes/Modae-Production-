import { createLeadIntakeHandler } from '../../api/lead-intake.js'
import { projectWorkspace } from '../workspaceAccess.js'
import { createWorkspaceDataHandler } from '../../api/workspace-data.js'
import adminPolicyHandler from '../../api/admin-policy.js'
import adminIntegrationsHandler from '../../api/admin-integrations.js'
import adminBackupsHandler from '../../api/admin-backups.js'
import restoredFilesHandler from '../../api/restored-files.js'
import userPreferencesHandler from '../../api/user-preferences.js'
import opportunityNumberHandler from '../../api/opportunity-number.js'
import { convertOfficeToPdf } from '../../api/_office-convert.js'
import { controller } from './controllers/legacy.js'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import path from 'node:path'
import {
  authorizationToken, createApprovalGateway, requestedLiveEntities,
  type ApprovalGateway, type LiveEntity,
} from './approvals.js'
import { createWorkspaceGenerationReader, createWorkspaceReader, createWorkspaceWriter, WorkspaceCache, type WorkspaceReader, type WorkspaceWriter } from './workspace.js'
import {
  adminUsers, ai, appVersion, locations, purgeWorkspace, sendProposalEmail,
  presence, workbookImport,
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
const configuredOrigins = () => new Set(String(process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean))
const isLoopbackHttp = (value: string, origin = false) => {
  try {
    const url = new URL(origin ? value : `http://${value}`)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
      && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
  } catch { return false }
}

function corsOptions(req: express.Request, callback: (error: Error | null, options?: cors.CorsOptions) => void) {
  const origin = req.get('origin')
  const ownOrigin = origin && `${req.protocol}://${req.get('host')}` === origin
  const allowed = !origin || Boolean(ownOrigin) || isLocalOrigin(origin) || configuredOrigins().has(origin)
  callback(null, { origin: allowed, optionsSuccessStatus: 204 })
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
  }), createWorkspaceGenerationReader() || undefined)
  const gateway = {
    authenticate: approvalAuth || configuredApprovalGateway?.authenticate,
    read: approvalReader || configuredApprovalGateway?.read,
    readLive: liveReader || configuredApprovalGateway?.readLive,
    publish: approvalPublisher || configuredApprovalGateway?.publish,
    subscribe: liveSubscriber || configuredApprovalGateway?.subscribe,
  }
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(cors(corsOptions))
  app.use('/api/admin-integrations', express.json({ limit: '32kb' }))
  app.use('/api/admin-backups', express.json({ limit: '150mb' }))
  app.use('/api/lead-intake', express.json({ limit: '9mb' }))
  app.use('/api/workspace/data', express.json({ limit: '32mb' }))
  app.use('/api/send-proposal-email', express.json({ limit: '32mb' }))
  app.use('/api/ai', express.json({ limit: '4mb' }))
  app.use('/api/document-preview', express.raw({ type: 'application/octet-stream', limit: '10mb' }))
  app.use(express.json({ limit: '2mb' }))
  app.use(['/api/workspace/save','/api/workspace/import'], (req,res,next) => {
    const deployment=process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local'
    if(req.method==='POST' && process.env.WORKSPACE_SYNC_ENABLED==='true' && deployment!=='local' && req.get('x-workspace-deployment')!==deployment) return res.status(409).json({error:'Reload after the latest deployment before saving.',code:'DEPLOYMENT_CHANGED',errorCode:'DEPLOYMENT_CHANGED'})
    next()
  })

  app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }))
  app.get('/api/workspace/bootstrap', async (req, res, next) => {
    const token = authorizationToken(req)
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })
    if (!gateway.authenticate) return res.status(503).json({ ok: false, error: 'Workspace sync is not configured.' })
    try {
      const user = await gateway.authenticate(token)
      if (!user?.profile) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      const workspace = projectWorkspace({ ...await workspaceCache.bootstrap(), config: user.config || {} }, user.profile)
      res.setHeader('x-workspace-generation', workspaceCache.generationHeader())
      return res.status(200).json({ ok: true, data: req.query.scope === 'identity' ? { users: workspace.users, config: workspace.config } : workspace })
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
      const user = await gateway.authenticate(token)
      if (!user?.profile) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      const generation = String(req.get('x-workspace-generation') || '')
      if (!await workspaceCache.acceptsSaveGeneration(generation)) {
        res.setHeader('x-workspace-generation', workspaceCache.generationHeader())
        return res.status(409).json({ ok: false, error: 'The workspace was purged. Refresh before saving.', errorCode: 'WORKSPACE_PURGED' })
      }
      if (process.env.WORKSPACE_SYNC_ENABLED === 'true' && ['leads','opportunities','approvals','proposals'].some(key=>key in dirty)) return res.status(409).json({ ok: false, error: 'Use revision-aware row saves. Reload the application.', errorCode: 'ROW_REVISIONS_REQUIRED' })
      await writer(dirty, user.profile)
      workspaceCache.invalidate()
      const liveChanges = (['leads', 'opportunities', 'approvals'] as const).filter(key => key in dirty)
      if (liveChanges.length && gateway.publish) gateway.publish(liveChanges)
      return res.status(204).end()
    } catch (error) { return next(error) }
  })
  app.post('/api/workspace/import', async (req, res, next) => {
    try {
      await workbookImport(req, res, next)
      if (req.body?.action === 'commit') workspaceCache.invalidate()
    } catch (error) { next(error) }
  })
  app.post('/api/workspace/data', controller(createWorkspaceDataHandler({ invalidate: () => workspaceCache.invalidate() })))
  const leadIntake = controller(createLeadIntakeHandler({ invalidate: () => workspaceCache.invalidate() }))
  app.get('/api/lead-intake', leadIntake)
  app.post('/api/lead-intake', leadIntake)
  app.get('/api/admin-policy', controller(adminPolicyHandler))
  app.post('/api/restored-files', controller(restoredFilesHandler))
  app.get('/api/admin-integrations', controller(adminIntegrationsHandler))
  app.post('/api/admin-integrations', controller(adminIntegrationsHandler))
  app.post('/api/admin-backups', async (req, res, next) => {
    try { await adminBackupsHandler(req, res) } catch (error) { next(error) } finally {
      if (req.body?.operation === 'restore') workspaceCache.invalidate()
    }
  })
  app.get('/api/user-preferences', controller(userPreferencesHandler))
  app.put('/api/user-preferences', controller(userPreferencesHandler))
  app.post('/api/admin-policy', async (req, res, next) => {
    try { await adminPolicyHandler(req, res) } catch (error) { next(error) } finally { workspaceCache.invalidate() }
  })
  app.post('/api/opportunity-number', controller(opportunityNumberHandler))
  app.post('/api/ai', ai)
  app.post('/api/document-preview', async (req, res) => {
    const localDemo = process.env.NODE_ENV !== 'production'
      && String(req.get('x-wintrack-local-preview') || '').toLowerCase() === 'true'
      && isLoopbackHttp(req.get('host') || '')
      && isLoopbackHttp(req.get('origin') || '', true)
    const token = authorizationToken(req)
    if (!token && !localDemo) return res.status(401).json({ ok: false, error: 'A signed-in application session is required.' })
    if (token) {
      if (!gateway.authenticate) return res.status(503).json({ ok: false, error: 'Document preview authentication is not configured.' })
      try {
        const user = await gateway.authenticate(token)
        if (!user?.profile) return res.status(401).json({ ok: false, error: 'The application session is invalid or expired.' })
      } catch (error) {
        console.error('Document preview session verification failed:', error)
        return res.status(502).json({ ok: false, error: 'The application session could not be verified.' })
      }
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ ok: false, error: 'A document file is required.' })
    if (req.body.length > 10 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'This file is larger than the 10 MB preview limit.' })
    const filename = String(req.get('x-file-name') || 'attachment').replace(/[\\/\r\n\0]/g, '_').slice(0, 180)
    try {
      const converted = await convertOfficeToPdf(req.body, filename, { maxInputBytes: 10 * 1024 * 1024, maxPdfBytes: 10 * 1024 * 1024 })
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="document-preview.pdf"', 'Cache-Control': 'no-store' })
      return res.status(200).send(converted.bytes)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This document could not be converted for preview.'
      const status = (error as any)?.code === 'OFFICE_CONVERSION_UNAVAILABLE' ? 503 : 422
      return res.status(status).json({ ok: false, error: message })
    }
  })
  app.post('/api/admin-users', async (req, res, next) => {
    try { await adminUsers(req, res, next) } finally { workspaceCache.invalidate() }
  })
  app.get('/api/app-version', appVersion)
  app.get('/api/locations', locations)
  app.post('/api/purge-workspace', async (req, res, next) => {
    try {
      await purgeWorkspace(req, res, next)
      if (res.statusCode >= 200 && res.statusCode < 300) workspaceCache.invalidate({ purge: true })
    } catch (error) { next(error) }
  })
  app.post('/api/send-proposal-email', sendProposalEmail)
  app.post('/api/presence', presence)
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
      // Production reads come from the server cache. The injected reader is
      // retained only for endpoint tests and explicit adapter overrides.
      const workspace = liveReader ? {} : await workspaceCache.bootstrap()
      const data = liveReader && gateway.readLive
        ? await gateway.readLive(token, user.id, entities)
        : Object.fromEntries(entities.map(entity => [entity, (projectWorkspace({ ...workspace, config: user.config || {} }, user.profile || {}) as Record<string, any>)[entity] || []]))
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
    if ([400, 401, 403, 409, 413, 503].includes(error.status)) {
      const message = error.status === 413 ? 'This file is larger than the 10 MB preview limit.' : error.message
      return res.status(error.status).json({ ok: false, error: message })
    }
    console.error('Unhandled server error:', error)
    return res.status(500).json({ ok: false, error: 'Internal server error' })
  }
  app.use(errors)
  return app
}
