import * as datastore from './datastore.js'
import {
  seedOpportunities, seedFiles, seedPriceLists, seedAdhocParts,
  seedRateSheet, seedCustomers, seedUsers, seedLeads, seedApprovals,
  seedConfig, seedKyc, seedSales, seedSparesLines, seedSparesAlternatives,
  seedRateSheets, seedSvcEstimates, seedClarifications, seedHandover,
  seedAiLeads, seedJointApprovals, seedCatalogRev,
  seedPoCompare, milestoneForStage, routeForType, contextForType,
  ROLES, B_STEPS, defaultBStepOwners, DEFAULT_WORKFLOW,
} from './seed.js'
import { normalizePriceFields } from './pricing.js'
import { DEFAULT_CURRENCY_RATES, normalizedCurrencyRates } from './currency.js'
import { DEFAULT_CLAUSES } from './clauses.js'

// The store's pure state layer, lifted out of store.jsx so it can be imported
// and *run* by the tests — store.jsx is JSX and node --test cannot parse it,
// which would have left the demo-data gating below covered only by regexes.
// Nothing here touches React; StoreProvider owns everything that does.

// v3: schema updated after the Aug 10 meeting review (prob column, Partner Docs
// key, corrected products, costing.usdBase/financeCostK) — bump forces a reseed.
// Bumped to v4 with the expanded FY26 history + FY27 pipeline seed — v3 caches
// hold the old 14-row dataset and would never show it.
export const KEY = 'wintrack-modae-v4'

// Exported: store.syncViewMode() calls this on resize. It used to live in
// store.jsx and was left behind as a bare identifier when this module was
// extracted — which crashed StoreProvider on boot without failing either the
// build or the test suite (node --test cannot load JSX, and an unresolved
// identifier is valid syntax until it runs).
export const defaultViewMode = () => (typeof window !== 'undefined' && window.innerWidth <= 1024 ? 'tablet' : 'full')

// Additive backfill for state saved before the BT-prototype port (phase 2) —
// never reseeds over the user's data.
export function migrate(s) {
  // Demo-data mode. `false` means the user removed the seeded dataset (see
  // clearDemo below), so every seed *record* backfill in this function is
  // skipped — otherwise the next boot would quietly put the demo rows back.
  // Reference data (logins, config, price lists, rate sheets) is deliberately
  // NOT gated: it is what the app needs to stay usable in either mode.
  if (s.demoData === undefined) s.demoData = true
  const demo = s.demoData !== false
  if (!Array.isArray(s.users)) s.users = seedUsers
  s.users = s.users.map(u => (u.pw ? u : { ...u, pw: 'Demo@1234' }))
  // Backfill new seed accounts (TECH/CUST) by email; saved states may already
  // hold self-registered users on the same U-nnn ids, so reassign on collision.
  const nextUserId = () =>
    'U-' + String(Math.max(0, ...s.users.map(u => parseInt(String(u.id).replace(/\D/g, ''), 10) || 0)) + 1).padStart(3, '0')
  for (const su of seedUsers) {
    if (!s.users.some(u => u.email.toLowerCase() === su.email.toLowerCase())) {
      s.users.push(s.users.some(u => u.id === su.id) ? { ...su, id: nextUserId() } : su)
    }
  }
  // Repair states saved before the collision guard existed: duplicate ids get
  // fresh ones (first occurrence keeps its id — it may be referenced elsewhere).
  {
    let maxId = Math.max(0, ...s.users.map(u => parseInt(String(u.id).replace(/\D/g, ''), 10) || 0))
    const seen = new Set()
    s.users = s.users.map(u => {
      if (!seen.has(u.id)) { seen.add(u.id); return u }
      maxId += 1
      const id = 'U-' + String(maxId).padStart(3, '0')
      seen.add(id)
      return { ...u, id }
    })
  }
  if (!ROLES[s.role]) s.role = 'SUPER'
  if (!s.communications) s.communications = {}
  if (!Array.isArray(s.leads)) s.leads = demo ? seedLeads : []
  if (!Array.isArray(s.deletedLeadIds)) s.deletedLeadIds = []
  if (!Array.isArray(s.approvals)) s.approvals = demo ? seedApprovals : []
  if (!Array.isArray(s.audit)) s.audit = []
  // ---- phase 2 slices ----
  if (!s.config) s.config = seedConfig
  s.config.currencyRates = normalizedCurrencyRates(s.config.currencyRates || DEFAULT_CURRENCY_RATES)
  s.config.costingDefaults = { ...seedConfig.costingDefaults, ...(s.config.costingDefaults || {}) }
  s.config.approvalThresholds = { ...seedConfig.approvalThresholds, ...(s.config.approvalThresholds || {}) }
  if (!Array.isArray(s.config.approvalThresholds.pricingApprovers) || !s.config.approvalThresholds.pricingApprovers.length) {
    s.config.approvalThresholds.pricingApprovers = [...seedConfig.approvalThresholds.pricingApprovers]
  }
  s.config.leadDeadlines = { ...seedConfig.leadDeadlines, ...(s.config.leadDeadlines || {}) }
  if (!Number.isFinite(Number(s.config.proposalValidityDays)) || Number(s.config.proposalValidityDays) < 1) s.config.proposalValidityDays = seedConfig.proposalValidityDays
  s.config.fastTrack = { ...seedConfig.fastTrack, ...(s.config.fastTrack || {}) }
  s.config.classRules = { ...seedConfig.classRules, ...(s.config.classRules || {}) }
  // Customer-class rules moved from hardcoded branches into config. Merge per
  // class (and per sub-object) so a state that has edited one class keeps that
  // edit while still picking up fields added later. Two legacy values are
  // adopted on the first run: the Amber timer the Admin page used to write to a
  // key nothing read, and the per-class payment terms from classRules.
  {
    const saved = s.config.customerClasses || {}
    const legacyDays = {
      Blue: s.config.leadDeadlines?.kycDays,
      Amber: s.config.amberFee?.days ?? s.config.leadDeadlines?.amberFeeDays,
    }
    const mergeSub = (defSub, prevSub) => {
      if (prevSub === null) return null
      if (!defSub) return prevSub ?? null
      return { ...defSub, ...(prevSub || {}) }
    }
    s.config.customerClasses = Object.fromEntries(
      Object.entries(seedConfig.customerClasses).map(([cls, def]) => {
        const prev = saved[cls] || {}
        const days = prev.verification?.deadlineDays
          ?? (def.verification?.deadlineDays ? legacyDays[cls] : undefined)
          ?? def.verification?.deadlineDays
        return [cls, {
          ...def, ...prev,
          verification: { ...mergeSub(def.verification, prev.verification), deadlineDays: Number(days) || 0 },
          gate: mergeSub(def.gate, prev.gate),
          advisory: mergeSub(def.advisory, prev.advisory),
          paymentTerms: prev.paymentTerms ?? s.config.classRules?.[cls] ?? def.paymentTerms,
        }]
      }))
    // Keep any class a state carries beyond the four seeded ones.
    for (const [cls, rule] of Object.entries(saved)) {
      if (!s.config.customerClasses[cls]) s.config.customerClasses[cls] = rule
    }
  }
  s.config.documentChecklists = { ...seedConfig.documentChecklists, ...(s.config.documentChecklists || {}) }
  s.config.clauses = Array.isArray(s.config.clauses) ? s.config.clauses : DEFAULT_CLAUSES.map(clause => ({ ...clause }))
  s.config.kycValidation = Object.fromEntries(Object.entries(seedConfig.kycValidation || {}).map(([key, rule]) => [
    key, { ...rule, ...(s.config.kycValidation?.[key] || {}) },
  ]))
  if (!Array.isArray(s.config.stateRegions)) s.config.stateRegions = seedConfig.stateRegions
  if (!Array.isArray(s.config.ownerRules)) s.config.ownerRules = seedConfig.ownerRules
  s.config.roleNames = { ...seedConfig.roleNames, ...(s.config.roleNames || {}) }
  if (!Array.isArray(s.config.workflow) || !s.config.workflow.length) s.config.workflow = DEFAULT_WORKFLOW.map(x => ({ ...x }))
  s.config.workflow = s.config.workflow.map((stage, i) => ({
    ...DEFAULT_WORKFLOW[i], ...stage,
    id: stage.id || DEFAULT_WORKFLOW[i]?.id || `stage-${i + 1}`,
    order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : i,
    enabled: stage.enabled !== false,
  }))
  if (!s.config.uploads) s.config.uploads = seedConfig.uploads
  if (!Array.isArray(s.config.uploads.proposalTemplates)) s.config.uploads.proposalTemplates = seedConfig.uploads.proposalTemplates || []
  if (!Array.isArray(s.config.uploads.datasheets)) s.config.uploads.datasheets = seedConfig.uploads.datasheets || []
  if (!s.config.uploads.kycTemplates || typeof s.config.uploads.kycTemplates !== 'object') s.config.uploads.kycTemplates = seedConfig.uploads.kycTemplates || {}
  if (!s.config.aiModel) s.config.aiModel = seedConfig.aiModel
  // Gemini is wired for real now: drop the key fields saved state used to carry
  // (a key must never live in client state), and retire the placeholder model
  // IDs the picker offered before the real ones were known.
  if ('keySet' in s.config.aiModel || 'keyMasked' in s.config.aiModel) {
    const { keySet, keyMasked, ...rest } = s.config.aiModel
    s.config.aiModel = rest
  }
  if (!s.config.aiModel.model || /^gemini-(pro|flash)$/.test(s.config.aiModel.model) || s.config.aiModel.model === 'gemini-3.6-flash') {
    s.config.aiModel = { ...seedConfig.aiModel, ...s.config.aiModel, ...{ provider: 'Google', model: seedConfig.aiModel.model } }
  }
  if (!s.kyc) s.kyc = demo ? seedKyc : {}
  if (!Array.isArray(s.leadArchive)) s.leadArchive = []
  if (!Array.isArray(s.leadDeadlines)) s.leadDeadlines = []
  if (!s.sales) s.sales = demo ? seedSales : emptySales()
  if (!Array.isArray(s.sparesLines)) s.sparesLines = demo ? seedSparesLines : []
  // Repair states saved while lead-imported spares lines shared one generated
  // id. Without this, editing one row can match every duplicate and update all
  // of them together. Keep the first id (for any existing references) and give
  // later duplicates stable unique ids.
  {
    const seen = new Set()
    let repair = 1
  s.sparesLines = s.sparesLines.map(line => {
      const original = String(line.id || '')
      if (original && !seen.has(original)) {
        seen.add(original)
        return normalizePriceFields(line)
      }
      let id
      do { id = `SL-repair-${repair++}` } while (seen.has(id))
      seen.add(id)
      return normalizePriceFields({ ...line, id })
    })
  }
  if (!Array.isArray(s.sparesAlternatives)) s.sparesAlternatives = demo ? seedSparesAlternatives : []
  if (!s.rateSheets) s.rateSheets = seedRateSheets
  if (!Array.isArray(s.svcEstimates)) s.svcEstimates = demo ? seedSvcEstimates : []
  if (!Array.isArray(s.clarifications)) s.clarifications = demo ? seedClarifications : []
  if (!Array.isArray(s.vendorQuotes)) s.vendorQuotes = []
  // Demo Launcher scenario 6 needs a PO already in review to open onto. Backfill
  // by key so a saved state that predates the seed picks it up, without ever
  // overwriting a PO the user has been working on.
  if (!s.poCompare) s.poCompare = {}
  if (demo) {
    for (const [oppId, po] of Object.entries(seedPoCompare)) {
      if (!s.poCompare[oppId]) s.poCompare = { ...s.poCompare, [oppId]: po }
    }
  }
  if (!s.handover) s.handover = demo && seedHandover && Object.keys(seedHandover).length ? seedHandover : {}
  if (s.viewMode !== 'tablet' && s.viewMode !== 'full') s.viewMode = defaultViewMode()
  if (s.viewModeRestoreRev === 1) {
    s.viewMode = defaultViewMode()
    s.viewModePinned = false
    delete s.viewModeRestoreRev
  }
  if (s.tabletTheme !== 'dark' && s.tabletTheme !== 'light') s.tabletTheme = 'dark'
  // The inbox's "Show all" used to be component state, so a reload put a sales
  // owner back on their own leads — and a lead the simulator had just routed to
  // someone else looked like it had never saved. Per-device, never synced.
  if (typeof s.inboxShowAll !== 'boolean') s.inboxShowAll = false
  // Per-device baseline used to distinguish unsaved lead changes after reload.
  if (!s.leadSyncBaseline || typeof s.leadSyncBaseline !== 'object') s.leadSyncBaseline = {}
  // Diagram 02 workflow objects: the Brownfield B-01..B-05 sign-off ledger,
  // the §4 service site surveys, and §8 competitor tracking.
  if (!s.bSteps) s.bSteps = {}
  if (!s.bStepOwners) s.bStepOwners = {}
  if (!Array.isArray(s.surveys)) s.surveys = []
  if (!Array.isArray(s.competitors)) s.competitors = []
  if (!s.spSync) s.spSync = {}
  if (!s.auth) s.auth = { user: null }
  // Price lists added to the seed after a state was saved (e.g. Meggitt) land
  // by name — existing lists are the user's data and are never overwritten.
  if (!s.priceLists) s.priceLists = demo ? seedPriceLists : {}
  if (demo) {
    for (const [name, pl] of Object.entries(seedPriceLists)) {
      if (!s.priceLists[name]) s.priceLists = { ...s.priceLists, [name]: pl }
    }
  }
  // Catalogue additions — new parts in a list that already exists, new
  // rate-sheet roles, new seed ad-hoc quotes — fold in by identity (part
  // number / role / pn+date). Rows already present are left exactly as they
  // are; nothing is ever removed or repriced.
  //
  // Deliberately NOT gated on a revision counter: migrate() also runs on the
  // Supabase hydrate/focus paths, where a saved state carrying an old
  // catalogue arrives alongside an already-bumped counter and the additions
  // would be skipped forever. Part lists and the rate sheet are read-only
  // reference data (nothing in the app mutates them), so an unconditional,
  // idempotent union is both safe and self-healing.
  const mergedLists = { ...s.priceLists }
  if (demo) for (const [name, pl] of Object.entries(seedPriceLists)) {
    const have = mergedLists[name]
    if (!have || !Array.isArray(have.parts)) continue
    const known = new Set(have.parts.map(p => p.pn))
    const added = pl.parts.filter(p => !known.has(p.pn))
    if (added.length) mergedLists[name] = { ...have, parts: [...have.parts, ...added] }
  }
  s.priceLists = mergedLists
  // Version history was added after the original catalogue shape. Preserve
  // existing lists by turning their current contents into an initial snapshot.
  s.priceLists = Object.fromEntries(Object.entries(s.priceLists).map(([name, list]) => {
    const versions = Array.isArray(list.versions) && list.versions.length
      ? list.versions
      : [{
          id: `${name}-${list.version || 'initial'}`,
          version: list.version || 'Initial',
          currency: list.currency || 'INR',
          uploaded: list.uploaded || '',
          filename: '',
          parts: list.parts || [],
        }]
    const activeVersionId = list.activeVersionId || versions[versions.length - 1].id
    return [name, { ...list, versions, activeVersionId }]
  }))
  if (demo && Array.isArray(s.rateSheet)) {
    const roles = new Set(s.rateSheet.map(r => r.role))
    s.rateSheet = [...s.rateSheet, ...seedRateSheet.filter(r => !roles.has(r.role))]
  }
  if (demo && Array.isArray(s.adhocParts)) {
    const akey = a => `${a.pn}|${a.date}`
    const known = new Set(s.adhocParts.map(akey))
    s.adhocParts = [...s.adhocParts, ...seedAdhocParts.filter(a => !known.has(akey(a)))]
  }
  s.catalogRev = seedCatalogRev
  // AI-shaped leads + the AP-1 joint gate land once, without disturbing
  // whatever the user already has in the inbox.
  if (demo) {
    s.leads = [...seedAiLeads.filter(l => !s.leads.some(x => x.id === l.id)), ...s.leads]
    for (const a of seedJointApprovals) {
      if (!s.approvals.some(x => x.id === a.id)) s.approvals = [...s.approvals, a]
    }
  }
  // A deleted inbox row must stay deleted when demo/server data is merged back
  // in on a later refresh.
  if (s.deletedLeadIds.length) {
    const deleted = new Set(s.deletedLeadIds)
    s.leads = s.leads.filter(lead => !deleted.has(lead.id))
    s.leadArchive = (s.leadArchive || []).filter(lead => !deleted.has(lead.id))
  }
  // Per-row backfills.
  s.opportunities = s.opportunities.map(o => {
    // AMC and Training left OPP_TYPES when the client's Field List became the
    // source of truth. Both were always Service work, so saved rows are
    // retyped rather than dropped off the dropdown.
    const oppType = o.oppType === 'AMC' || o.oppType === 'Training' ? 'Service' : o.oppType
    return {
      milestone: milestoneForStage(o.stage, o.status),
      revisions: [], validityDays: 30, followUps: [],
      ...o,
      oppType,
      // `route` and `context` are both derived from the type and are never
      // stored by hand, so they are recomputed on every load rather than
      // trusted. That is what moves a saved Retrofit onto the Brownfield
      // workbench, and a saved Service into its own lane.
      route: routeForType(oppType),
      context: contextForType(oppType),
      nextActionOwner: o.nextActionOwner || '',
    }
  })
  for (const opp of s.opportunities) {
    if (opp.context !== 'Brownfield') continue
    const defaults = defaultBStepOwners(opp)
    const existing = s.bStepOwners[opp.id] || {}
    s.bStepOwners[opp.id] = Object.fromEntries(B_STEPS.map(step => [
      step.id, existing[step.id] || defaults[step.id],
    ]))
  }
  s.approvals = s.approvals.map(a => {
    // Type-aware, deliberately. These gates are joint even when an older
    // persisted row was created with only `approver` or `anyOf`.
    const joint = a.type === 'Red customer clearance' || a.type === 'Final quote release'
    const needed = joint
      ? ['LJS', 'AH']
      : a.needed || [a.approver].filter(Boolean)
    const decisions = a.decisions
      || (a.status && a.status !== 'Pending' && a.approver
        ? { [a.approver]: { d: a.status, c: a.decisionNote || '', when: a.decisionTs || '' } }
        : {})
    const decided = (a.anyOf && !joint)
      ? needed.some(r => decisions[r])
      : needed.every(r => decisions[r])
    const rejected = Object.values(decisions).some(d => d.d === 'Rejected')
    const returned = Object.values(decisions).some(d => d.d === 'Returned')
    const status = rejected ? 'Rejected'
      : !decided ? 'Pending'
      : returned ? 'Returned'
      : (a.conditions || []).length ? 'Approved with conditions' : 'Approved'
    return {
      ...a,
      needed,
      ...(joint ? { anyOf: false } : {}),
      decisions,
      status,
    }
  })
  return s
}

// Sales keeps its FY frame and owner targets when the demo data goes: targets
// are configuration the business sets, only the booked orders are demo records.
const emptySales = (prev = seedSales) => ({ ...prev, orders: [] })

// The seeded dataset removed — every business record gone, everything needed to
// keep using the app (logins, admin config, price lists, rate sheets, the parts
// catalogue) carried over from `prev`. Written by clearDemo(); `demoData: false`
// is what stops migrate() backfilling the seeds again on the next boot.
export function emptyState(prev) {
  const uploads = prev.config?.uploads
  return migrate({
    ...prev,
    demoData: false,
    opportunities: [], leads: [], leadArchive: [], leadDeadlines: [],
    // Keep reference catalogues after a business-data wipe. They are Admin
    // configuration, not demo transactions, and are required to price the
    // first real opportunity entered after the wipe.
    priceLists: prev.priceLists || {}, adhocParts: prev.adhocParts || [],
    approvals: [], customers: [],
    sparesLines: [], sparesAlternatives: [], svcEstimates: [], clarifications: [], vendorQuotes: [],
    surveys: [], competitors: [],
    files: {}, proposals: {}, communications: {}, kyc: {},
    poCompare: {}, handover: {}, bSteps: {}, bStepOwners: {},
    sales: emptySales(prev.sales), rateSheet: prev.rateSheet || [],
    // The one piece of demo data hiding inside config — the placeholder price
    // list Admin renders with a "DUMMY — replace with actual" chip.
    config: uploads
      ? { ...prev.config, uploads: { ...uploads, priceLists: (uploads.priceLists || []).filter(p => !p.dummy) } }
      : prev.config,
  })
}

export function seedState() {
  return migrate({
    demoData: true,
    opportunities: seedOpportunities,
    files: seedFiles,
    priceLists: seedPriceLists,
    adhocParts: seedAdhocParts,
    rateSheet: seedRateSheet,
    customers: seedCustomers,
    proposals: {},
    communications: {},
    leads: seedLeads,
    approvals: seedApprovals,
    audit: [],
    leadArchive: [],
    leadDeadlines: [],
    deletedLeadIds: [],
    users: seedUsers,
    role: 'SUPER',
  })
}

// What the app boots from, given the raw localStorage snapshot (or null). Takes
// the string rather than reading storage itself so the tests can drive the real
// boot path — which is where "did my new enquiry survive the reload?" and "did
// the demo data stay gone?" are actually decided.
export function stateFromSaved(saved) {
  try {
    if (saved) {
      const s = JSON.parse(saved)
      // An empty opportunities array is a legitimate state (everything deleted,
      // or the demo data removed), not a corrupt one — don't silently reseed
      // over the user's data.
      if (s && Array.isArray(s.opportunities) && (s.opportunities.length === 0 || s.opportunities[0].sellTo !== undefined)) {
        return migrate(s)
      }
    }
  } catch { /* fall through to seed */ }
  return seedState()
}

// The synced subset of a state object — everything except per-device slices.
export function syncedOf(s) {
  const out = {}
  for (const k of Object.keys(s)) {
    if (!datastore.LOCAL_ONLY.includes(k)) out[k] = s[k]
  }
  return out
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Preserve local lead creates/edits/deletes while accepting server-only rows and
// remote edits. The baseline is the last server snapshot known to this device.
export function mergeLeadSlice(local = [], server = [], baseline = [], deletedIds = []) {
  const localRows = Array.isArray(local) ? local : []
  const serverRows = Array.isArray(server) ? server : []
  const baseRows = Array.isArray(baseline) ? baseline : []
  const byId = rows => new Map(rows.filter(row => row?.id).map(row => [row.id, row]))
  const localById = byId(localRows)
  const serverById = byId(serverRows)
  const baseById = byId(baseRows)
  const deleted = new Set(deletedIds || [])
  const ids = [...new Set([...localRows, ...serverRows].map(row => row?.id).filter(Boolean))]

  const nextBaseline = []
  const rows = ids.flatMap(id => {
    if (deleted.has(id)) return []
    const localRow = localById.get(id)
    const serverRow = serverById.get(id)
    const baseRow = baseById.get(id)
    if (baseRow) {
      if (!localRow) {
        nextBaseline.push(baseRow)
        return [] // local delete since the baseline
      }
      if (!sameValue(localRow, baseRow)) {
        nextBaseline.push(baseRow)
        return [localRow]
      }
      if (serverRow) {
        nextBaseline.push(serverRow)
        return [serverRow]
      }
      nextBaseline.push(baseRow)
      return []
    }
    // No baseline means the local row may have been created before the first
    // successful sync. Keep it instead of allowing stale hydration to erase it.
    if (localRow) return [localRow]
    if (serverRow) {
      nextBaseline.push(serverRow)
      return [serverRow]
    }
    return []
  })

  return { rows, baseline: nextBaseline }
}
