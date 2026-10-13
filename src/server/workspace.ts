import { assertReservedOpportunityIds } from '../../api/_opportunity-reservations.js'
import { assertWorkspaceRowWrite, projectWorkspace } from '../workspaceAccess.js'
import { createServiceClient } from './supabase.js'
import { mergeConcurrentOpportunityRows as mergeOpportunityRows } from '../workflowTransitions.js'
import { assertNoApprovalCommandWrite, publicAuditEvent } from '../approvalWriteGuard.js'

export type WorkspaceSlices = Record<string, unknown>
export type WorkspaceReader = () => Promise<WorkspaceSlices>
export type WorkspaceWriter = (dirty: WorkspaceSlices, actor?: Record<string, any>) => Promise<void>
export type WorkspaceGenerationReader = () => Promise<number>

type ApprovalDecision = { d?: unknown; when?: unknown; [key: string]: unknown }
type ApprovalRow = Record<string, any> & { id: string; status?: string; approvalKey?: string; needed?: unknown; approver?: unknown; anyOf?: unknown; decisions?: Record<string, ApprovalDecision>; __sv?: unknown }

const configuredValue = (...names: string[]) => names.map(name => process.env[name]?.trim()).find(Boolean) || ''

// Generic snapshots can add/cancel requests and update permitted metadata.
// Signatures belong to one request and may only be changed by the command RPC.
export function mergeConcurrentApprovalRows(currentRows: ApprovalRow[] = [], desiredRows: ApprovalRow[] = []) {
  const rows = new Map(currentRows.map(row => [row.id, row]))
  for (const row of desiredRows) {
    assertNoApprovalCommandWrite('approvals', rows.get(row.id), row)
    rows.set(row.id, row)
  }
  return [...rows.values()]
}

export const mergeConcurrentOpportunityRows = mergeOpportunityRows

export class WorkspaceCache {
  private value: WorkspaceSlices | null = null
  private loading: Promise<WorkspaceSlices> | null = null
  private generation = 0
  private requiresGeneration = false
  private generationReady = false

  constructor(private readonly read: WorkspaceReader, private readonly readGeneration?: WorkspaceGenerationReader) {}

  async currentGeneration() {
    if (!this.readGeneration) return this.generation
    const observed = Number(await this.readGeneration()) || 0
    if (!this.generationReady) {
      this.generation = observed
      this.generationReady = true
    } else if (observed !== this.generation) {
      this.value = null
      this.loading = null
      this.generation = observed
      this.requiresGeneration = true
    }
    return this.generation
  }

  async bootstrap() {
    await this.currentGeneration()
    if (this.value) return this.value
    if (!this.loading) this.loading = this.read().then(value => {
      const valueGeneration = Number(value.workspaceGeneration)
      if (Number.isFinite(valueGeneration)) {
        this.generation = valueGeneration
        this.generationReady = true
      }
      this.value = value
      return value
    }).finally(() => { this.loading = null })
    return this.loading
  }

  async select(entities: string[]) {
    const data = await this.bootstrap()
    return Object.fromEntries(entities.map(entity => [entity, data[entity] || []]))
  }

  invalidate({ purge = false } = {}) {
    this.value = null
    this.loading = null
    if (purge) {
      this.generation += 1
      this.requiresGeneration = true
    }
  }

  generationHeader() { return String(this.generation) }

  async acceptsSaveGeneration(value: string | undefined) {
    await this.currentGeneration()
    return !this.requiresGeneration || value === this.generationHeader()
  }
}

const rows = (result: { data: Array<{ id: string, data: unknown }> | null, error: unknown }) => {
  if (result.error) throw result.error
  return result.data || []
}

export function createWorkspaceReader(): WorkspaceReader | null {
  const url = configuredValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = configuredValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return null
  const service = createServiceClient(url, serviceRoleKey)
  return async () => {
    // The server makes this one database read and reuses it for every
    // browser until a successful write invalidates the cache.
    const [leads, opportunities, approvals, records, proposals, sparesLines, clarifications, audit, settings] = await Promise.all([
      service.from('leads').select('id, data').is('deleted_at', null),
      service.from('opportunities').select('id, data').is('deleted_at', null),
      service.from('approvals').select('id, data').is('deleted_at', null),
      service.from('records').select('entity, id, data').is('deleted_at', null),
      service.from('proposals').select('id, data').is('deleted_at', null),
      service.from('spares_lines').select('id, data').is('deleted_at', null),
      service.from('clarifications').select('id, data').is('deleted_at', null),
      service.from('audit').select('id, data').is('deleted_at', null),
      service.from('settings').select('id, data').eq('id', 'config').is('deleted_at', null),
    ])
    const recordRows = rows(records) as Array<{ entity: string, id: string, data: unknown }>
    const state = Object.fromEntries(recordRows.filter(row => row.entity === 'state').map(row => [row.id, row.data]))
    const workspaceGeneration = Number((state.workspace_generation as any)?.value) || 0
    delete state.workspace_generation
    const config = (rows(settings).find(row => row.id === 'config')?.data || {})
    return {
      ...state,
      workspaceGeneration,
      config,
      leads: rows(leads).map(row => row.data),
      opportunities: rows(opportunities).map(row => row.data),
      approvals: rows(approvals).map(row => row.data),
      proposals: Object.fromEntries(rows(proposals).map(row => [row.id, row.data])),
      sparesLines: rows(sparesLines).map(row => row.data),
      clarifications: rows(clarifications).map(row => row.data),
      audit: rows(audit).map(row => publicAuditEvent(row.data)),
    }
  }
}

export function createWorkspaceGenerationReader(): WorkspaceGenerationReader | null {
  const url = configuredValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = configuredValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return null
  const service = createServiceClient(url, serviceRoleKey)
  return async () => {
    const result = await service.from('records').select('data').eq('entity', 'state').eq('id', 'workspace_generation').maybeSingle()
    if (result.error) throw result.error
    return Number((result.data?.data as any)?.value) || 0
  }
}

const collaborativeEntities = ['leads', 'opportunities', 'approvals'] as const
type CollaborativeEntity = typeof collaborativeEntities[number]

export function createWorkspaceWriter(): WorkspaceWriter | null {
  const url = configuredValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = configuredValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return null
  const service = createServiceClient(url, serviceRoleKey) as any
  return async (dirty, actor) => {
    if (!actor) throw Object.assign(new Error('An active account is required.'), { status: 403 })
    let state = await createWorkspaceReader()?.() || {}
    const config = state.config || {}
    const visible = projectWorkspace(state, actor) as Record<string, any>
    const entities = Object.keys(dirty).sort((a, b) => ['approvals','leads','opportunities'].indexOf(a) - ['approvals','leads','opportunities'].indexOf(b))
    if (!entities.length || entities.some(entity => !collaborativeEntities.includes(entity as CollaborativeEntity))) {
      throw new Error('Only lead, opportunity, and approval saves are supported by the server workspace gateway.')
    }
    for (const entity of entities as CollaborativeEntity[]) {
      state = await createWorkspaceReader()?.() || state
      const desired = dirty[entity]
      if (!Array.isArray(desired) || desired.some(row => !row || typeof row !== 'object' || !('id' in row))) {
        throw new Error(`Invalid ${entity} workspace payload.`)
      }
      let current: any = await service.from(entity).select('id, data, rev').is('deleted_at', null)
      if (current.error) throw current.error
      const visibleIds = new Set((visible[entity] || []).map((row: any) => row.id))
      const existingRows = new Map<string, any>((current.data || []).map((row: any) => [row.id, row.data]))
      const desiredRows = (desired as ApprovalRow[]).map(row => {
        const before = existingRows.get(row.id)
        const after = before ? { ...before, ...row, ...(before.booking && row.booking ? { booking: { ...before.booking, ...row.booking } } : {}) } : row
        assertNoApprovalCommandWrite(entity, before, after)
        if (JSON.stringify(before) !== JSON.stringify(after)) assertWorkspaceRowWrite(actor, entity, before, after, config, state)
        return after
      })
      if (entity === 'opportunities') await assertReservedOpportunityIds(service, desiredRows.filter(row => !existingRows.has(row.id)).map(row => row.id), actor.authId || actor.id)
      const requestedIds = new Set(desiredRows.map(row => row.id))
      for (const [id, before] of existingRows) {
        if (requestedIds.has(id)) continue
        if (!visibleIds.has(id)) desiredRows.push(before)
        else if (entity !== 'approvals') assertWorkspaceRowWrite(actor, entity, before, before, config, state, id, true)
      }
      let wanted = new Map((entity === 'approvals'
        ? mergeConcurrentApprovalRows((current.data || []).map((row: any) => row.data), desiredRows)
        : entity === 'opportunities'
          ? mergeConcurrentOpportunityRows((current.data || []).map((row: any) => row.data), desiredRows)
          : desiredRows
      ).map(row => [String(row.id), row]))
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const latest = await createWorkspaceReader()?.() || state
        const latestUsers = Array.isArray(latest.users) ? latest.users as Record<string, any>[] : []
        const latestActor = latestUsers.find(user => user.id === actor.id)
        if (!latestActor || latestActor.status !== 'Active' || latestActor.deletedAt || latestActor.deletionPendingAt || latestActor.accessPending) throw Object.assign(new Error('This account no longer has workspace access.'), { status: 403 })
        const existing = new Map<string, any>((current.data || []).map((row: any) => [row.id, row]))
        const payload = [
          ...[...wanted.entries()].flatMap(([id, data]) => {
            const previous = existing.get(id)
            return previous && JSON.stringify(previous.data) === JSON.stringify(data)
              ? [] : [{ id, data, rev: Number(previous?.rev) || 0 }]
          }),
          ...(entity === 'approvals'
            ? []
            : [...existing.values()].filter((row: any) => !wanted.has(row.id))
              .map((row: any) => ({ id: row.id, data: row.data, rev: Number(row.rev) || 0, deleted: true }))),
        ]
        if (!payload.length) break
        for (const row of payload) {
          assertNoApprovalCommandWrite(entity, existing.get(row.id)?.data, row.data)
          assertWorkspaceRowWrite(latestActor, entity, existing.get(row.id)?.data, row.data, latest.config || {}, latest, row.id, 'deleted' in row && row.deleted === true)
        }
        const result = await service.rpc('save_rows', { p_entity: entity, p_rows: payload })
        if (result.error) throw result.error
        const conflicts = Array.isArray(result.data?.conflicts) ? result.data.conflicts : []
        if (!conflicts.length) break
        if (attempt === 3) throw new Error(`${entity} save conflict; please refresh and try again.`)
        current = await service.from(entity).select('id, data, rev').is('deleted_at', null)
        if (current.error) throw current.error
        if (entity === 'approvals') {
          wanted = new Map(mergeConcurrentApprovalRows(
            (current.data || []).map((row: any) => row.data),
            desiredRows,
          ).map(row => [String(row.id), row]))
        } else if (entity === 'opportunities') {
          wanted = new Map(mergeConcurrentOpportunityRows(
            (current.data || []).map((row: any) => row.data),
            desiredRows,
          ).map(row => [String(row.id), row]))
        }
      }
    }
  }
}
