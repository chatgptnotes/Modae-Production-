import { supabase } from './supabase.js'
import { applyRuleRows, readCachedRules, writeCachedRules } from './rules.js'

// Server persistence for the store: one JSONB row per top-level state slice in
// public.app_state (see supabase-setup.sql). Mirrors the filestore facade —
// every function no-ops when Supabase isn't configured, so the app keeps its
// original localStorage-only behavior without env vars.

// Per-device/session state that must never be shared across browsers.
export const LOCAL_ONLY = ['viewMode', 'viewModePinned', 'tabletTheme', 'spSync', 'auth', 'role',
  'inboxShowAll', 'leadSyncBaseline', 'clarificationSyncBaseline']

export const dbEnabled = () => !!supabase

const TABLE = 'app_state'

// → { empty, slices: {key: value} } | null when disabled or on error
// (caller stays on localStorage and may retry later).
export async function loadAll() {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from(TABLE).select('key, value')
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
    for (const [key, value] of Object.entries(business)) {
      if (value != null && (!Array.isArray(value) || value.length)) slices[key] = value
    }
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
    return { empty: (!data || data.length === 0) && !settings.data?.length && !rates.data?.length && !priceLists.data?.length && !hasBusinessData, slices }
  } catch (e) {
    console.warn('Supabase load failed — staying on localStorage:', e?.message)
    return null
  }
}

// dirty: {key: value}. Throws on error so the caller can keep the keys dirty.
export async function saveSlices(dirty) {
  if (!supabase) return
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

const BUSINESS_KEYS = new Set(['leads', 'opportunities', 'approvals', 'proposals', 'sparesLines', 'audit', 'priceLists'])

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
    supabase.from('leads').select('data'),
    supabase.from('opportunities').select('data'),
    supabase.from('approvals').select('data'),
    supabase.from('records').select('entity, id, data').in('entity', ['proposals', 'spares_lines', 'audit']),
  ])
  if (tables.some(result => result.error)) return {}
  const records = tables[3].data || []
  return {
    leads: tables[0].data.map(row => row.data),
    opportunities: tables[1].data.map(row => row.data),
    approvals: tables[2].data.map(row => row.data),
    proposals: Object.fromEntries(records.filter(row => row.entity === 'proposals').map(row => [row.id, row.data])),
    sparesLines: records.filter(row => row.entity === 'spares_lines').map(row => row.data),
    audit: records.filter(row => row.entity === 'audit').map(row => row.data),
  }
}

async function saveBusinessTables(dirty = {}) {
  const writes = []
  if (dirty.leads) writes.push(['leads', supabase.from('leads').upsert(dirty.leads.map(row => ({ id: row.id, data: row, rev: 1, updated_at: new Date().toISOString() })), { onConflict: 'id' })])
  if (dirty.opportunities) writes.push(['opportunities', supabase.from('opportunities').upsert(dirty.opportunities.map(row => ({ id: row.id, data: row, rev: 1, updated_at: new Date().toISOString() })), { onConflict: 'id' })])
  if (dirty.approvals) writes.push(['approvals', supabase.from('approvals').upsert(dirty.approvals.map(row => ({ id: row.id, data: row, rev: 1, updated_at: new Date().toISOString() })), { onConflict: 'id' })])
  if (dirty.sparesLines) writes.push(['sparesLines', supabase.from('records').upsert(dirty.sparesLines.map(row => ({ entity: 'spares_lines', id: row.id, data: row, rev: 1, updated_at: new Date().toISOString() })), { onConflict: 'entity,id' })])
  if (dirty.audit) writes.push(['audit', supabase.from('records').upsert(dirty.audit.map(row => ({ entity: 'audit', id: row.id || `AUD-${row.ts || Date.now()}-${Math.random().toString(36).slice(2, 7)}`, data: row, rev: 1, updated_at: new Date().toISOString() })), { onConflict: 'entity,id' })])
  if (dirty.proposals) writes.push(['proposals', supabase.from('records').upsert(Object.entries(dirty.proposals).map(([id, row]) => ({ entity: 'proposals', id, data: row, rev: 1, updated_at: new Date().toISOString() })), { onConflict: 'entity,id' })])
  if (!writes.length) return []
  const results = await Promise.all(writes.map(([, promise]) => promise))
  if (results.some(result => result.error)) return []
  return writes.map(([key]) => key === 'sparesLines' ? 'sparesLines' : key === 'opportunities' ? 'opportunities' : key === 'proposals' ? 'proposals' : key)
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
