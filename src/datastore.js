import { supabase } from './supabase.js'
import { writeCachedRules } from './rules.js'

// Server persistence for the store: normalized business rows plus JSONB state
// records. Mirrors the filestore facade —
// every function no-ops when Supabase isn't configured, so the app keeps its
// original localStorage-only behavior without env vars.

// Per-device/session state that must never be shared across browsers.
export const LOCAL_ONLY = ['viewMode', 'viewModePinned', 'tabletTheme', 'spSync', 'auth', 'role',
  'inboxShowAll', 'leadSyncBaseline', 'clarificationSyncBaseline', 'opportunitySyncBaseline',
  'sparesLinesSyncBaseline', 'deletedOpportunityIds', 'pendingOpportunitySyncIds']

export const dbEnabled = () => !!supabase

// Shared business records are normally refreshed on focus. Postgres Changes
// provides a small, authoritative nudge while the row-level loader below
// keeps that nudge from downloading the entire workspace.
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

const realtimeEntityFor = table => table === 'proposals' ? 'proposals' : table

// Resolve realtime events to only the affected row. The event payload is not
// used as the source of truth because projects without REPLICA IDENTITY FULL
// may omit the complete row, especially for updates and deletes.
export async function loadChangedRows(events = []) {
  if (!supabase) return []
  const unique = new Map()
  for (const event of events) {
    const payload = event?.payload || {}
    const source = payload.new || payload.old || {}
    const recordEvent = event.table === 'records' || event.table === 'proposals'
    const entity = recordEvent ? (source.entity || 'proposals') : realtimeEntityFor(event.table)
    const id = source.id
    if (entity && id != null) unique.set(`${entity}|${id}`, { table: recordEvent ? 'records' : event.table, entity, id: String(id) })
  }
  const rows = await Promise.all([...unique.values()].map(async target => {
    let query = supabase.from(target.table === 'records' ? 'records' : target.table)
      .select('id, data, rev, deleted_at')
      .eq('id', target.id)
    if (target.table === 'records') query = query.eq('entity', target.entity)
    const result = await query.maybeSingle()
    if (result.error) throw result.error
    const row = result.data
    return {
      table: target.table,
      entity: target.entity,
      id: target.id,
      data: row?.data || null,
      rev: Number(row?.rev) || 0,
      deleted: !row || !!row.deleted_at,
    }
  }))
  return rows
}

// Focus/live-sync events can arrive close together. Reusing a short-lived
// read avoids transferring the same workspace payload repeatedly while still
// refreshing promptly after a save or the next focus interval.
const LOAD_CACHE_MS = 15000
let loadCache = null
let loadCacheAt = 0
let loadInFlight = null
let coreLoadInFlight = null
const PRICE_LIST_CACHE_KEY = 'wintrack-modae-approved-price-lists-v1'
const CONSOLIDATED_SETTINGS_ENTITY = 'settings'
const CONSOLIDATED_SETTINGS_ID = 'config'
const CONSOLIDATED_PRICE_LIST_ENTITY = 'price_lists'
const CONSOLIDATED_PRICE_VERSION_ENTITY = 'price_list_versions'
const CONSOLIDATED_STATE_ENTITY = 'state'
let priceListCache = null
let priceListCacheAt = 0
let priceListInFlight = null
// Normalized opportunity rows carry their revision outside the application
// state. Keeping sync metadata out of state means it cannot leak into exports,
// localStorage, or business rules.
const opportunityRevisions = new Map()
const opportunityRecords = new Map()
let opportunitySaveQueue = Promise.resolve()
const normalizedRevisions = new Map()
const normalizedRecords = new Map()
const normalizedSaveQueues = new Map()
let saveSlicesQueue = Promise.resolve()
const MAX_CONFLICT_RETRIES = 3
const normalizedKey = (entity, id) => `${entity}|${id}`
const clearNormalizedEntity = entity => {
  const prefix = `${entity}|`
  for (const key of normalizedRecords.keys()) if (key.startsWith(prefix)) {
    normalizedRecords.delete(key)
    normalizedRevisions.delete(key)
  }
}

// Configuration is stored behind the existing JSONB records store, keeping
// runtime reads on the consolidated path after the migration.
async function loadConsolidatedConfig() {
  const result = await supabase.from('records')
    .select('id, data, rev')
    .eq('entity', CONSOLIDATED_SETTINGS_ENTITY)
    .eq('id', CONSOLIDATED_SETTINGS_ID)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error || !result.data?.data || typeof result.data.data !== 'object') return null
  const key = normalizedKey(CONSOLIDATED_SETTINGS_ENTITY, CONSOLIDATED_SETTINGS_ID)
  normalizedRevisions.set(key, Number(result.data.rev) || 0)
  normalizedRecords.set(key, { data: result.data.data, rev: Number(result.data.rev) || 0 })
  return result.data.data
}

async function saveConsolidatedConfig(config = {}) {
  const key = normalizedKey(CONSOLIDATED_SETTINGS_ENTITY, CONSOLIDATED_SETTINGS_ID)
  const rev = normalizedRevisions.get(key) ?? 0
  const result = await supabase.rpc('save_rows', {
    p_entity: CONSOLIDATED_SETTINGS_ENTITY,
    p_rows: [{ id: CONSOLIDATED_SETTINGS_ID, data: config, rev }],
  })
  if (result.error) throw result.error
  const conflicts = Array.isArray(result.data?.conflicts) ? result.data.conflicts : []
  if (conflicts.length) throw new Error('Consolidated configuration changed on another device; retrying on next save')
  normalizedRevisions.set(key, rev + 1)
  normalizedRecords.set(key, { data: config, rev: rev + 1 })
  writeCachedRules(config)
  return true
}

async function loadConsolidatedState() {
  const result = await supabase.from('records')
    .select('id, data, rev')
    .eq('entity', CONSOLIDATED_STATE_ENTITY)
    .is('deleted_at', null)
  if (result.error) return null
  const state = {}
  for (const row of result.data || []) {
    state[row.id] = row.data
    const key = normalizedKey(CONSOLIDATED_STATE_ENTITY, row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  return state
}

async function saveConsolidatedState(dirty = {}) {
  const rows = Object.entries(dirty)
    .filter(([key]) => !BUSINESS_KEYS.has(key) && key !== 'config')
    .map(([id, data]) => ({
      id,
      data,
      rev: normalizedRevisions.get(normalizedKey(CONSOLIDATED_STATE_ENTITY, id)) ?? 0,
    }))
  if (!rows.length) return []
  const result = await supabase.rpc('save_rows', {
    p_entity: CONSOLIDATED_STATE_ENTITY,
    p_rows: rows,
  })
  if (result.error || (result.data?.conflicts || []).length) throw result.error || new Error('Consolidated state save conflict')
  for (const row of rows) {
    const key = normalizedKey(CONSOLIDATED_STATE_ENTITY, row.id)
    normalizedRevisions.set(key, row.rev + 1)
    normalizedRecords.set(key, { data: row.data, rev: row.rev + 1 })
  }
  return rows.map(row => row.id)
}

export function invalidateLoadCache() {
  loadCache = null
  loadCacheAt = 0
}

export function readPriceListsCache() {
  if (priceListCache) return priceListCache
  try {
    const saved = JSON.parse(localStorage.getItem(PRICE_LIST_CACHE_KEY) || 'null')
    if (saved?.priceLists && typeof saved.priceLists === 'object') {
      priceListCache = saved.priceLists
      return priceListCache
    }
  } catch { /* cache is optional */ }
  return null
}

const writePriceListsCache = priceLists => {
  priceListCache = priceLists
  priceListCacheAt = Date.now()
  try {
    localStorage.setItem(PRICE_LIST_CACHE_KEY, JSON.stringify({ version: 1, savedAt: priceListCacheAt, priceLists }))
  } catch { /* the main local snapshot remains unaffected */ }
}

const priceVersionRecordId = (listCode, versionCode) => `${listCode}::${versionCode}`

const mapConsolidatedVersion = data => ({
  id: data.id || priceVersionRecordId(data.listCode, data.version),
  version: data.version || 'Initial',
  currency: data.currency || 'INR',
  uploaded: data.uploaded || '',
  filename: data.filename || '',
  parts: Array.isArray(data.parts) ? data.parts : [],
})

async function loadConsolidatedPriceLists() {
  const listsResult = await supabase.from('records')
    .select('id, data, rev')
    .eq('entity', CONSOLIDATED_PRICE_LIST_ENTITY)
    .is('deleted_at', null)
  if (listsResult.error || !listsResult.data?.length) return null

  const listRows = listsResult.data
  const activeVersionIds = listRows
    .map(row => row.data?.activeVersionId || priceVersionRecordId(row.id, row.data?.currentVersion || ''))
    .filter(Boolean)
  const versionsResult = activeVersionIds.length
    ? await supabase.from('records')
      .select('id, data, rev')
      .eq('entity', CONSOLIDATED_PRICE_VERSION_ENTITY)
      .in('id', activeVersionIds)
      .is('deleted_at', null)
    : { data: [], error: null }
  if (versionsResult.error) return null
  if (versionsResult.data?.length !== activeVersionIds.length) return null

  const versionsById = new Map((versionsResult.data || []).map(row => [row.id, row]))
  const result = Object.fromEntries(listRows.map(row => {
    const data = row.data || {}
    const activeId = data.activeVersionId || priceVersionRecordId(row.id, data.currentVersion || '')
    const active = versionsById.get(activeId)
    const versions = Array.isArray(data.versions) ? data.versions.map(version => ({
      id: version.id || priceVersionRecordId(row.id, version.version),
      version: version.version || 'Initial',
      currency: version.currency || data.sourceCurrency || 'INR',
      uploaded: version.uploaded || '',
      filename: version.filename || '',
      parts: version.id === activeId || priceVersionRecordId(row.id, version.version) === activeId
        ? (active?.data?.parts || [])
        : [],
    })) : []
    return [row.id, {
      parts: active?.data?.parts || [],
      version: data.currentVersion || active?.data?.version || 'Initial',
      currency: data.sourceCurrency || active?.data?.currency || 'INR',
      uploaded: data.uploaded || active?.data?.uploaded || '',
      activeVersionId: activeId,
      versions,
    }]
  }))
  for (const row of listRows) {
    const key = normalizedKey(CONSOLIDATED_PRICE_LIST_ENTITY, row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  for (const row of versionsResult.data || []) {
    const key = normalizedKey(CONSOLIDATED_PRICE_VERSION_ENTITY, row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  return result
}

export async function loadPriceLists({ force = false } = {}) {
  if (!supabase) return readPriceListsCache() ? { priceLists: readPriceListsCache(), cached: true } : null
  if (!force && priceListCache && Date.now() - priceListCacheAt < LOAD_CACHE_MS) return { priceLists: priceListCache, cached: true }
  if (priceListInFlight) return priceListInFlight
  priceListInFlight = (async () => {
    const consolidated = await loadConsolidatedPriceLists()
    if (!consolidated) {
      const fallback = readPriceListsCache()
      if (fallback && Object.keys(fallback).length) {
        return { priceLists: fallback, cached: true, degraded: true }
      }
      throw new Error('Consolidated price-list records are unavailable')
    }
    writePriceListsCache(consolidated)
    return { priceLists: consolidated }
  })()
  try { return await priceListInFlight } finally { priceListInFlight = null }
}

export async function loadPriceListVersion(listCode, versionCode) {
  if (!supabase) return null
  const consolidatedId = priceVersionRecordId(listCode, versionCode)
  const consolidated = await supabase.from('records')
    .select('id, data')
    .eq('entity', CONSOLIDATED_PRICE_VERSION_ENTITY)
    .eq('id', consolidatedId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!consolidated.error && consolidated.data?.data) return mapConsolidatedVersion({ id: consolidated.data.id, ...consolidated.data.data })
  throw consolidated.error || new Error(`Price list version ${listCode} ${versionCode} was not found`)
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

// Deep links need a narrow recovery read when the fast workspace list is
// stale or omitted a row that is still present in the normalized table.
export async function loadOpportunity(id) {
  if (!supabase || !id) return null
  const result = await supabase.from('opportunities')
    .select('id, data, rev')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error) throw result.error
  const row = result.data
  if (!row) return null
  opportunityRevisions.set(row.id, Number(row.rev) || 0)
  opportunityRecords.set(row.id, { data: row.data, rev: Number(row.rev) || 0 })
  return row.data
}

// Secondary startup path. This deliberately reuses the complete loader so
// focus/realtime refreshes continue to have one authoritative code path.
export async function loadBackground() {
  return loadAll({ force: true })
}

async function fetchCore() {
  try {
    const [consolidatedConfig, consolidatedState, business] = await Promise.all([
      loadConsolidatedConfig(),
      loadConsolidatedState(),
      loadBusinessTables({ includeRecords: false }),
    ])
    const slices = {}
    if (consolidatedState) Object.assign(slices, consolidatedState)
    if (consolidatedConfig) slices.config = consolidatedConfig
    for (const [key, value] of Object.entries(business)) {
      if (key !== 'recordCount' && value != null) slices[key] = value
    }
    const hasBusinessData = [business.leads, business.opportunities, business.approvals].some(value => Array.isArray(value) && value.length > 0)
      || Number(business.recordCount) > 0
    return {
      empty: !consolidatedConfig && !consolidatedState && !hasBusinessData,
      slices,
      diagnostics: {
        normalizedOpportunityCount: Array.isArray(business.opportunities) ? business.opportunities.length : 0,
      },
    }
  } catch (e) {
    console.warn('Supabase core load failed — staying on localStorage:', e?.message)
    return null
  }
}

async function fetchAll() {
  try {
    const slices = {}
    const [consolidatedConfig, consolidatedState] = await Promise.all([
      loadConsolidatedConfig(),
      loadConsolidatedState(),
    ])
    if (consolidatedState) Object.assign(slices, consolidatedState)
    if (consolidatedConfig) slices.config = consolidatedConfig
    if (consolidatedConfig) writeCachedRules(consolidatedConfig)
    const business = await loadBusinessTables({ includeRecords: true })
    // Apply empty normalized arrays too. This prevents stale local/demo rows
    // from surviving when the server intentionally has no active rows.
    for (const [key, value] of Object.entries(business)) {
      if (key !== 'recordCount' && value != null) slices[key] = value
    }
    const hasBusinessData = Object.values(business).some(value => Array.isArray(value) ? value.length > 0 : Object.keys(value || {}).length > 0)
      || Number(business.recordCount) > 0
    return {
      empty: !consolidatedConfig && !consolidatedState && !hasBusinessData,
      slices,
      diagnostics: {
        normalizedOpportunityCount: Array.isArray(business.opportunities) ? business.opportunities.length : 0,
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
async function saveSlicesNow(dirty) {
  if (!supabase) return
  invalidateLoadCache()
  let normalizedDirty = dirty
  const savedBusiness = await saveBusinessTables(dirty)
  if (savedBusiness.length) {
    normalizedDirty = { ...normalizedDirty }
    for (const key of savedBusiness) delete normalizedDirty[key]
  }
  if (dirty.config) {
    try {
      await saveConsolidatedConfig(dirty.config)
      normalizedDirty = { ...normalizedDirty }
      delete normalizedDirty.config
    } catch (e) {
      throw e
    }
  }
  if (dirty.priceLists) {
    const savedPriceLists = await savePriceLists(dirty.priceLists)
    if (savedPriceLists) {
      const { priceLists, ...rest } = normalizedDirty
      normalizedDirty = rest
    }
  }
  const savedState = await saveConsolidatedState(normalizedDirty)
  if (savedState.length) {
    normalizedDirty = { ...normalizedDirty }
    for (const key of savedState) delete normalizedDirty[key]
  }
  if (Object.keys(normalizedDirty).some(key => !BUSINESS_KEYS.has(key))) {
    throw new Error('Unsupported unsaved state remains after consolidated persistence')
  }
}

// A page-hide flush can overlap a debounced save, and a focus refresh can
// trigger another save before either has finished. Keep all slice writes in a
// single queue so revision maps cannot be observed halfway through a write.
export function saveSlices(dirty) {
  saveSlicesQueue = saveSlicesQueue
    .catch(() => {})
    .then(() => saveSlicesNow(dirty))
  return saveSlicesQueue
}

const BUSINESS_KEYS = new Set(['leads', 'opportunities', 'approvals', 'proposals', 'sparesLines', 'clarifications', 'audit', 'priceLists'])

async function loadBusinessTables({ includeRecords = true } = {}) {
  // The records table contains large proposal, audit, clarification, and
  // sourcing JSON payloads. Do not transfer it during the critical startup
  // path; a count is enough to distinguish an empty workspace from one whose
  // secondary records are still loading.
  const recordsQuery = includeRecords
    ? supabase.from('records').select('entity, id, data, rev').is('deleted_at', null).in('entity', ['proposals', 'spares_lines', 'clarifications', 'audit'])
    : supabase.from('records').select('entity', { count: 'exact', head: true }).is('deleted_at', null)
  const tables = await Promise.all([
    supabase.from('leads').select('id, data, rev').is('deleted_at', null),
    supabase.from('opportunities').select('id, data, rev').is('deleted_at', null),
    supabase.from('approvals').select('id, data, rev').is('deleted_at', null),
    recordsQuery,
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
    throw failedTables[0].error
  }
  const records = tables[3].data || []
  if (includeRecords) {
    opportunityRevisions.clear()
    opportunityRecords.clear()
    for (const entity of ['leads', 'approvals', 'proposals', 'spares_lines', 'clarifications', 'audit']) clearNormalizedEntity(entity)
  }
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
    recordCount: includeRecords ? records.length : (Number(tables[3].count) || 0),
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
  const applyAccepted = (payload, conflicts) => {
    const conflictIds = new Set(conflicts.map(conflict => conflict.id))
    for (const row of payload) {
      if (conflictIds.has(row.id)) continue
      const key = normalizedKey(entity, row.id)
      normalizedRevisions.set(key, row.rev + 1)
      if (row.deleted) normalizedRecords.delete(key)
      else normalizedRecords.set(key, { data: row.data, rev: row.rev + 1 })
    }
  }

  let pending = normalizedPayload(entity, rows, deletedIds)
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
    const result = await write(pending)
    const conflicts = Array.isArray(result.conflicts) ? result.conflicts : []
    applyAccepted(pending, conflicts)
    if (!conflicts.length) return
    pending = conflicts.map(serverRow => ({
      id: serverRow.id,
      data: localById.get(serverRow.id) || serverRow.data,
      rev: Number(serverRow.rev) || 0,
      deleted: !localById.has(serverRow.id),
    }))
  }
  if (pending.length) {
    throw new Error(`${entity} save conflict for ${pending.map(row => row.id).join(', ')}`)
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

  const applyAccepted = (payload, conflicts) => {
    const conflictIds = new Set(conflicts.map(conflict => conflict.id))
    for (const row of payload) {
      if (conflictIds.has(row.id)) continue
      opportunityRevisions.set(row.id, row.rev + 1)
      if (row.deleted) opportunityRecords.delete(row.id)
      else opportunityRecords.set(row.id, { data: row.data, rev: row.rev + 1 })
    }
  }

  // Latest-save-wins: rebase only rows rejected by the revision guard onto
  // the newest server revision, preserving the local row being saved.
  let pending = opportunityPayload(rows, deletedIds)
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
    const result = await write(pending)
    const conflicts = Array.isArray(result.conflicts) ? result.conflicts : []
    applyAccepted(pending, conflicts)
    if (!conflicts.length) return
    pending = conflicts.map(serverRow => {
      const local = localById.get(serverRow.id)
      return {
        id: serverRow.id,
        data: local || serverRow.data,
        rev: Number(serverRow.rev) || 0,
        deleted: !local,
      }
    }).filter(Boolean)
  }
  if (pending.length) {
    throw new Error(`Opportunity save conflict for ${pending.map(row => row.id).join(', ')}`)
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
  priceListCache = null
  priceListCacheAt = 0
  try {
    const listRows = Object.entries(priceLists).map(([listCode, list]) => {
      const versions = Array.isArray(list.versions) && list.versions.length
        ? list.versions
        : [{ version: list.version || 'Initial', currency: list.currency || 'INR', uploaded: list.uploaded || '', parts: list.parts || [] }]
      return {
        id: listCode,
        listCode,
        supplierName: listCode,
        sourceCurrency: String(list.currency || 'INR').toUpperCase(),
        currentVersion: list.version || versions[0]?.version || 'Initial',
        uploaded: list.uploaded || '',
        activeVersionId: list.activeVersionId || priceVersionRecordId(listCode, list.version || versions[0]?.version || 'Initial'),
        versions: versions.map(version => ({
          id: version.id || priceVersionRecordId(listCode, version.version || 'Initial'),
          version: version.version || 'Initial',
          currency: String(version.currency || list.currency || 'INR').toUpperCase(),
          uploaded: version.uploaded || '',
          filename: version.filename || '',
        })),
      }
    })
    const versionRows = Object.entries(priceLists).flatMap(([listCode, list]) => {
      const versions = Array.isArray(list.versions) && list.versions.length
        ? list.versions
        : [{ version: list.version || 'Initial', currency: list.currency || 'INR', uploaded: list.uploaded || '', parts: list.parts || [] }]
      return versions.map(version => ({
        id: version.id || priceVersionRecordId(listCode, version.version || 'Initial'),
        listCode,
        version: version.version || 'Initial',
        currency: String(version.currency || list.currency || 'INR').toUpperCase(),
        uploaded: version.uploaded || '',
        filename: version.filename || '',
        parts: Array.isArray(version.parts) ? version.parts : [],
      }))
    })
    await saveNormalizedRowsNow(CONSOLIDATED_PRICE_LIST_ENTITY, listRows)
    await saveNormalizedRowsNow(CONSOLIDATED_PRICE_VERSION_ENTITY, versionRows)
    return true
  } catch (e) {
    console.warn('Consolidated price-list save failed:', e?.message)
    throw e
  }
}

// Reset Demo: overwrite every slice with seeds and drop stray rows. Upserting
// (rather than delete-all) means other open devices refetch seeds on focus
// instead of racing to re-push their stale state.
export async function resetAll(seedMap) {
  if (!supabase) return
  await saveSlices(seedMap)
  const stateKeys = Object.keys(seedMap).filter(key => !BUSINESS_KEYS.has(key) && key !== 'config')
  const { error } = await supabase.from('records').delete()
    .eq('entity', CONSOLIDATED_STATE_ENTITY)
    .not('id', 'in', `(${stateKeys.join(',') || '__none__'})`)
  if (error) throw error
}
