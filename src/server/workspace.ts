import { createServiceClient } from './supabase.js'

export type WorkspaceSlices = Record<string, unknown>
export type WorkspaceReader = () => Promise<WorkspaceSlices>
export type WorkspaceWriter = (dirty: WorkspaceSlices) => Promise<void>

type ApprovalDecision = { d?: unknown; when?: unknown; [key: string]: unknown }
type ApprovalRow = Record<string, any> & { id: string; status?: string; approvalKey?: string; needed?: unknown; approver?: unknown; anyOf?: unknown; decisions?: Record<string, ApprovalDecision>; __sv?: unknown }

const configuredValue = (...names: string[]) => names.map(name => process.env[name]?.trim()).find(Boolean) || ''

const decisionTime = (decision: ApprovalDecision | undefined) => String(decision?.when || '')
const rowTime = (row: ApprovalRow) => String(row.__sv || row.decisionTs || row.ts || '')
const latestRow = (rows: ApprovalRow[]) => rows.reduce((latest, row) => rowTime(row) >= rowTime(latest) ? row : latest)

const mergeApprovalGroup = (rows: ApprovalRow[]) => {
  const latest = latestRow(rows)
  const decisions: Record<string, ApprovalDecision> = {}
  for (const row of rows) {
    for (const [role, decision] of Object.entries(row.decisions || {})) {
      if (!decisions[role] || decisionTime(decision) >= decisionTime(decisions[role])) decisions[role] = decision
    }
  }
  const needed = Array.isArray(latest.needed)
    ? latest.needed.map(String)
    : latest.approver ? [String(latest.approver)] : []
  const hasDecisions = Object.keys(decisions).length > 0
  const sourceStatuses = rows.map(row => String(row.status || 'Pending'))
  const anyRejected = Object.values(decisions).some(decision => decision?.d === 'Rejected') || sourceStatuses.includes('Rejected')
  const allDecided = latest.anyOf
    ? needed.some(role => decisions[role])
    : needed.every(role => decisions[role])
  const status = anyRejected ? 'Rejected'
    : hasDecisions ? (allDecided ? 'Approved' : 'Pending')
    : sourceStatuses.includes('Cancelled') ? 'Cancelled'
    : sourceStatuses.includes('Returned') ? 'Returned'
    : sourceStatuses.includes('Approved with conditions') ? 'Approved with conditions'
    : sourceStatuses.includes('Approved') ? 'Approved'
    : latest.status || 'Pending'
  const oldest = rows.reduce((first, row) => rowTime(row) < rowTime(first) ? row : first)
  return {
    ...latest,
    id: oldest.id,
    decisions,
    status,
    __sv: rowTime(latest),
  }
}

// Browsers save the approval slice as a snapshot. Merge pending rows at the
// server boundary so LJS and AH can decide from different snapshots without
// one decision replacing the other.
export function mergeConcurrentApprovalRows(currentRows: ApprovalRow[] = [], desiredRows: ApprovalRow[] = []) {
  const byId = new Map<string, ApprovalRow[]>()
  for (const row of [...currentRows, ...desiredRows]) {
    if (!row?.id) continue
    byId.set(row.id, [...(byId.get(row.id) || []), row])
  }
  const perId = [...byId.values()].map(mergeApprovalGroup)
  const pendingByKey = new Map<string, ApprovalRow[]>()
  const finalRows: ApprovalRow[] = []
  for (const row of perId) {
    if (row.status !== 'Pending' || !row.approvalKey) {
      finalRows.push(row)
      continue
    }
    pendingByKey.set(row.approvalKey, [...(pendingByKey.get(row.approvalKey) || []), row])
  }
  return [...finalRows, ...[...pendingByKey.values()].map(mergeApprovalGroup)]
}

export class WorkspaceCache {
  private value: WorkspaceSlices | null = null
  private loading: Promise<WorkspaceSlices> | null = null

  constructor(private readonly read: WorkspaceReader) {}

  async bootstrap() {
    if (this.value) return this.value
    if (!this.loading) this.loading = this.read().then(value => {
      this.value = value
      return value
    }).finally(() => { this.loading = null })
    return this.loading
  }

  async select(entities: string[]) {
    const data = await this.bootstrap()
    return Object.fromEntries(entities.map(entity => [entity, data[entity] || []]))
  }

  invalidate() { this.value = null }
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
    // Railway makes this one server-to-database read and reuses it for every
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
      service.from('settings').select('id, data').is('deleted_at', null),
    ])
    const recordRows = rows(records) as Array<{ entity: string, id: string, data: unknown }>
    const state = Object.fromEntries(recordRows.filter(row => row.entity === 'state').map(row => [row.id, row.data]))
    const config = (rows(settings).find(row => row.id === 'config')?.data || {})
    return {
      ...state,
      config,
      leads: rows(leads).map(row => row.data),
      opportunities: rows(opportunities).map(row => row.data),
      approvals: rows(approvals).map(row => row.data),
      proposals: Object.fromEntries(rows(proposals).map(row => [row.id, row.data])),
      sparesLines: rows(sparesLines).map(row => row.data),
      clarifications: rows(clarifications).map(row => row.data),
      audit: rows(audit).map(row => row.data),
    }
  }
}

const collaborativeEntities = ['leads', 'opportunities', 'approvals'] as const
type CollaborativeEntity = typeof collaborativeEntities[number]

export function createWorkspaceWriter(): WorkspaceWriter | null {
  const url = configuredValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = configuredValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return null
  const service = createServiceClient(url, serviceRoleKey) as any
  return async dirty => {
    const entities = Object.keys(dirty)
    if (!entities.length || entities.some(entity => !collaborativeEntities.includes(entity as CollaborativeEntity))) {
      throw new Error('Only lead, opportunity, and approval saves are supported by the Railway workspace gateway.')
    }
    for (const entity of entities as CollaborativeEntity[]) {
      const desired = dirty[entity]
      if (!Array.isArray(desired) || desired.some(row => !row || typeof row !== 'object' || !('id' in row))) {
        throw new Error(`Invalid ${entity} workspace payload.`)
      }
      let current: any = await service.from(entity).select('id, data, rev').is('deleted_at', null)
      if (current.error) throw current.error
      const desiredRows = desired as ApprovalRow[]
      let wanted = new Map((entity === 'approvals'
        ? mergeConcurrentApprovalRows((current.data || []).map((row: any) => row.data), desiredRows)
        : desiredRows
      ).map(row => [String(row.id), row]))
      for (let attempt = 0; attempt < 4; attempt += 1) {
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
        }
      }
    }
  }
}
