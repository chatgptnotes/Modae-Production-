import { describeSupabaseError, isSupabaseAuthError, supabase } from './supabase.js'
import { writeCachedRules } from './rules.js'

// Server persistence for the store: normalized business rows plus dedicated
// JSONB entity tables. Mirrors the filestore facade —
// every function no-ops when Supabase isn't configured, so the app keeps its
// original localStorage-only behavior without env vars.

// Per-device/session state that must never be shared across browsers.
export const LOCAL_ONLY = ['viewMode', 'viewModePinned', 'tabletTheme', 'spSync', 'auth', 'role',
  'inboxShowAll', 'leadSyncBaseline', 'clarificationSyncBaseline', 'opportunitySyncBaseline',
  'sparesLinesSyncBaseline', 'deletedLeadIds', 'deletedOpportunityIds', 'pendingOpportunitySyncIds',
  // Migration markers and derived deadline timers belong to this browser.
  // Persisting them as shared state makes every device dirty immediately
  // after hydration, even though they are not authoritative business rows.
  'catalogRev', 'oneTimeCleanups', 'leadDeadlines']

export const dbEnabled = () => !!supabase

export const DEDICATED_ENTITIES = {
  proposals: 'proposals',
  spares_lines: 'spares_lines',
  clarifications: 'clarifications',
  audit: 'audit',
  settings: 'settings',
  price_lists: 'price_lists',
  price_list_versions: 'price_list_versions',
}

const dedicatedTableFor = entity => DEDICATED_ENTITIES[entity] || null

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

async function currentActorId() {
  if (!supabase?.auth) return null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error && isSupabaseAuthError(error)) throw error
    return data?.user?.id || null
  } catch (error) {
    if (isSupabaseAuthError(error)) throw error
    return null
  }
}

const annotateRpcError = (entity, error) => Object.assign(error, {
  entity,
  ...describeSupabaseError(error, `save_rows.${entity}`),
})
const clearNormalizedEntity = entity => {
  const prefix = `${entity}|`
  for (const key of normalizedRecords.keys()) if (key.startsWith(prefix)) {
    normalizedRecords.delete(key)
    normalizedRevisions.delete(key)
  }
}

// Configuration and catalogue metadata use dedicated JSONB tables while the
// legacy records rows remain readable during rollout.
async function loadEntityRows(entity, { ids = null } = {}) {
  const table = dedicatedTableFor(entity)
  if (!table) return { data: [], error: new Error(`Unknown dedicated entity: ${entity}`) }
  let query = supabase.from(table).select('id, data, rev').is('deleted_at', null)
  if (ids?.length) query = query.in('id', ids)
  const dedicated = await query
  if (!dedicated.error) return { ...dedicated, legacy: false }

  // Keep old deployments readable while migration 008 is being applied.
  let legacy = supabase.from('records').select('id, data, rev').eq('entity', entity).is('deleted_at', null)
  if (ids?.length) legacy = legacy.in('id', ids)
  const fallback = await legacy
  if (!fallback.error) return { ...fallback, legacy: true }
  return dedicated.error ? dedicated : fallback
}

async function loadConsolidatedConfig() {
  const result = await loadEntityRows(CONSOLIDATED_SETTINGS_ENTITY, { ids: [CONSOLIDATED_SETTINGS_ID] })
  const row = result.data?.[0]
  if (result.error || !row?.data || typeof row.data !== 'object') return null
  const key = normalizedKey(CONSOLIDATED_SETTINGS_ENTITY, CONSOLIDATED_SETTINGS_ID)
  normalizedRevisions.set(key, Number(row.rev) || 0)
  normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  return row.data
}

async function saveConsolidatedConfig(config = {}) {
  const key = normalizedKey(CONSOLIDATED_SETTINGS_ENTITY, CONSOLIDATED_SETTINGS_ID)
  const accepted = await saveConsolidatedRows(CONSOLIDATED_SETTINGS_ENTITY, [{
    id: CONSOLIDATED_SETTINGS_ID,
    data: config,
    rev: normalizedRevisions.get(key) ?? 0,
  }], 'configuration')
  if (!accepted.length) throw new Error('Consolidated configuration could not be saved')
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

async function saveConsolidatedRows(entity, rows, label) {
  if (!rows.length) return []
  const actor = await currentActorId()
  const localById = new Map(rows.map(row => [row.id, row]))
  let pending = rows
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
    const result = await supabase.rpc('save_rows', {
      p_entity: entity,
      p_rows: pending.map(row => ({ ...row, by: actor })),
    })
    if (result.error) throw annotateRpcError(entity, result.error)
    const conflicts = Array.isArray(result.data?.conflicts) ? result.data.conflicts : []
    const conflictIds = new Set(conflicts.map(conflict => conflict.id))
    for (const row of pending) {
      if (conflictIds.has(row.id)) continue
      const key = normalizedKey(entity, row.id)
      normalizedRevisions.set(key, row.rev + 1)
      normalizedRecords.set(key, { data: row.data, rev: row.rev + 1 })
    }
    if (!conflicts.length) return pending.map(row => row.id)
    pending = conflicts.map(serverRow => {
      const local = localById.get(serverRow.id)
      return {
        id: serverRow.id,
        data: local?.data ?? serverRow.data,
        rev: Number(serverRow.rev) || 0,
      }
    })
  }
  throw new Error(`Consolidated ${label} save conflict after ${MAX_CONFLICT_RETRIES + 1} attempts`)
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
  return saveConsolidatedRows(CONSOLIDATED_STATE_ENTITY, rows, 'state')
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
  const listsResult = await loadEntityRows(CONSOLIDATED_PRICE_LIST_ENTITY)
  if (listsResult.error || !listsResult.data?.length) return null

  const listRows = listsResult.data
  const activeVersionIds = listRows
    .map(row => row.data?.activeVersionId || priceVersionRecordId(row.id, row.data?.currentVersion || ''))
    .filter(Boolean)
  const versionsResult = activeVersionIds.length
    ? await loadEntityRows(CONSOLIDATED_PRICE_VERSION_ENTITY, { ids: activeVersionIds })
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
  const consolidated = await loadEntityRows(CONSOLIDATED_PRICE_VERSION_ENTITY, { ids: [consolidatedId] })
  const row = consolidated.data?.[0]
  if (!consolidated.error && row?.data) return mapConsolidatedVersion({ id: row.id, ...row.data })
  throw consolidated.error || new Error(`Price list version ${listCode} ${versionCode} was not found`)
}

// → { empty, slices: {key: value} } | null when disabled or on error
// (caller stays on localStorage and may retry later).
export async function loadAll({ force = false } = {}) {
  if (!supabase) return null
  if (!force && loadCache && Date.now() - loadCacheAt < LOAD_CACHE_MS) return loadCache
  // Focus/live-sync events can arrive while a pull is running. Reuse the
  // current request instead of chaining another full database read behind it;
  // the next explicit refresh can start a new request after this one settles.
  if (loadInFlight) {
    return loadInFlight
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
// focus and route refreshes continue to have one authoritative code path.
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
    return {
      empty: false,
      error: { message: e?.message || 'Supabase core load failed', code: e?.code || '', status: e?.status || null },
      slices: {},
      diagnostics: { normalizedOpportunityCount: null, lastLoadError: { message: e?.message || 'Supabase core load failed', code: e?.code || '', status: e?.status || null } },
    }
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
    return {
      empty: false,
      error: { message: e?.message || 'Supabase load failed', code: e?.code || '', status: e?.status || null },
      slices: {},
      diagnostics: { normalizedOpportunityCount: null, lastLoadError: { message: e?.message || 'Supabase load failed', code: e?.code || '', status: e?.status || null } },
    }
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
  const unsavedKeys = Object.keys(normalizedDirty)
  if (unsavedKeys.length) {
    throw new Error(`Unsupported unsaved state remains after consolidated persistence: ${unsavedKeys.join(', ')}`)
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
  const legacyQuery = includeRecords
    ? supabase.from('records').select('entity, id, data, rev').is('deleted_at', null).in('entity', ['proposals', 'spares_lines', 'clarifications', 'audit'])
    : supabase.from('records').select('entity', { count: 'exact', head: true }).is('deleted_at', null)
  const baseTables = await Promise.all([
    supabase.from('leads').select('id, data, rev').is('deleted_at', null),
    supabase.from('opportunities').select('id, data, rev').is('deleted_at', null),
    supabase.from('approvals').select('id, data, rev').is('deleted_at', null),
    legacyQuery,
  ])
  const dedicatedEntities = ['proposals', 'spares_lines', 'clarifications', 'audit']
  const dedicated = includeRecords
    ? await Promise.all(dedicatedEntities.map(async entity => ({ entity, result: await loadEntityRows(entity) })))
    : await Promise.all(dedicatedEntities.map(async entity => ({
      entity,
      result: await supabase.from(dedicatedTableFor(entity)).select('id', { count: 'exact', head: true }).is('deleted_at', null),
    })))
  const failedTables = baseTables
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
  const records = baseTables[3].data || []
  if (includeRecords) {
    opportunityRevisions.clear()
    opportunityRecords.clear()
    for (const entity of ['leads', 'approvals', 'proposals', 'spares_lines', 'clarifications', 'audit']) clearNormalizedEntity(entity)
  }
  for (const row of baseTables[1].data || []) {
    opportunityRevisions.set(row.id, Number(row.rev) || 0)
    opportunityRecords.set(row.id, { data: row.data, rev: Number(row.rev) || 0 })
  }
  for (const row of baseTables[0].data || []) {
    const key = normalizedKey('leads', row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  for (const row of baseTables[2].data || []) {
    const key = normalizedKey('approvals', row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  const legacyRows = includeRecords ? (baseTables[3].data || []) : []
  for (const row of legacyRows) {
    const key = normalizedKey(row.entity, row.id)
    normalizedRevisions.set(key, Number(row.rev) || 0)
    normalizedRecords.set(key, { data: row.data, rev: Number(row.rev) || 0 })
  }
  const rowsFor = entity => {
    const dedicatedResult = dedicated.find(item => item.entity === entity)?.result
    const dedicatedRows = dedicatedResult?.error ? [] : (dedicatedResult?.data || [])
    const legacyRowsForEntity = dedicatedResult?.legacy
      ? legacyRows.filter(row => row.entity === entity)
      : []
    const byId = new Map(legacyRowsForEntity.map(row => [row.id, row]))
    dedicatedRows.forEach(row => byId.set(row.id, row))
    return [...byId.values()]
  }
  const dedicatedCount = dedicated.reduce((sum, item) => sum + (Number(item.result?.count) || (includeRecords ? item.result?.data?.length || 0 : 0)), 0)
  const legacyCount = includeRecords ? legacyRows.length : (Number(baseTables[3].count) || 0)
  return {
    leads: baseTables[0].data.map(row => row.data),
    opportunities: baseTables[1].data.map(row => row.data),
    approvals: baseTables[2].data.map(row => row.data),
    proposals: Object.fromEntries(rowsFor('proposals').map(row => [row.id, row.data])),
    sparesLines: rowsFor('spares_lines').map(row => row.data),
    clarifications: rowsFor('clarifications').map(row => row.data),
    audit: rowsFor('audit').map(row => row.data),
    recordCount: includeRecords ? dedicatedCount + legacyCount : dedicatedCount + legacyCount,
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
  const actor = await currentActorId()
  const localById = new Map(rows.map(row => [row.id, row]))
  const prefix = `${entity}|`
  const deletedIds = [...normalizedRecords.keys()]
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .filter(id => !localById.has(id))
  const write = async payload => {
    const result = await supabase.rpc('save_rows', { p_entity: entity, p_rows: payload.map(row => ({ ...row, by: actor })) })
    if (result.error) throw annotateRpcError(entity, result.error)
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
  const actor = await currentActorId()
  const changedRows = rows.filter(row => {
    const previous = opportunityRecords.get(row.id)
    return !previous || JSON.stringify(previous.data) !== JSON.stringify(row)
  })
  const localById = new Map(changedRows.map(row => [row.id, row]))
  const deletedIds = [...opportunityRecords.keys()].filter(id => !localById.has(id))
    .filter(id => !rows.some(row => row.id === id))

  // A normal state flush carries the complete local list, but only changed
  // rows belong in the optimistic write. Rewriting every opportunity makes
  // unrelated browsers conflict with one another and can starve a new row.
  if (!changedRows.length && !deletedIds.length) return

  const write = async payload => {
    const result = await supabase.rpc('save_rows', { p_entity: 'opportunities', p_rows: payload.map(row => ({ ...row, by: actor })) })
    if (result.error) throw annotateRpcError('opportunities', result.error)
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
  let pending = opportunityPayload(changedRows, deletedIds)
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
