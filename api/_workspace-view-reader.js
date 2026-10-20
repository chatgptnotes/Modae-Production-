import { workspaceViewPlan, LEAD_INDEX_FIELDS, leadIndex } from '../src/workspaceViewPlan.js'
import { publicAuditEvent } from '../src/approvalWriteGuard.js'

const tableKeys = { spares_lines: 'sparesLines' }
const checked = result => { if (result.error) throw result.error; return result.data || [] }
const scalarSelect = fields => ['id', 'rev', ...fields.filter(key => key !== 'id').map(key => `${key}:data->${key}`)].join(',')
const opportunityFields = ['id','oppName','sellTo','customerName','owner','sourceLeadId','stage','status','milestone','valueK','sl','booking']
const approvalFields = ['id','type','status','oppId','leadId','requestedBy','needed','approver','decisions','supersededBy']

// Choose database dependencies before reading. The API projects both canonical
// rows and the separate navigation index using the authenticated profile.
export async function readWorkspaceScope(client, view) {
  const started = Date.now(), plan = workspaceViewPlan(view)
  const revisions = {}, loaded = new Set(['config']), values = {}
  let queries = 0
  const read = async query => { queries++; return checked(await query) }
  const table = async (name, { fields, id, relatedTo } = {}) => {
    let query = client.from(name).select(fields ? scalarSelect(fields) : 'id,data,rev').is('deleted_at', null)
    if (id) query = query.eq('id', id)
    if (relatedTo) {
      // Quote the value as a PostgREST literal; IDs cannot inject filter clauses.
      const literal = JSON.stringify(relatedTo)
      query = query.or(['oppId','opportunityId','ref', ...(name === 'audit' ? ['objectId'] : [])].map(key => `data->>${key}.eq.${literal}`).join(','))
    }
    const result = await read(query)
    if (!fields) revisions[name] = result
    return fields ? result.map(row => ({ id: row.id, rev: row.rev, data: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'rev')) })) : result
  }
  let recordsQuery = client.from('records').select('entity,id,data,rev').eq('entity', 'state').is('deleted_at', null)
  if (plan.records) recordsQuery = recordsQuery.in('id', [...new Set(plan.records)])
  const [recordRows, settings] = await Promise.all([read(recordsQuery), table('settings', { id: 'config' })])
  revisions.records = recordRows
  for (const row of recordRows) { values[row.id] = row.data; loaded.add(row.id) }
  // Missing consolidated slices are authoritative empty values, not permission
  // to retain deleted data from an earlier visit.
  for (const key of plan.records || []) if (!(key in values)) {
    values[key] = ['users','customers','surveys','svcEstimates','leadArchive','leadDeadlines','adhocParts','vendorQuotes','competitors'].includes(key) ? [] : {}
    loaded.add(key)
  }
  values.config = settings[0]?.data || {}
  const generation = Number(values.workspace_generation?.value) || 0
  delete values.workspace_generation; loaded.delete('workspace_generation')
  await Promise.all(plan.tables.map(async name => {
    const detail = view.kind === 'detail'
    const id = detail && ['opportunities','proposals'].includes(name) || view.kind === 'lead' && name === 'leads' ? view.id : undefined
    const relatedTo = detail && ['spares_lines','clarifications','audit'].includes(name) ? view.id : undefined
    const result = await table(name, { id, relatedTo })
    const key = tableKeys[name] || name
    values[key] = name === 'proposals' ? Object.fromEntries(result.map(row => [row.id, row.data])) : result.map(row => name === 'audit' ? publicAuditEvent(row.data) : row.data)
    loaded.add(key)
  }))
  if (plan.leadIndex) {
    const select = scalarSelect([...LEAD_INDEX_FIELDS, 'body','duplicateRisk']) + ',aiSummary:data->ai->summary,aiFields:data->ai->fields,parseRoute:data->parse->oppType,parseConfidence:data->parse->confidence'
    const indexRows = await read(client.from('leads').select(select).is('deleted_at', null))
    values.leads = indexRows.map(({ rev, aiSummary, aiFields, parseRoute, parseConfidence, ...row }) => leadIndex({ ...row, ai: { summary: aiSummary, fields: aiFields }, parse: { oppType: parseRoute, confidence: parseConfidence } }))
    // Kept solely for the read model, never installed as writable baselines.
    revisions.leadIndex = indexRows.map(({ id, rev }) => ({ id, rev }))
    loaded.add('leads')
  }
  if (plan.proposalIndex) {
    const proposalRows = await table('proposals', { fields: ['id', 'revision'] })
    values.proposals = Object.fromEntries(proposalRows.map(row => [row.id, row.data]))
    loaded.add('proposals')
  }
  const navigation = { config: values.config, users: values.users || [], customers: values.customers || [] }
  await Promise.all(['opportunities','leads','approvals'].map(async name => {
    const selectedOnly = view.kind === 'detail' && name === 'opportunities' || view.kind === 'lead' && name === 'leads'
    if (loaded.has(name) && !selectedOnly) { navigation[name] = values[name]; return }
    const fields = name === 'leads' ? LEAD_INDEX_FIELDS : name === 'approvals' ? approvalFields : opportunityFields
    navigation[name] = (await table(name, { fields })).map(row => row.data)
  }))
  const coverage = { collections: [...loaded], records: {} }
  if (view.kind === 'detail') {
    coverage.records = { opportunities: [view.id], proposals: [view.id] }
    coverage.relatedOpportunity = view.id
  } else if (view.kind === 'lead') coverage.records.leads = [view.id]
  coverage.collections = coverage.collections.filter(key => !coverage.records[key] && !(view.kind === 'detail' && ['sparesLines','clarifications','audit'].includes(key)))
  return { ...values, workspaceGeneration: generation, _loaded: [...loaded], _coverage: coverage, _navigation: navigation, _revisions: revisions,
    _readMetrics: { queries, databaseMs: Date.now() - started } }
}
