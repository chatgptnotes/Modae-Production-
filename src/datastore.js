import { supabase } from './supabase.js'
import { applyRuleRows, readCachedRules, writeCachedRules } from './rules.js'

// Server persistence for the store: one JSONB row per top-level state slice in
// public.app_state (see supabase-setup.sql). Mirrors the filestore facade —
// every function no-ops when Supabase isn't configured, so the app keeps its
// original localStorage-only behavior without env vars.

// Per-device/session state that must never be shared across browsers.
export const LOCAL_ONLY = ['viewMode', 'viewModePinned', 'tabletTheme', 'spSync', 'auth', 'role',
  'inboxShowAll', 'leadSyncBaseline', 'clarificationSyncBaseline', 'opportunitySyncBaseline',
  'deletedOpportunityIds']

export const dbEnabled = () => !!supabase

// Shared business records are normally refreshed on focus.  That is not
// enough for approvals or leads: a salesperson can be staring at the inbox on
// one device while another user creates, assigns, or advances a lead. Postgres
// Changes gives the store a small, authoritative nudge; it deliberately
// reloads through loadAll() so the existing merge/version rules remain the
// single source of truth rather than trying to reconstruct a complete
// workspace from a single event payload.
export function subscribeBusinessChanges(onChange, onStatus = () => {}) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('modae-workspace-business')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, payload => onChange({ table: 'leads', payload }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, payload => onChange({ table: 'approvals', payload }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, payload => onChange({ table: 'opportunities', payload }))
    // Release effects update the proposal row as well as the approval itself.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'entity=eq.proposals' }, payload => onChange({ table: 'proposals', payload }))
    .subscribe(status => onStatus(status))
  return () => { supabase.removeChannel(channel) }
}

const TABLE = 'app_state'

// These slices have dedicated normalized tables. Loading their legacy JSON
// copies as well doubles the database response without adding information.
// Keep the legacy rows in place for migration/rollback, but do not transfer
// them during normal hydration.
const NORMALIZED_BUSINESS_KEYS = [
  'leads', 'opportunities', 'approvals', 'proposals',
  'sparesLines', 'clarifications', 'audit', 'priceLists',
]

// Focus/live-sync events can arrive close together. Reusing a short-lived
// read avoids transferring the same workspace payload repeatedly while still
// refreshing promptly after a save or the next focus interval.
const LOAD_CACHE_MS = 15000
let loadCache = null
let loadCacheAt = 0
let loadInFlight = null
let coreLoadInFlight = null
// Normalized opportunity rows carry their revision outside the application
// state. Keeping sync metadata out of state means it cannot leak into exports,
// localStorage, or business rules.
const opportunityRevisions = new Map()
const opportunityRecords = new Map()
let opportunitySaveQueue = Promise.resolve()
const normalizedRevisions = new Map()
const normalizedRecords = new Map()
const normalizedSaveQueues = new Map()
const normalizedKey = (entity, id) => `${entity}|${id}`
const clearNormalizedEntity = entity => {
  const prefix = `${entity}|`
  for (const key of normalizedRecords.keys()) if (key.startsWith(prefix)) {
    normalizedRecords.delete(key)
    normalizedRevisions.delete(key)
  }
}

export function invalidateLoadCache() {
  loadCache = null
  loadCacheAt = 0
}

// → { empty, slices: {key: value} } | null when disabled or on error
// (caller stays on localStorage and may retry later).
export async function loadAll({ force = false } = {}) {
  if (!supabase) return null
  if (!force && loadCache && Date.now() - loadCacheAt < LOAD_CACHE_MS) return loadCache
  // A realtime event must not settle for a request that started before the
  // event arrived. Wait for that request, then issue a fresh read so the
  // dashboard cannot render a stale snapshot after a remote opportunity edit.
  if (loadInFlight) {
    const pending = loadInFlight
    return force ? pending.then(() => loadAll({ force: true })) : pending
  }
  loadInFlight = fetchAll()
  try {
    loadCache = await loadInFlight
    loadCacheAt = Date.now()
    return loadCache
  } finally {
    loadInFlight = null
  }
}

// Fast startup path. The workspace can render once these core business rows
// arrive; rules, catalogues, and diagnostics are loaded separately below.
export async function loadCore() {
  if (coreLoadInFlight) return coreLoadInFlight
  coreLoadInFlight = fetchCore()
  try {
    return await coreLoadInFlight
  } finally {
    coreLoadInFlight = null
  }
}

// Secondary startup path. This deliberately reuses the complete loader so
// focus/realtime refreshes continue to have one authoritative code path.
export async function loadBackground() {
  return loadAll({ force: true })
}

async function fetchCore() {
  try {
    const legacyKeys = `(${NORMALIZED_BUSINESS_KEYS.join(',')})`
    const [stateResult, settings, business] = await Promise.all([
      supabase.from(TABLE).select('key, value').not('key', 'in', legacyKeys),
      supabase.from('app_settings').select('key, value'),
      loadBusinessTables(),
    ])
    if (stateResult.error) throw stateResult.error
    const slices = {}
    for (const row of stateResult.data || []) slices[row.key] = row.value
    if (!settings.error) for (const row of settings.data || []) slices[row.key] = row.value
    for (const [key, value] of Object.entries(business)) {
      if (value != null) slices[key] = value
    }
    const hasBusinessData = Object.values(business).some(value => Array.isArray(value) ? value.length > 0 : Object.keys(value || {}).length > 0)
    return {
      empty: (!stateResult.data || stateResult.data.length === 0) && !settings.data?.length && !hasBusinessData,
      slices,
      diagnostics: {
        normalizedOpportunityCount: Array.isArray(business.opportunities) ? business.opportunities.length : 0,
        legacyOpportunityCount: null,
      },
    }
  } catch (e) {
    console.warn('Supabase core load failed — staying on localStorage:', e?.message)
    return null
  }
}

async function fetchAll() {
  try {
    const legacyKeys = `(${NORMALIZED_BUSINESS_KEYS.join(',')})`
    const { data, error } = await supabase
      .from(TABLE)
      .select('key, value')
      .not('key', 'in', legacyKeys)
    if (error) throw error
    const slices = {}
    for (const row of data || []) slices[row.key] = row.value
    const settings = await supabase.from('app_settings').select('key, value')
    if (!settings.error) for (const row of settings.data || []) slices[row.key] = row.value
    const rules = await loadRuleTables()
    if (rules) {
      slices.config = applyRuleRows(slices.config || {}, rules)
      writeCachedRules(slices.config)
    } else if (!slices.config) {
      const cached = readCachedRules()
      if (cached) slices.config = cached
    }
    const business = await loadBusinessTables()
    // Apply empty normalized arrays too. This prevents stale local/demo rows
    // from surviving when the server intentionally has no active rows.
    for (const [key, value] of Object.entries(business)) {
      if (value != null) slices[key] = value
    }
    // Read legacy opportunities only for diagnostics. The normalized table
    // remains authoritative; this never merges old rows back into the app.
    const legacyOpportunities = await supabase
      .from(TABLE)
      .select('value')
      .eq('key', 'opportunities')
      .maybeSingle()
    const legacyRows = Array.isArray(legacyOpportunities.data?.value) ? legacyOpportunities.data.value : []
    // Currency rates are normalized data, not part of the legacy app_state
    // blob. Keep a graceful fallback while the SQL migration is being run.
    const rates = await supabase.from('currency_rates').select('currency_code, rate_to_inr').eq('is_active', true)
    if (!rates.error && rates.data?.length) {
      slices.config = { ...(slices.config || {}), currencyRates: Object.fromEntries(rates.data.map(row => [row.currency_code, Number(row.rate_to_inr)])) }
    }
    const priceLists = await supabase.from('price_lists').select(`
      list_code, supplier_name, source_currency, current_version, uploaded_at,
      price_list_versions (
        id, version_code, source_currency, filename, uploaded_at, is_active,
        price_list_parts (
          id, part_number, description, unit_price, currency, keywords,
          price_list_adders (code, description, unit_price)
        )
      )
    `)
    if (!priceLists.error && priceLists.data?.length) {
      slices.priceLists = Object.fromEntries(priceLists.data.map(list => {
        const versions = (list.price_list_versions || []).map(version => ({
          id: `${list.list_code}-${version.version_code}`,
          version: version.version_code,
          currency: version.source_currency,
          uploaded: version.uploaded_at || '',
          filename: version.filename || '',
          parts: (version.price_list_parts || []).map(part => ({
            pn: part.part_number,
            desc: part.description,
            price: Number(part.unit_price) || 0,
            currency: part.currency,
            keywords: part.keywords || [],
            adders: (part.price_list_adders || []).map(adder => ({ code: adder.code, desc: adder.description, price: Number(adder.unit_price) || 0 })),
          })),
        }))
        const active = versions.find(version => version.version === list.current_version) || versions[versions.length - 1]
        return [list.list_code, {
          parts: active?.parts || [],
          version: active?.version || list.current_version || 'Initial',
          currency: list.source_currency,
          uploaded: list.uploaded_at || '',
          versions,
          activeVersionId: active?.id || '',
        }]
      }))
    }
    const hasBusinessData = Object.values(business).some(value => Array.isArray(value) ? value.length > 0 : Object.keys(value || {}).length > 0)
    return {
      empty: (!data || data.length === 0) && !settings.data?.length && !rates.data?.length && !priceLists.data?.length && !hasBusinessData,
      slices,
      diagnostics: {
        normalizedOpportunityCount: Array.isArray(business.opportunities) ? business.opportunities.length : 0,
        legacyOpportunityCount: legacyRows.length,
      },
    }
  } catch (e) {
    console.warn('Supabase load failed — staying on localStorage:', {
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
      status: e?.status,
    })
    return null
  }
}

// dirty: {key: value}. Throws on error so the caller can keep the keys dirty.
export async function saveSlices(dirty) {
  if (!supabase) return
  invalidateLoadCache()
  let normalizedDirty = dirty
    const savedBusiness = await saveBusinessTables(dirty)
  if (savedBusiness.length) {
    normalizedDirty = { ...normalizedDirty }
    for (const key of savedBusiness) delete normalizedDirty[key]
  }
  if (dirty.priceLists) {
    const savedPriceLists = await savePriceLists(dirty.priceLists)
    if (savedPriceLists) {
      const { priceLists, ...rest } = normalizedDirty
      normalizedDirty = rest
    }
  }
  if (dirty.config?.currencyRates) {
    const rateRows = Object.entries(dirty.config.currencyRates).map(([currency_code, rate_to_inr]) => ({
      currency_code, rate_to_inr: Number(rate_to_inr), is_active: true, updated_at: new Date().toISOString(),
    }))
    const rateResult = await supabase.from('currency_rates').upsert(rateRows, { onConflict: 'currency_code' })
    if (!rateResult.error) {
      const { currencyRates, ...configWithoutRates } = dirty.config
      normalizedDirty = { ...normalizedDirty, config: configWithoutRates }
    }
  }
  const savedSettings = await saveSettings(normalizedDirty)
  for (const key of savedSettings) delete normalizedDirty[key]
  if (dirty.config) await saveRuleTables(dirty.config)
  const rows = Object.entries(normalizedDirty).map(([key, value]) => ({
    key, value, updated_at: new Date().toISOString(),
  }))
  if (!rows.length) return
  const { error } = await supabase.from(TABLE).upsert(rows)
  if (error) throw error
}

async function loadRuleTables() {
  const [workflow, approval, lead] = await Promise.all([
    supabase.from('workflow_rules').select('rule_key, label, definition, enabled, updated_at'),
    supabase.from('approval_rules').select('rule_key, label, definition, enabled, updated_at'),
    supabase.from('lead_rules').select('rule_key, label, definition, enabled, updated_at'),
  ])
  if (workflow.error || approval.error || lead.error) return null
  return { workflow: workflow.data || [], approval: approval.data || [], lead: lead.data || [] }
}

async function saveRuleTables(config = {}) {
  const writes = [
    supabase.from('approval_rules').upsert({
      rule_key: 'approval-thresholds', label: 'Approval thresholds', definition: {
        thresholds: config.approvalThresholds || {}, gates: config.approvalRules || [],
      }, enabled: true,
    }, { onConflict: 'rule_key' }),
    supabase.from('lead_rules').upsert({
      rule_key: 'lead-routing-and-deadlines', label: 'Lead routing and deadlines', definition: {
        ownershipRules: config.ownershipRules || [], ownerRules: config.ownerRules || [], stateRegions: config.stateRegions || [],
        leadDeadlines: config.leadDeadlines || {}, fastTrack: config.fastTrack || {},
      }, enabled: true,
    }, { onConflict: 'rule_key' }),
    supabase.from('workflow_rules').upsert({
      rule_key: 'workflow-and-gates', label: 'Workflow and gate definitions', definition: {
        workflow: config.workflow || {}, customerClasses: config.customerClasses || {}, documentChecklists: config.documentChecklists || {},
        kycItems: config.kycItems || [], kycValidation: config.kycValidation || {}, classRules: config.classRules || {}, amberFee: config.amberFee || {},
        requiredFields: config.workflowRequiredFields || [], routeRules: config.workflowRouteRules || [],
      }, enabled: true,
    }, { onConflict: 'rule_key' }),
  ]
  const results = await Promise.all(writes)
  if (results.some(result => result.error)) throw results.find(result => result.error).error
  writeCachedRules(config)
}

const BUSINESS_KEYS = new Set(['leads', 'opportunities', 'approvals', 'proposals', 'sparesLines', 'clarifications', 'audit', 'priceLists'])

async function saveSettings(dirty = {}) {
  const rows = Object.entries(dirty)
    .filter(([key]) => !BUSINESS_KEYS.has(key) && key !== 'config')
    .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }))
  if (dirty.config) {
    const { currencyRates, ...configWithoutRates } = dirty.config
    rows.push({ key: 'config', value: configWithoutRates, updated_at: new Date().toISOString() })
  }
  if (!rows.length) return []
  const result = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
  return result.error ? [] : rows.map(row => row.key)
}

async function loadBusinessTables() {
  const tables = await Promise.all([
    supabase.from('leads').select('id, data, rev').is('deleted_at', null),
    supabase.from('opportunities').select('id, data, rev').is('deleted_at', null),
    supabase.from('approvals').select('id, data, rev').is('deleted_at', null),
    supabase.from('records').select('entity, id, data, rev').is('deleted_at', null).in('entity', ['proposals', 'spares_lines', 'clarifications', 'audit']),
  ])
  const failedTables = tables
    .map((result, index) => result.error ? { index, error: result.error } : null)
    .filter(Boolean)
  if (failedTables.length) {
    console.warn('Supabase normalized table load failed:', failedTables.map(({ index, error }) => ({
      table: ['leads', 'opportunities', 'approvals', 'records'][index],
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    })))
    return {}
  }
  const records = tables[3].data || []
  opportunityRevisions.clear()
  opportunityRecords.clear()
  for (const entity of ['leads', 'approvals', 'proposals', 'spares_lines', 'clarifications', 'audit']) clearNormalizedEntity(entity)
  for (const row of tables[1].data || []) {
    opportunityRevisions.set(row.id, Number(row.rev) || 0)
    opportunityRecords.set(row.id, { data: row.data, rev: Number(row.rev) || 0 })
  }
  for (const row of tables[0].data || []) {
    const key = normalizedKey('leads', row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  for (const row of tables[2].data || []) {
    const key = normalizedKey('approvals', row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  for (const row of records) {
    const key = normalizedKey(row.entity, row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  return {
    leads: tables[0].data.map(row => row.data),
    opportunities: tables[1].data.map(row => row.data),
    approvals: tables[2].data.map(row => row.data),
    proposals: Object.fromEntries(records.filter(row => row.entity === 'proposals').map(row => [row.id, row.data])),
    sparesLines: records.filter(row => row.entity === 'spares_lines').map(row => row.data),
    clarifications: records.filter(row => row.entity === 'clarifications').map(row => row.data),
    audit: records.filter(row => row.entity === 'audit').map(row => row.data),
  }
}

async function saveBusinessTables(dirty = {}) {
  const writes = []
  if (dirty.leads) writes.push(['leads', saveNormalizedRows('leads', dirty.leads)])
  if (dirty.approvals) writes.push(['approvals', saveNormalizedRows('approvals', dirty.approvals)])
  if (dirty.sparesLines) writes.push(['sparesLines', saveNormalizedRows('spares_lines', dirty.sparesLines)])
  if (dirty.clarifications) writes.push(['clarifications', saveNormalizedRows('clarifications', dirty.clarifications)])
  if (dirty.audit) writes.push(['audit', saveNormalizedRows('audit', dirty.audit)])
  if (dirty.proposals) writes.push(['proposals', saveNormalizedRows('proposals', Object.entries(dirty.proposals).map(([id, data]) => ({ id, ...data })))])
  await Promise.all(writes.map(([, promise]) => promise))
  if (dirty.opportunities) await saveOpportunityRows(dirty.opportunities)
  return [...writes.map(([key]) => key === 'sparesLines' ? 'sparesLines' : key === 'proposals' ? 'proposals' : key), ...(dirty.opportunities ? ['opportunities'] : [])]
}

function normalizedPayload(entity, rows, deletedIds = []) {
  const active = rows.map(row => ({
    id: row.id,
    data: row,
    rev: normalizedRevisions.get(normalizedKey(entity, row.id)) ?? 0,
  }))
  const deleted = deletedIds.map(id => {
    const previous = normalizedRecords.get(normalizedKey(entity, id))
    return previous ? { id, data: previous.data, rev: previous.rev, deleted: true } : null
  }).filter(Boolean)
  return [...active, ...deleted]
}

async function saveNormalizedRowsNow(entity, rows) {
  const localById = new Map(rows.map(row => [row.id, row]))
  const prefix = `${entity}|`
  const deletedIds = [...normalizedRecords.keys()]
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .filter(id => !localById.has(id))
  const write = async payload => {
    const result = await supabase.rpc('save_rows', { p_entity: entity, p_rows: payload })
    if (result.error) throw result.error
    return result.data || { conflicts: [] }
  }
  const firstPayload = normalizedPayload(entity, rows, deletedIds)
  const first = await write(firstPayload)
  const conflicts = Array.isArray(first.conflicts) ? first.conflicts : []
  if (conflicts.length) {
    const retry = conflicts.map(serverRow => ({
      id: serverRow.id,
      data: localById.get(serverRow.id) || serverRow.data,
      rev: Number(serverRow.rev) || 0,
      deleted: !localById.has(serverRow.id),
    }))
    const second = await write(retry)
    const remaining = Array.isArray(second.conflicts) ? second.conflicts : []
    if (remaining.length) throw new Error(`${entity} save conflict for ${remaining.map(row => row.id).join(', ')}`)
    for (const row of retry) {
      const key = normalizedKey(entity, row.id)
      normalizedRevisions.set(key, row.rev + 1)
      if (row.deleted) normalizedRecords.delete(key)
      else normalizedRecords.set(key, { data: row.data, rev: row.rev + 1 })
    }
  }
  for (const row of firstPayload) {
    if (conflicts.some(conflict => conflict.id === row.id)) continue
    const key = normalizedKey(entity, row.id)
    normalizedRevisions.set(key, row.rev + 1)
    if (row.deleted) normalizedRecords.delete(key)
    else normalizedRecords.set(key, { data: row.data, rev: row.rev + 1 })
  }
}

function saveNormalizedRows(entity, rows) {
  const previous = normalizedSaveQueues.get(entity) || Promise.resolve()
  const next = previous.catch(() => {}).then(() => saveNormalizedRowsNow(entity, rows))
  normalizedSaveQueues.set(entity, next)
  return next
}

function opportunityPayload(rows, deletedIds = []) {
  const active = rows.map(row => ({
    id: row.id,
    data: row,
    // New rows start at revision zero; save_rows stores them as revision one.
    rev: opportunityRevisions.get(row.id) ?? 0,
  }))
  const deleted = deletedIds
    .map(id => {
      const previous = opportunityRecords.get(id)
      if (!previous) return null
      return { id, data: previous.data, rev: previous.rev, deleted: true }
    })
    .filter(Boolean)
  return [...active, ...deleted]
}

async function saveOpportunityRowsNow(rows) {
  const localById = new Map(rows.map(row => [row.id, row]))
  const deletedIds = [...opportunityRecords.keys()].filter(id => !localById.has(id))
  const write = async payload => {
    const result = await supabase.rpc('save_rows', { p_entity: 'opportunities', p_rows: payload })
    if (result.error) throw result.error
    return result.data || { accepted: [], conflicts: [] }
  }

  const firstPayload = opportunityPayload(rows, deletedIds)
  const first = await write(firstPayload)
  const conflicts = Array.isArray(first.conflicts) ? first.conflicts : []
  if (conflicts.length) {
    // Latest-save-wins: rebase only the rows rejected by the revision guard
    // onto the server revision, while preserving the local row being saved.
    const retry = conflicts
      .map(serverRow => {
        const local = localById.get(serverRow.id)
        return {
          id: serverRow.id,
          data: local || serverRow.data,
          rev: Number(serverRow.rev) || 0,
          deleted: !local,
        }
      })
      .filter(Boolean)
    if (retry.length) {
      const second = await write(retry)
      const remaining = Array.isArray(second.conflicts) ? second.conflicts : []
      if (remaining.length) throw new Error(`Opportunity save conflict for ${remaining.map(row => row.id).join(', ')}`)
      for (const row of retry) {
        opportunityRevisions.set(row.id, row.rev + 1)
        if (row.deleted) opportunityRecords.delete(row.id)
        else opportunityRecords.set(row.id, { data: row.data, rev: row.rev + 1 })
      }
    }
  }

  for (const row of firstPayload) {
    if (conflicts.some(conflict => conflict.id === row.id)) continue
    opportunityRevisions.set(row.id, row.rev + 1)
    if (row.deleted) opportunityRecords.delete(row.id)
    else opportunityRecords.set(row.id, { data: row.data, rev: row.rev + 1 })
  }
}

// Debounced local saves and pagehide can overlap. Serialize them so an older
// full-slice snapshot can never finish after a newer one.
function saveOpportunityRows(rows) {
  opportunitySaveQueue = opportunitySaveQueue
    .catch(() => {})
    .then(() => saveOpportunityRowsNow(rows))
  return opportunitySaveQueue
}

export async function savePriceLists(priceLists = {}) {
  if (!supabase) return false
  const listRows = Object.entries(priceLists).map(([list_code, list]) => ({
    list_code,
    supplier_name: list_code,
    source_currency: String(list.currency || 'INR').toUpperCase(),
    current_version: list.version || null,
    uploaded_at: list.uploaded || null,
    updated_at: new Date().toISOString(),
  }))
  if (!listRows.length) return true
  const { data: savedLists, error: listError } = await supabase
    .from('price_lists').upsert(listRows, { onConflict: 'list_code' }).select('id, list_code')
  if (listError) return false
  for (const [listCode, list] of Object.entries(priceLists)) {
    const listId = savedLists.find(row => row.list_code === listCode)?.id
    if (!listId) continue
    const versions = Array.isArray(list.versions) && list.versions.length
      ? list.versions
      : [{ version: list.version || 'Initial', currency: list.currency || 'INR', uploaded: list.uploaded || '', parts: list.parts || [] }]
    for (const version of versions) {
      const { data: savedVersion, error: versionError } = await supabase.from('price_list_versions')
        .upsert({
          price_list_id: listId,
          version_code: version.version || 'Initial',
          source_currency: String(version.currency || list.currency || 'INR').toUpperCase(),
          filename: version.filename || '',
          uploaded_at: version.uploaded || null,
          is_active: `${listCode}-${version.version}` === list.activeVersionId || version.version === list.version,
        }, { onConflict: 'price_list_id,version_code' }).select('id').single()
      if (versionError || !savedVersion) return false
      const parts = (version.parts || []).map(part => ({
        version_id: savedVersion.id,
        part_number: part.pn,
        description: part.desc || '',
        unit_price: Number(part.price) || 0,
        currency: String(part.currency || version.currency || list.currency || 'INR').toUpperCase(),
        keywords: part.keywords || [],
      }))
      if (parts.length) {
        const { data: savedParts, error: partError } = await supabase.from('price_list_parts')
          .upsert(parts, { onConflict: 'version_id,part_number' }).select('id, part_number')
        if (partError) return false
        const adders = parts.flatMap(part => {
          const source = (version.parts || []).find(row => row.pn === part.part_number)
          const saved = savedParts.find(row => row.part_number === part.part_number)
          return (source?.adders || []).map(adder => ({
            part_id: saved.id,
            code: adder.code,
            description: adder.desc || '',
            unit_price: Number(adder.price) || 0,
          }))
        })
        if (adders.length) {
          const { error: adderError } = await supabase.from('price_list_adders').upsert(adders, { onConflict: 'part_id,code' })
          if (adderError) return false
        }
      }
    }
  }
  return true
}

// Reset Demo: overwrite every slice with seeds and drop stray rows. Upserting
// (rather than delete-all) means other open devices refetch seeds on focus
// instead of racing to re-push their stale state.
export async function resetAll(seedMap) {
  if (!supabase) return
  await saveSlices(seedMap)
  const { error } = await supabase.from(TABLE).delete()
    .not('key', 'in', `(${Object.keys(seedMap).join(',')})`)
  if (error) throw error
}
