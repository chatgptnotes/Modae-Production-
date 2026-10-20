import { workspaceView } from '../src/workspaceViews.js'
import { validateWorkspaceView, workspaceViewPlan } from '../src/workspaceViewPlan.js'
import { readiness, nextActionWith, actionableClarifications, isClarificationResolved, isClarificationCoveredByAnswer } from '../src/gates.js'
import { newProposal } from '../src/seed.js'
import { workspaceSync, admitSync, admitSyncActor } from './_workspace-sync.js'
import { assertReservedOpportunityIds } from './_opportunity-reservations.js'
import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { canAccessPage, canPerform, effectiveAccess, isNonSalesUser } from '../src/accessPolicy.js'
import { assertWorkspaceRowWrite, projectWorkspace, canReadPricing, workspaceProjectionVersion } from '../src/workspaceAccess.js'
import { createWorkspaceReader } from '../src/server/workspace.js'
import { validateApprovalCommand, executeApprovalCommand, approvalErrorStatus, admitApprovalCommand } from './_approval-command.js'
import { assertNoApprovalCommandWrite, publicAuditEvent } from '../src/approvalWriteGuard.js'

const TABLES = ['records', 'leads', 'opportunities', 'approvals', 'settings', 'proposals', 'spares_lines', 'clarifications', 'audit', 'price_lists', 'price_list_versions']
const keys = { spares_lines: 'sparesLines', price_lists: 'priceLists' }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fail = (message, status = 403, code) => { throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) }) }
const rows = result => { if (result.error) throw result.error; return result.data || [] }

function validateSelect(input) {
  if (input?.operation !== 'select' || !TABLES.includes(input.table)) fail('Unsupported workspace table.', 400)
  if (!Array.isArray(input.filters) || input.filters.length > 8) fail('Invalid query filters.', 400)
  for (const filter of input.filters) {
    if (!Array.isArray(filter) || filter.length !== 3) fail('Invalid query filter.', 400)
    const [op, column, value] = filter
    if (!['eq', 'is', 'in'].includes(op) || !['entity', 'id', 'deleted_at'].includes(column)
      || (column === 'entity' && input.table !== 'records') || (op === 'in' && (!Array.isArray(value) || value.length > 1000))) fail('Invalid query filter.', 400)
  }
}

async function selectRows(client, input, state, profile) {
  let query = client.from(input.table).select(input.table === 'records' ? 'entity,id,data,rev,deleted_at' : 'id,data,rev,deleted_at')
  for (const [op, column, value] of input.filters) query = query[op](column, value)
  const data = projectedRows(input.table, rows(await query), state, profile)
  if (input.single && data.length > 1) fail('Expected one workspace row.', 400)
  return { data: input.options?.head ? null : input.single ? data[0] || null : data, count: data.length, error: null }
}

export function projectedRows(table, records, state, profile) {
  if (table === 'records') records = records.filter(row => row.entity === 'state')
  if (table === 'audit') records = records.map(row => ({ ...row, data: publicAuditEvent(row.data) }))
  const config = state.config || {}
  const override = table === 'records' ? { ...state, ...Object.fromEntries(records.filter(row => row.entity === 'state').map(row => [row.id, row.data])) }
    : table === 'settings' ? state
    : ['proposals'].includes(table) ? { ...state, proposals: { ...state.proposals, ...Object.fromEntries(records.map(row => [row.id, row.data])) } }
    : { ...state, [keys[table] || table]: records.map(row => row.data) }
  const projected = projectWorkspace(override, profile)
  if (effectiveAccess(profile, config).isAdmin) return records.map(row => table === 'records' && row.entity === 'state' && row.id === 'users' ? { ...row, data: projected.users } : row)
  if (isNonSalesUser(profile) && table === 'settings') return []
  if (table === 'settings') return records.filter(row => row.id === 'config')
  if (['price_lists', 'price_list_versions'].includes(table)) return canAccessPage(profile, 'pricelists', config) || canPerform(profile, 'proposals.price', config) ? records : []
  return records.flatMap(row => {
    if (table === 'records') {
      if (row.entity !== 'state') return projectedRows(row.entity, [row], state, profile)
      if (!(row.id in projected)) return []
      return [{ ...row, data: projected[row.id] }]
    }
    const slice = projected[keys[table] || table]
    const data = Array.isArray(slice) ? slice.find(item => item.id === row.id) : slice?.[row.id]
    return data === undefined ? [] : [{ ...row, data }]
  })
}

export function createWorkspaceDataHandler({ getClient = getAdminSupabaseClient, getReader = createWorkspaceReader, invalidate = () => {} } = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    if (req.body?.operation === 'sync_capabilities') {
      res.setHeader?.('Cache-Control','no-store')
      return res.status(200).json({ enabled: process.env.WORKSPACE_SYNC_ENABLED === 'true', deploymentId: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local' })
    }
    const client = getClient()
    if (!client) return res.status(503).json({ error: 'Shared workspace data is not configured.' })
    let releaseCommand
    try {
      const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) fail('Sign in to access workspace data.', 401)
      if (['versions','read_records'].includes(req.body?.operation)) {
        if (req.body.operation === 'versions' && process.env.WORKSPACE_SYNC_ENABLED !== 'true') return res.status(200).json({ enabled: false })
        releaseCommand = admitSync(token)
        res.setHeader?.('Cache-Control', 'no-store')
      }
      const deployment=process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local'
      if (process.env.WORKSPACE_SYNC_ENABLED==='true' && deployment!=='local' && ['rpc','delete','approval_decision','lead_conversion'].includes(req.body?.operation) && req.headers?.['x-workspace-deployment']!==deployment) fail('The application was deployed again. Reload before saving.',409,'DEPLOYMENT_CHANGED')
      if (req.body?.operation === 'approval_decision') releaseCommand = admitApprovalCommand(token)
      const auth = await client.auth.getUser(token)
      if (auth.error || !auth.data?.user) fail('Your session has expired.', 401)
      if (req.body?.operation === 'approval_decision') {
        const command = validateApprovalCommand(req.body.command, String(req.headers?.['x-workspace-generation'] ?? ''))
        const data = await executeApprovalCommand(client, auth.data.user, command)
        invalidate()
        return res.status(200).json({ data, error: null })
      }
      if (['versions','read_records'].includes(req.body?.operation)) {
        admitSyncActor(auth.data.user.id)
        return res.status(200).json({...await workspaceSync(client, auth.data.user, req.body),deploymentId:process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local'})
      }
      const profile = await activeProfile(client, auth.data.user)
      if (!profile) fail('This account no longer has workspace access.', 403, 'WORKSPACE_ACCESS_REVOKED')
      const isView = req.body?.operation === 'view'
      if (isView) validateWorkspaceView(req.body.view)
      const reader = getReader({ includeRevisions: isView, ...(isView ? { view: req.body.view } : {}) })
      if (!reader) fail('Workspace data is not configured.', 503)
      const state = await reader()
      const config = state.config || {}
      const input = req.body || {}
      if (input.operation === 'view') {
        const { _revisions, _navigation, _loaded, _coverage, _readMetrics, ...business } = state
        // Lightweight owner indexes supply authorization context for related
        // consolidated slices. They are removed again before returning editors.
        const context = { ...business }
        if (_navigation) for (const key of ['opportunities', 'leads']) {
          context[key] = [...new Map([ ...(_navigation[key] || []), ...(business[key] || []) ].map(row => [row.id, row])).values()]
        }
        const projected = projectWorkspace(context, profile)
        const signals = Object.fromEntries((workspaceViewPlan(input.view).signals ? projected.opportunities || [] : []).map(opp => {
          const proposal = projected.proposals?.[opp.id] || newProposal(opp.id, opp, { validityDays: config.proposalValidityDays, currencyRates: config.currencyRates, costingDefaults: config.costingDefaults })
          return [opp.id, { blockers: readiness(opp, proposal, projected), action: nextActionWith(opp, proposal, projected),
            clarificationDue: actionableClarifications(opp, projected).filter(row => !isClarificationResolved(row) && !isClarificationCoveredByAnswer(opp, row, projected.clarifications || [])).map(row => row.due).filter(Boolean).sort()[0] || '' }]
        }))
        const result = workspaceView({ ...projected, ...(_loaded ? { _loaded, _coverage } : {}), ...(_navigation ? { _navigation: projectWorkspace(_navigation, profile) } : {}), _revisions }, input.view, signals)
        // Revisions accompany only rows actually returned, after permission projection.
        const revisions = []
        for (const [table, entries] of Object.entries(_revisions || {})) {
          const key = table === 'settings' ? 'config' : keys[table] || table
          for (const row of entries) {
            const slice = table === 'records' ? result.slices[row.id] : result.slices[key]
            const data = table === 'records' || table === 'settings' ? slice : Array.isArray(slice) ? slice.find(item => item.id === row.id) : slice?.[row.id]
            if (data !== undefined && (table !== 'records' || row.entity === 'state')) revisions.push({ entity: table === 'records' ? 'state' : table, id: row.id, rev: Number(row.rev) || 0 })
          }
        }
        result.slices._approvalRevisions = Object.fromEntries(revisions.filter(row => row.entity === 'approvals').map(row => [row.id, row.rev]))
        res.setHeader?.('Cache-Control', 'no-store')
        if (_readMetrics) res.setHeader?.('Server-Timing', `database;dur=${_readMetrics.databaseMs}, queries;desc="${_readMetrics.queries}"`)
        return res.status(200).json({ ...result, revisions, accessVersion: workspaceProjectionVersion(profile, config), generation: String(state.workspaceGeneration || 0) })
      }
      if (input.operation === 'select' || input.operation === 'select_many') {
        const queries = input.operation === 'select' ? [input] : input.queries
        if (!Array.isArray(queries) || !queries.length || queries.length > 20) fail('Choose between one and twenty read queries.', 400)
        queries.forEach(validateSelect)
        if (input.operation === 'select') return res.status(200).json(await selectRows(client, input, state, profile))
        // One fresh authorization snapshot per batch. Never cache an actor's
        // permissions between requests, and never accept writes in a read batch.
        const results = await Promise.all(queries.map(async query => {
          try { return await selectRows(client, query, state, profile) }
          catch (error) { return { data: null, error: { message: 'Workspace query failed.', code: error.code || String(error.status || 503) } } }
        }))
        return res.status(200).json({ results })
      }
      if (input.operation === 'lead_conversion') {
        const leadId = String(input.leadId || '')
        const opportunity = input.opportunity
        if (!leadId || !opportunity?.id || !Number.isSafeInteger(input.leadRev) || input.leadRev < 1) fail('Invalid lead conversion.',400)
        const lead = (state.leads || []).find(row => row.id === leadId)
        if (!lead) fail('Lead is unavailable.',404)
        if (!canPerform(profile,'opportunities.create',config) || !canPerform(profile,'leads.edit',config)) fail('Lead conversion is not permitted.')
        assertWorkspaceRowWrite(profile,'leads',lead,{...lead,status:'Converted'},config,state,leadId)
        const next = { ...opportunity, sourceLeadId:leadId, sourceLeadSnapshot:lead, source:opportunity.source ?? lead.source ?? '', originator:lead.originator || null, sourceSubject:lead.subject || '', sourceBody:lead.body || '', attachments:lead.attachments || [] }
        assertWorkspaceRowWrite(profile,'opportunities',undefined,next,config,state,next.id)
        if (!lead.oppId) await assertReservedOpportunityIds(client,[next.id],auth.data.user.id)
        const generation = Number(req.headers?.['x-workspace-generation'])
        if (!Number.isSafeInteger(generation) || generation !== Number(state.workspaceGeneration || 0)) fail('Workspace changed. Reload before converting.',409,'WORKSPACE_PURGED')
        const result = await client.rpc('convert_lead_to_opportunity', {p_lead_id:leadId,p_lead_rev:input.leadRev,p_opportunity:next,p_actor:auth.data.user.id,p_expected_generation:generation})
        if (result.error) throw result.error
        invalidate()
        return res.status(200).json({data:result.data,error:null})
      }
      if (input.operation !== 'rpc' || input.name !== 'save_rows') fail('Unsupported workspace operation.', 400)
      const { p_entity: entity, p_rows: requested } = input.args || {}
      const table = entity === 'state' ? 'records' : entity
      if (!TABLES.includes(table) || table === 'records' && entity !== 'state'
        || !Array.isArray(requested) || !requested.length || requested.length > 2000
        || requested.some(row => !row || typeof row.id !== 'string' || !row.id || !Number.isSafeInteger(row.rev) || row.rev < 0)
        || new Set(requested.map(row => row.id)).size !== requested.length) fail('Invalid revision-aware save.', 400)
      if (['opportunities', 'leads', 'approvals'].includes(entity) && requested.some(row => !row.deleted && row.data?.id !== row.id)) {
        fail('Record identity must match its saved row ID.', 400)
      }
      const generation = String(req.headers?.['x-workspace-generation'] || '')
      if (generation !== String(state.workspaceGeneration || 0)) fail('The workspace changed. Refresh before saving.', 409, 'WORKSPACE_PURGED')
      let currentQuery = client.from(table).select(table === 'records' ? 'entity,id,data,rev,deleted_at' : 'id,data,rev,deleted_at').in('id', requested.map(row => row.id))
      if (table === 'records') currentQuery = currentQuery.eq('entity', entity)
      const existing = new Map(rows(await currentQuery).map(row => [row.id, row]))
      if (entity === 'opportunities') await assertReservedOpportunityIds(client, requested.filter(row => !existing.has(row.id) && !row.deleted).map(row => row.id), auth.data.user.id)
      const payload = requested.flatMap(row => {
        const previous = existing.get(row.id)
        if (previous?.deleted_at && !row.deleted) fail('Deleted records cannot be recreated from an old browser snapshot.', 409)
        if (same(previous?.data, row.data) && !row.deleted) return []
        // Redacted properties must never disappear when a restricted user edits a visible row.
        let next = ['opportunities', 'leads', 'approvals'].includes(entity) && previous ? { ...previous.data, ...row.data } : row.data
        if (entity === 'opportunities' && previous?.data?.booking && next?.booking) next = { ...next, booking: { ...previous.data.booking, ...next.booking } }
        if (entity === 'state' && row.id === 'sales' && Array.isArray(next?.orders)) {
          const known = [...(previous?.data?.orders || []), ...(state.opportunities || []).map(opp => opp.booking).filter(Boolean)]
          next = { ...next, orders: next.orders.map(order => ({ ...known.find(saved => saved.id === order.id), ...order })) }
        }
        if (entity === 'state' && previous && !effectiveAccess(profile, config).isAdmin) {
          const visible = projectWorkspace(state, profile)[row.id]
          if (Array.isArray(previous.data) && Array.isArray(next) && Array.isArray(visible)) {
            const visibleIds = new Set(visible.map(item => item.id))
            const hidden = previous.data.filter(item => !visibleIds.has(item.id))
            const hiddenIds = new Set(hidden.map(item => item.id))
            if (next.some(item => hiddenIds.has(item.id))) fail('Protected records cannot be edited through a shared snapshot.')
            next = [...hidden, ...next]
          } else if (previous.data && typeof previous.data === 'object' && !Array.isArray(previous.data) && next && typeof next === 'object' && !Array.isArray(next)) {
            const hidden = Object.fromEntries(Object.entries(previous.data).filter(([key]) => !(key in (visible || {}))))
            if (Object.keys(next).some(key => key in hidden && !same(next[key], hidden[key]))) fail('Protected records cannot be edited through a shared snapshot.')
            next = { ...hidden, ...next }
          }
        }
        if (entity === 'opportunities' && previous && !canReadPricing(profile, previous.data, config, state)) {
          const visible = projectWorkspace({ ...state, opportunities: [previous.data] }, profile).opportunities[0] || {}
          for (const key of Object.keys(row.data || {})) if (!(key in visible) && !same(row.data[key], previous.data[key])) fail('You do not have permission to edit protected opportunity data.')
        }
        assertNoApprovalCommandWrite(entity, previous?.data, next, row.id)
        assertWorkspaceRowWrite(profile, entity, previous?.data, next, config, state, row.id, row.deleted === true)
        return [{ ...row, data: next, by: auth.data.user.id }]
      })
      if (!payload.length) return res.status(200).json({ data: { accepted: [], conflicts: [], committed: projectedRows(table, [...existing.values()], state, profile).map(row=>({...row,entity,available:!row.deleted_at})) }, error: null })
      const result = await client.rpc('save_rows', { p_entity: entity, p_rows: payload })
      if (result.error) throw result.error
      invalidate()
      const conflicts = result.data?.conflicts || []
      const visibleConflicts = projectedRows(table, conflicts.filter(row=>row.data != null).map(row => ({ ...row, ...(table === 'records' ? { entity } : {}) })), state, profile)
      // A hidden/missing conflict is still a failed write, never an acceptance.
      const data = { ...result.data, conflicts: conflicts.map(row => visibleConflicts.find(item=>item.id===row.id) || { id:row.id, rev:0, data:null, unavailable:true }) }
      const unchangedRows=[...existing.values()].filter(row=>requested.some(r=>r.id===row.id)&&!payload.some(r=>r.id===row.id))
      const savedRows = payload.filter(row=>!conflicts.some(c=>c.id===row.id)).map(row=>({...row,rev:row.rev+1,deleted_at:row.deleted?new Date().toISOString():null}))
      data.committed = projectedRows(table, [...unchangedRows,...savedRows.filter(row=>!row.deleted)], state, profile).map(row=>({...row,entity,available:true}))
      data.committed.push(...savedRows.filter(row=>row.deleted).map(row=>({entity,id:row.id,rev:row.rev,available:false})))
      return res.status(conflicts.length ? 409 : 200).json({ data, error: null, ...(conflicts.length ? {code:'REVISION_CONFLICT'} : {}) })
    } catch (error) {
      const status = approvalErrorStatus(error)
      if (status === 503 || status === 429) res.setHeader?.('Retry-After', status === 429 ? '60' : '1')
      return res.status(status).json({ error: status === 503 ? 'Workspace data is temporarily unavailable. Check the database migrations and retry.' : error.message, code: error.code || String(status) })
    } finally { releaseCommand?.() }
  }
}
export default createWorkspaceDataHandler()
