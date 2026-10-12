import { isActiveUser, isAccountAdmin } from '../src/userManagement.js'
import { createHash } from 'node:crypto'
import { getAdminSupabaseClient } from './_supabase-client.js'
import { upgradeCustomerRules } from '../src/customerClasses.js'
import { mergeWorkbookData } from '../src/excelLogic.js'

const ordered = rows => [...rows].sort((a, b) => `${a.entity || ''}|${a.id}`.localeCompare(`${b.entity || ''}|${b.id}`))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const adminRoles = new Set(['SUPER', 'ADMIN', 'LJS'])
const read = result => { if (result.error) throw result.error; return result.data || [] }

export function createWorkbookImportHandler(getClient = getAdminSupabaseClient) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ ok: false, error: 'A signed-in admin session is required.' })
    const client = getClient()
    if (!client) return res.status(503).json({ ok: false, error: 'Workbook imports are not configured.' })
    const { action, importData, reviewToken } = req.body || {}
    if (!['preview', 'commit'].includes(action) || !Array.isArray(importData?.opportunities) || !importData.opportunities.length || !Array.isArray(importData?.customers)
      || importData.opportunities.some(row => !row || typeof row.id !== 'string' || !row.id.trim())
      || importData.customers.some(row => !row || typeof row.name !== 'string' || !row.name.trim())
      || new Set(importData.opportunities.map(row => row.id)).size !== importData.opportunities.length) {
      return res.status(400).json({ ok: false, error: 'A valid workbook with unique opportunity IDs is required.' })
    }
    try {
      const auth = await client.auth.getUser(token)
      if (auth.error || !auth.data?.user?.email) return res.status(401).json({ ok: false, error: 'The session has expired.' })
      const [recordResult, opportunityResult, settingsResult] = await Promise.all([
        client.from('records').select('entity, id, data, rev, deleted_at'),
        client.from('opportunities').select('id, data, rev, deleted_at'),
        client.from('settings').select('id, data, rev, deleted_at'),
      ])
      const records = read(recordResult)
      const opportunities = read(opportunityResult)
      const settings = read(settingsResult)
      const stateRecord = id => records.find(row => row.entity === 'state' && row.id === id && !row.deleted_at)
      const profile = (stateRecord('users')?.data || []).find(user => String(user.email || '').toLowerCase() === auth.data.user.email.toLowerCase())
      if (!isActiveUser(profile) || !isAccountAdmin(profile)) {
        return res.status(403).json({ ok: false, error: 'Only an active administrator can import a workbook.' })
      }
      const customerRecord = stateRecord('customers')
      const deletedIds = [...new Set([
        ...opportunities.filter(row => row.deleted_at).map(row => row.id),
        ...(stateRecord('deletedOpportunityIds')?.data || []),
      ])]
      const state = { opportunities: opportunities.filter(row => !row.deleted_at).map(row => row.data), customers: customerRecord?.data || [], deletedOpportunityIds: deletedIds }
      const merged = mergeWorkbookData(state, importData)
      const configRecord = settings.find(row => row.id === 'config' && !row.deleted_at)
      const config = upgradeCustomerRules({ ...(configRecord?.data || {}) })
      if (!config.customerClassificationGuidance?.length && importData.customerClassificationGuidance?.length) config.customerClassificationGuidance = importData.customerClassificationGuidance
      // Review is bound to the input and authoritative revisions, including deletion generation.
      const expectedToken = hash({ importData, records: ordered(records), opportunities: ordered(opportunities), settings: ordered(settings) })
      const summary = { opportunities: merged.opportunities.length, customers: merged.customers.length,
        addedOpportunities: merged.opportunities.length - state.opportunities.length,
        addedCustomers: merged.customers.length - state.customers.length,
        conflicts: merged.conflicts, skippedDeleted: importData.opportunities.filter(row => deletedIds.includes(row.id)).length }
      if (action === 'preview') return res.status(200).json({ ok: true, ...summary, reviewToken: expectedToken })
      if (reviewToken !== expectedToken) return res.status(409).json({ ok: false, error: 'The workbook or workspace changed. Preview it again before importing.' })
      const byId = new Map(opportunities.map(row => [row.id, row]))
      const actor = auth.data.user.id
      const batches = [
        ['opportunities', merged.opportunities.filter(row => JSON.stringify(row) !== JSON.stringify(byId.get(row.id)?.data)).map(row => ({ id: row.id, data: row, rev: byId.get(row.id)?.rev || 0, by: actor }))],
        ['state', JSON.stringify(merged.customers) !== JSON.stringify(state.customers) ? [{ id: 'customers', data: merged.customers, rev: customerRecord?.rev || 0, by: actor }] : []],
        ['settings', JSON.stringify(config) !== JSON.stringify(configRecord?.data || {}) ? [{ id: 'config', data: config, rev: configRecord?.rev || 0, by: actor }] : []],
      ]
      const auditId = `WORKBOOK-${crypto.randomUUID()}`
      batches.push(['audit', [{ id: auditId, rev: 0, by: actor, data: {
        id: auditId, ts: new Date().toISOString(), action: 'Excel workbook merged', ref: 'Workbook import', detail: `${summary.addedOpportunities} opportunities and ${summary.addedCustomers} customers added; ${summary.conflicts.length} differences retained for review`, actor,
      } }]])
      const saved = await client.rpc('import_workbook_rows', {
        p_generation: Number(stateRecord('workspace_generation')?.data?.value || 0),
        p_batches: batches.filter(([, rows]) => rows.length).map(([entity, rows]) => ({ entity, rows })),
      })
      if (saved.error?.code === '40001') return res.status(409).json({ ok: false, error: 'The workspace changed during import. Nothing was imported; refresh and preview again.' })
      if (saved.error) throw saved.error
      return res.status(200).json({ ok: true, ...summary })
    } catch (error) { return res.status(500).json({ ok: false, error: error.message || 'Workbook import failed. Refresh and preview again.' }) }
  }
}
export default createWorkbookImportHandler()
