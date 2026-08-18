import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as filestore from './filestore.js'
import * as datastore from './datastore.js'
import * as leadBlobs from './leadBlobs.js'
import { mintId, nextSeq, seqOf } from './ids.js'
import { statusFolderFor } from './sharepoint.js'
import {
  seedOpportunities, seedFiles, seedPriceLists, seedAdhocParts,
  seedRateSheet, seedCustomers, seedUsers, seedLeads, seedApprovals,
  seedConfig, seedKyc, seedSales, seedSparesLines, seedSparesAlternatives,
  seedRateSheets, seedSvcEstimates, seedClarifications, seedHandover,
  seedAiLeads, seedJointApprovals, seedCatalogRev,
  seedPoCompare, buildPoCompare, buildHandover, milestoneForStage, routeForType,
  contextForType, B_STEPS, REVISION_TYPES,
  ROLES, SUBFOLDERS, newProposal,
} from './seed.js'

// v3: schema updated after the Aug 10 meeting review (prob column, Partner Docs
// key, corrected products, costing.usdBase/financeCostK) — bump forces a reseed.
// Bumped to v4 with the expanded FY26 history + FY27 pipeline seed — v3 caches
// hold the old 14-row dataset and would never show it.
const KEY = 'wintrack-modae-v4'
const StoreCtx = createContext(null)

const defaultViewMode = () => (typeof window !== 'undefined' && window.innerWidth <= 1024 ? 'tablet' : 'full')

// Additive backfill for state saved before the BT-prototype port (phase 2) —
// never reseeds over the user's data.
function migrate(s) {
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
  if (!Array.isArray(s.leads)) s.leads = seedLeads
  if (!Array.isArray(s.approvals)) s.approvals = seedApprovals
  if (!Array.isArray(s.audit)) s.audit = []
  // ---- phase 2 slices ----
  if (!s.config) s.config = seedConfig
  if (!s.config.uploads) s.config.uploads = seedConfig.uploads
  if (!s.config.aiModel) s.config.aiModel = seedConfig.aiModel
  // Gemini is wired for real now: drop the key fields saved state used to carry
  // (a key must never live in client state), and retire the placeholder model
  // IDs the picker offered before the real ones were known.
  if ('keySet' in s.config.aiModel || 'keyMasked' in s.config.aiModel) {
    const { keySet, keyMasked, ...rest } = s.config.aiModel
    s.config.aiModel = rest
  }
  if (!s.config.aiModel.model || /^gemini-(pro|flash)$/.test(s.config.aiModel.model)) {
    s.config.aiModel = { ...seedConfig.aiModel, ...s.config.aiModel, ...{ provider: 'Google', model: seedConfig.aiModel.model } }
  }
  if (!s.kyc) s.kyc = seedKyc
  if (!s.sales) s.sales = seedSales
  if (!Array.isArray(s.sparesLines)) s.sparesLines = seedSparesLines
  if (!Array.isArray(s.sparesAlternatives)) s.sparesAlternatives = seedSparesAlternatives
  if (!s.rateSheets) s.rateSheets = seedRateSheets
  if (!Array.isArray(s.svcEstimates)) s.svcEstimates = seedSvcEstimates
  if (!Array.isArray(s.clarifications)) s.clarifications = seedClarifications
  // Demo Launcher scenario 6 needs a PO already in review to open onto. Backfill
  // by key so a saved state that predates the seed picks it up, without ever
  // overwriting a PO the user has been working on.
  if (!s.poCompare) s.poCompare = {}
  for (const [oppId, po] of Object.entries(seedPoCompare)) {
    if (!s.poCompare[oppId]) s.poCompare = { ...s.poCompare, [oppId]: po }
  }
  if (!s.handover) s.handover = seedHandover && Object.keys(seedHandover).length ? seedHandover : {}
  if (s.viewMode !== 'tablet' && s.viewMode !== 'full') s.viewMode = defaultViewMode()
  if (s.viewModeRestoreRev === 1) {
    s.viewMode = defaultViewMode()
    s.viewModePinned = false
    delete s.viewModeRestoreRev
  }
  if (s.tabletTheme !== 'dark' && s.tabletTheme !== 'light') s.tabletTheme = 'dark'
  // Diagram 02 workflow objects: the Brownfield B-01..B-05 sign-off ledger,
  // the §4 service site surveys, and §8 competitor tracking.
  if (!s.bSteps) s.bSteps = {}
  if (!Array.isArray(s.surveys)) s.surveys = []
  if (!Array.isArray(s.competitors)) s.competitors = []
  if (!s.spSync) s.spSync = {}
  if (!s.auth) s.auth = { user: null }
  // Price lists added to the seed after a state was saved (e.g. Meggitt) land
  // by name — existing lists are the user's data and are never overwritten.
  if (!s.priceLists) s.priceLists = seedPriceLists
  for (const [name, pl] of Object.entries(seedPriceLists)) {
    if (!s.priceLists[name]) s.priceLists = { ...s.priceLists, [name]: pl }
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
  for (const [name, pl] of Object.entries(seedPriceLists)) {
    const have = mergedLists[name]
    if (!have || !Array.isArray(have.parts)) continue
    const known = new Set(have.parts.map(p => p.pn))
    const added = pl.parts.filter(p => !known.has(p.pn))
    if (added.length) mergedLists[name] = { ...have, parts: [...have.parts, ...added] }
  }
  s.priceLists = mergedLists
  if (Array.isArray(s.rateSheet)) {
    const roles = new Set(s.rateSheet.map(r => r.role))
    s.rateSheet = [...s.rateSheet, ...seedRateSheet.filter(r => !roles.has(r.role))]
  }
  if (Array.isArray(s.adhocParts)) {
    const akey = a => `${a.pn}|${a.date}`
    const known = new Set(s.adhocParts.map(akey))
    s.adhocParts = [...s.adhocParts, ...seedAdhocParts.filter(a => !known.has(akey(a)))]
  }
  s.catalogRev = seedCatalogRev
  // AI-shaped leads + the AP-1 joint gate land once, without disturbing
  // whatever the user already has in the inbox.
  s.leads = [...seedAiLeads.filter(l => !s.leads.some(x => x.id === l.id)), ...s.leads]
  for (const a of seedJointApprovals) {
    if (!s.approvals.some(x => x.id === a.id)) s.approvals = [...s.approvals, a]
  }
  // Per-row backfills.
  s.opportunities = s.opportunities.map(o => ({
    milestone: milestoneForStage(o.stage, o.status),
    route: routeForType(o.oppType),
    revisions: [], validityDays: 30, followUps: [],
    ...o,
    // Greenfield/Brownfield is derived, never stored by hand — a saved row from
    // before the split gets it here, and a type change re-derives it.
    context: o.context || contextForType(o.oppType),
    nextActionOwner: o.nextActionOwner || '',
  }))
  s.approvals = s.approvals.map(a => ({
    needed: a.needed || [a.approver].filter(Boolean),
    decisions: a.decisions
      || (a.status && a.status !== 'Pending' && a.approver
        ? { [a.approver]: { d: a.status, c: a.decisionNote || '', when: a.decisionTs || '' } }
        : {}),
    ...a,
  }))
  return s
}

function seedState() {
  return migrate({
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
    users: seedUsers,
    role: 'SUPER',
  })
}

function initialState() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      const s = JSON.parse(saved)
      // An empty opportunities array is a legitimate state (everything deleted),
      // not a corrupt one — don't silently reseed over the user's data.
      if (s && Array.isArray(s.opportunities) && (s.opportunities.length === 0 || s.opportunities[0].sellTo !== undefined)) {
        return migrate(s)
      }
    }
  } catch { /* fall through to seed */ }
  return seedState()
}

// The synced subset of a state object — everything except per-device slices.
function syncedOf(s) {
  const out = {}
  for (const k of Object.keys(s)) {
    if (!datastore.LOCAL_ONLY.includes(k)) out[k] = s[k]
  }
  return out
}

// Read-only event log, newest first. Successive identical action+object+detail
// entries within a minute merge (inline cell edits fire per keystroke) — the
// detail must match too, or editing a second field would silently erase the
// record that the first one changed.
const AUDIT_CAP = 500
function withAudit(s, action, objectId, detail = '') {
  const entry = { ts: new Date().toISOString(), role: s.role, action, objectId: String(objectId ?? ''), detail: String(detail ?? '') }
  const prev = s.audit || []
  const head = prev[0]
  const merge = head && head.action === action && head.objectId === entry.objectId
    && head.detail === entry.detail
    && Date.parse(entry.ts) - Date.parse(head.ts) < 60000
  return { ...s, audit: [entry, ...(merge ? prev.slice(1) : prev)].slice(0, AUDIT_CAP) }
}

// Side effects of a resolved approval (BT prototype's applyApprovalEffects):
// Red-continuation gates qualify or archive the lead; final quote release
// flips the proposal release state and the milestone.
function applyApprovalEffects(s, appr) {
  let next = s
  if (appr.type === 'Red customer clearance' && appr.leadId) {
    // 'Returned' does NOT clear the gate — leave the lead untouched so the
    // salesperson can address the comments and re-request.
    const leadPatch = appr.status === 'Rejected'
      ? { status: 'Dropped', droppedReason: 'Red-class continuation rejected' }
      : appr.status === 'Approved' || appr.status === 'Approved with conditions'
        ? { status: 'Qualified' }
        : null
    if (leadPatch) next = { ...next, leads: next.leads.map(l => (l.id === appr.leadId ? { ...l, ...leadPatch } : l)) }
  }
  // A sales-raised customer-master change only lands once the gate clears.
  if (appr.type === 'Customer master change' && appr.customerName && appr.patch) {
    if (appr.status === 'Approved' || appr.status === 'Approved with conditions') {
      next = {
        ...next,
        customers: next.customers.map(c => (c.name === appr.customerName ? { ...c, ...appr.patch } : c)),
      }
    }
  }
  if (appr.type === 'Final quote release' && appr.oppId) {
    if (appr.status === 'Approved' || appr.status === 'Approved with conditions') {
      const p = next.proposals[appr.oppId]
      if (p) next = { ...next, proposals: { ...next.proposals, [appr.oppId]: { ...p, releaseStatus: 'Released' } } }
    } else if (appr.status === 'Returned') {
      next = { ...next, opportunities: next.opportunities.map(o => (o.id === appr.oppId ? { ...o, milestone: 'Proposal' } : o)) }
    } else if (appr.status === 'Rejected') {
      next = { ...next, opportunities: next.opportunities.map(o => (o.id === appr.oppId ? { ...o, health: 'Blocked' } : o)) }
    }
  }
  return next
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(initialState)
  // Ref mirror so read APIs (getProposal) see same-tick mutations, not the render closure.
  const stateRef = useRef(state)
  stateRef.current = state

  // ---- Supabase app_state sync (see datastore.js). localStorage stays the
  // instant source of truth; the server holds one JSONB row per synced slice.
  // hydratedRef gates server saves until the boot fetch resolves, so a fresh
  // device can't clobber good server data with its local seeds.
  const hydratedRef = useRef(!datastore.dbEnabled())
  const lastSavedRef = useRef({}) // per-slice snapshot of what the server has
  const saveTimerRef = useRef(null)

  const dirtySlices = () => {
    const s = stateRef.current
    const dirty = {}
    for (const [k, v] of Object.entries(syncedOf(s))) {
      if (v !== lastSavedRef.current[k]) dirty[k] = v
    }
    return dirty
  }

  const flushSaves = () => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    if (!hydratedRef.current) return
    const dirty = dirtySlices()
    if (!Object.keys(dirty).length) return
    datastore.saveSlices(dirty)
      .then(() => { lastSavedRef.current = { ...lastSavedRef.current, ...dirty } })
      .catch(e => console.warn('Supabase save failed — will retry on next change/focus:', e?.message))
  }

  // Boot fetch: server slices replace local synced ones (through migrate, so
  // schema backfills apply); an empty table is first-run — seed it from local.
  const hydrate = async () => {
    const res = await datastore.loadAll()
    if (!res || hydratedRef.current) return
    if (res.empty) {
      const snap = syncedOf(stateRef.current)
      try {
        await datastore.saveSlices(snap)
        lastSavedRef.current = snap
        hydratedRef.current = true
      } catch (e) {
        console.warn('Supabase seed failed — retrying on next focus:', e?.message)
      }
    } else {
      const merged = migrate({ ...stateRef.current, ...syncedOf(res.slices) })
      lastSavedRef.current = syncedOf(merged)
      hydratedRef.current = true
      setState(merged)
    }
  }

  // Focus refetch: pull server slices where this device has no unsaved edits.
  // Dirty local slices win until their debounced save lands.
  const applyServer = slices => {
    const s = stateRef.current
    const updates = {}
    for (const [k, v] of Object.entries(syncedOf(slices))) {
      const dirty = k in s && s[k] !== lastSavedRef.current[k]
      if (dirty) continue
      if (JSON.stringify(s[k]) === JSON.stringify(v)) continue
      updates[k] = v
    }
    if (!Object.keys(updates).length) return
    const merged = migrate({ ...s, ...updates })
    lastSavedRef.current = syncedOf(merged)
    setState(merged)
  }

  useEffect(() => {
    if (!datastore.dbEnabled()) return
    hydrate()
    let lastFetch = Date.now()
    const onFocus = () => {
      if (Date.now() - lastFetch < 10000) return
      lastFetch = Date.now()
      if (!hydratedRef.current) { hydrate(); return }
      datastore.loadAll().then(res => { if (res && !res.empty) applyServer(res.slices) })
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushSaves() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state))
    if (!datastore.dbEnabled() || !hydratedRef.current) return
    if (!Object.keys(dirtySlices()).length) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushSaves, 1500)
  }, [state])

  // Fire-and-forget SharePoint folder side effects: localStorage stays the
  // instant source of truth; Graph results land in spSync for the pills.
  const spTrack = (oppId, folder, work) => {
    if (filestore.activeBackend() !== 'sharepoint') return
    api.setSpSync(oppId, { state: 'pending', folder })
    work()
      .then(() => api.setSpSync(oppId, { state: 'synced', folder, error: '' }))
      .catch(e => api.setSpSync(oppId, { state: 'error', folder, error: e?.message || String(e) }))
  }

  const api = {
    ...state,

    addOpportunity(opp) {
      // Normalize here so every creator (IntakeForm, TenderIntake, Register)
      // yields workbench-ready rows — migrate() only backfills on reload.
      opp = {
        milestone: milestoneForStage(opp.stage, opp.status),
        route: routeForType(opp.oppType),
        context: contextForType(opp.oppType),
        ...opp,
      }
      setState(s => withAudit({
        ...s,
        opportunities: [...s.opportunities, opp],
        files: { ...s.files, [opp.id]: Object.fromEntries(SUBFOLDERS.map(f => [f, []])) },
      }, 'Opportunity registered', opp.id, opp.oppName))
      spTrack(opp.id, 'Open', () => filestore.ensureOppFolder(opp))
    },

    updateOpportunity(id, patch) {
      const today = new Date().toISOString().slice(0, 10)
      // Status-folder diff BEFORE the patch lands — a stage change (Won/Lost/
      // reopen) moves the SharePoint folder between the four status folders.
      const before = stateRef.current.opportunities.find(o => o.id === id)
      // A type change re-derives both branching axes — leaving a Retrofit on
      // the Greenfield lane would silently skip the B-01..B-05 chain.
      if (patch.oppType) {
        patch = { route: routeForType(patch.oppType), context: contextForType(patch.oppType), ...patch }
      }
      setState(s => withAudit({
        ...s,
        opportunities: s.opportunities.map(o =>
          o.id === id ? { ...o, ...patch, lastUpdated: today } : o),
      }, 'Opportunity updated', id, Object.keys(patch).join(', ')))
      if (before) {
        const after = { ...before, ...patch }
        const from = statusFolderFor(before)
        const to = statusFolderFor(after)
        if (from !== to) spTrack(id, to, () => filestore.moveOppFolder(after, from, to))
      }
    },

    // Folder-wall delete: removes the opportunity everywhere (tracker row,
    // folder tree, proposal). The real sheet never deletes rows — this exists
    // for cleaning up mistakes/demo data, so callers must confirm first.
    // With SharePoint connected the client's folder is MOVED to
    // "Not In Opp List", never deleted — their files stay put.
    deleteOpportunity(id) {
      const opp = stateRef.current.opportunities.find(o => o.id === id)
      if (opp) spTrack(id, 'Not In Opp List', () => filestore.removeOpp(opp))
      setState(s => {
        const { [id]: _f, ...files } = s.files
        const { [id]: _p, ...proposals } = s.proposals
        const { [id]: _c, ...communications } = s.communications || {}
        return withAudit(
          {
            ...s, opportunities: s.opportunities.filter(o => o.id !== id), files, proposals, communications,
            // Ghost approvals would inflate pending counts forever.
            approvals: (s.approvals || []).filter(a => a.oppId !== id),
          },
          'Opportunity deleted', id)
      })
    },

    addSubfolder(oppId, name) {
      setState(s => {
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        if (oppFiles[name]) return s
        return { ...s, files: { ...s.files, [oppId]: { ...oppFiles, [name]: [] } } }
      })
    },

    deleteSubfolder(oppId, name) {
      setState(s => {
        // Materialize the standard subfolders first — otherwise deleting one
        // folder on an opp with no files record wipes all three from view.
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        const { [name]: _, ...rest } = oppFiles
        return { ...s, files: { ...s.files, [oppId]: rest } }
      })
    },

    deleteFile(oppId, folder, fileName) {
      setState(s => {
        const oppFiles = s.files[oppId] || {}
        return {
          ...s,
          files: {
            ...s.files,
            [oppId]: { ...oppFiles, [folder]: (oppFiles[folder] || []).filter(f => f.name !== fileName) },
          },
        }
      })
    },

    addFile(oppId, folder, file) {
      setState(s => {
        const oppFiles = s.files[oppId] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
        // Re-uploading a name overwrites (matches the storage bucket's upsert).
        const rest = (oppFiles[folder] || []).filter(f => f.name !== file.name)
        return {
          ...s,
          files: {
            ...s.files,
            [oppId]: { ...oppFiles, [folder]: [...rest, file] },
          },
        }
      })
    },

    getProposal(oppId) {
      const s = stateRef.current
      if (s.proposals[oppId]) return s.proposals[oppId]
      const opp = s.opportunities.find(o => o.id === oppId)
      return newProposal(oppId, opp)
    },

    saveProposal(oppId, proposal) {
      setState(s => withAudit(
        { ...s, proposals: { ...s.proposals, [oppId]: proposal } },
        'Proposal saved', oppId, `Rev ${proposal.revision}`))
    },

    // Opening a revision on a released quote (diagram 02 §7). The bumped
    // revision no longer matches the approvals that released the previous one,
    // so §5 and the submission panel both re-lock — re-approval is mandatory.
    // The revision type routes the rework back to the B-step that owns it,
    // which is un-signed here so the salesperson has to walk it again.
    reviseProposal(oppId, note, type = 'Other') {
      setState(s => {
        const p = s.proposals[oppId]
        if (!p) return s
        const revisions = p.revisions || []
        const spec = REVISION_TYPES.find(r => r.id === type) || REVISION_TYPES[REVISION_TYPES.length - 1]
        const next = {
          ...p,
          revision: String((+p.revision || 0) + 1).padStart(2, '0'),
          releaseStatus: 'Superseded',
          revisions: [...revisions, {
            // The original dispatch is V1, so the first revision is V2.
            rev: `V${revisions.length + 2}`, when: new Date().toISOString().slice(0, 10),
            by: s.role, note: note || 'Revision opened', status: 'Revised', type: spec.id, step: spec.step,
          }],
        }
        const steps = { ...(s.bSteps[oppId] || {}) }
        delete steps[spec.step]
        return withAudit({
          ...s,
          proposals: { ...s.proposals, [oppId]: next },
          bSteps: { ...s.bSteps, [oppId]: steps },
          opportunities: s.opportunities.map(o => (o.id === oppId ? { ...o, milestone: 'Proposal' } : o)),
        }, 'Quote revision opened', oppId,
        `Rev ${next.revision} — ${spec.id} change, back to ${spec.step}, re-approval required · ${note || 'no reason given'}`)
      })
    },

    // Diagram 02 §3: the assigned salesperson signs off each Brownfield step.
    signBStep(oppId, stepId, note = '') {
      const step = B_STEPS.find(b => b.id === stepId)
      if (!step) return
      setState(s => withAudit({
        ...s,
        bSteps: {
          ...s.bSteps,
          [oppId]: {
            ...(s.bSteps[oppId] || {}),
            [stepId]: { state: 'Signed', by: s.role, at: new Date().toISOString(), note },
          },
        },
      }, 'Workflow step signed off', oppId, `${stepId} ${step.label}${note ? ` — ${note}` : ''}`))
    },

    unsignBStep(oppId, stepId, reason = '') {
      setState(s => {
        const steps = { ...(s.bSteps[oppId] || {}) }
        delete steps[stepId]
        return withAudit({ ...s, bSteps: { ...s.bSteps, [oppId]: steps } },
          'Workflow step reopened', oppId, `${stepId}${reason ? ` — ${reason}` : ''}`)
      })
    },

    // Diagram 02 §4 — the site-survey branch of the service flow. One survey
    // record per opportunity, advanced through request → visit → report → SoW.
    requestSurvey(oppId, detail = '') {
      setState(s => {
        if (s.surveys.some(v => v.oppId === oppId)) return s
        const survey = {
          id: mintId('SV', s.surveys), oppId, state: 'Requested',
          requestedBy: s.role, requestedOn: new Date().toISOString().slice(0, 10),
          detail, visitOn: '', report: '', sow: '',
        }
        return withAudit({ ...s, surveys: [...s.surveys, survey] },
          'Site survey requested', oppId, detail || survey.id)
      })
    },

    updateSurvey(oppId, patch, action = 'Site survey updated') {
      setState(s => withAudit({
        ...s,
        surveys: s.surveys.map(v => (v.oppId === oppId ? { ...v, ...patch } : v)),
      }, action, oppId, Object.keys(patch).join(', ')))
    },

    // Diagram 02 §8 — competitor tracking, and the loss reason §7 demands.
    addCompetitor(oppId, entry) {
      setState(s => withAudit({
        ...s,
        competitors: [...s.competitors, { id: mintId('CP', s.competitors), oppId, ...entry }],
      }, 'Competitor recorded', oppId, `${entry.name || 'unnamed'}${entry.outcome ? ` — ${entry.outcome}` : ''}`))
    },

    removeCompetitor(id) {
      setState(s => ({ ...s, competitors: s.competitors.filter(c => c.id !== id) }))
    },

    // Closing a lost opportunity always carries a reason — the diagram's
    // "Capture Loss Reason & Close Opportunity" box. Callers must pass one.
    closeLost(oppId, reason, competitor = null) {
      if (!reason) return
      setState(s => {
        const next = withAudit({
          ...s,
          opportunities: s.opportunities.map(o => (o.id === oppId
            ? { ...o, stage: 'Lost', status: 'Closed', closedReason: reason, lastUpdated: new Date().toISOString().slice(0, 10) }
            : o)),
        }, 'Opportunity lost', oppId, reason)
        return competitor?.name
          ? { ...next, competitors: [...next.competitors, { id: `CP-${next.competitors.length + 1}`, oppId, outcome: 'Won against us', ...competitor }] }
          : next
      })
      const before = stateRef.current.opportunities.find(o => o.id === oppId)
      if (before) {
        const after = { ...before, stage: 'Lost', status: 'Closed' }
        const from = statusFolderFor(before)
        const to = statusFolderFor(after)
        if (from !== to) spTrack(oppId, to, () => filestore.moveOppFolder(after, from, to))
      }
    },

    addAdhocPart(part) {
      setState(s => ({ ...s, adhocParts: [part, ...s.adhocParts] }))
    },

    // communications[oppId] = [{ ts, to, subject, kind }], newest first.
    addCommunication(oppId, entry) {
      setState(s => withAudit({
        ...s,
        communications: {
          ...(s.communications || {}),
          [oppId]: [{ ts: new Date().toISOString(), ...entry }, ...((s.communications || {})[oppId] || [])],
        },
      }, entry.kind === 'submission'
        ? 'Proposal submitted'
        : entry.kind === 'proposal-email-compose' ? 'Proposal email compose opened' : 'Proposal emailed',
      oppId, entry.subject))
    },

    // ---- Lead inbox -------------------------------------------------------
    addLead(lead) {
      setState(s => withAudit(
        { ...s, leads: [{ ...lead }, ...s.leads] },
        'Lead received', lead.id, lead.subject))
    },

    updateLead(id, patch, detail = '') {
      setState(s => {
        const next = { ...s, leads: s.leads.map(l => (l.id === id ? { ...l, ...patch } : l)) }
        const auditKeys = Object.keys(patch).filter(k => !['readAt', 'starred'].includes(k))
        if (!auditKeys.length) return next
        return withAudit(next, patch.status ? `Lead ${patch.status.toLowerCase()}` : 'Lead updated', id,
          detail || patch.droppedReason || patch.oppId || auditKeys.join(', '))
      })
    },

    // Take a lead back to the inbox so it can be qualified, disqualified or
    // reassigned again. Biji, 13 Aug: "by mistake I qualify — I should take it
    // back to the lead list… then I can again qualify, disqualify or reassign."
    // The old Revert button was hidden the moment an opportunity existed, which
    // is exactly the case it was needed for, so this removes the opportunity it
    // created (and its folder, proposal and approvals) rather than orphaning it.
    revertLead(id, reason = '') {
      const lead = stateRef.current.leads.find(l => l.id === id)
      if (lead?.oppId) api.deleteOpportunity(lead.oppId)
      setState(s => withAudit(
        {
          ...s,
          leads: s.leads.map(l => (l.id === id
            ? { ...l, status: 'New', oppId: null, droppedReason: '', revertedAt: new Date().toISOString(), revertReason: reason }
            : l)),
        },
        'Lead reverted to inbox', id, [lead?.oppId && `removed ${lead.oppId}`, reason].filter(Boolean).join(' — ')))
    },

    // ---- Approvals --------------------------------------------------------
    requestApproval(req) {
      setState(s => {
        const id = mintId('AP', s.approvals, 100)
        const appr = {
          id, status: 'Pending', conditions: [], decisionTs: '', decisionNote: '',
          ts: new Date().toISOString(), requestedBy: s.role, ...req,
        }
        return withAudit(
          { ...s, approvals: [appr, ...s.approvals] },
          'Approval requested', appr.id, `${appr.type} — ${appr.oppId} → ${appr.approver}`)
      })
    },

    decideApproval(id, { status, conditions = [], decisionNote = '' }) {
      setState(s => withAudit({
        ...s,
        approvals: s.approvals.map(a => a.id === id
          ? { ...a, status, decisionNote, decisionTs: new Date().toISOString(),
              conditions: status === 'Approved with conditions'
                ? conditions.map(c => (typeof c === 'string' ? { text: c, incorporated: false, note: '' } : c))
                : a.conditions }
          : a),
      }, `Approval ${status.toLowerCase()}`, id, decisionNote))
    },

    // Salesperson confirms an approval condition is incorporated in the proposal.
    confirmCondition(approvalId, idx, note) {
      setState(s => withAudit({
        ...s,
        approvals: s.approvals.map(a => a.id === approvalId
          ? { ...a, conditions: a.conditions.map((c, i) => (i === idx ? { ...c, incorporated: true, note } : c)) }
          : a),
      }, 'Condition confirmed', approvalId, note))
    },

    // Registration stamps the new opp id onto lead-linked approvals (AP-1) so
    // gates/conditions follow the opportunity instead of dangling on the lead.
    linkLeadApprovals(leadId, oppId) {
      setState(s => ({
        ...s,
        approvals: s.approvals.map(a => (a.leadId === leadId && !a.oppId ? { ...a, oppId } : a)),
      }))
    },

    // Direct write to the customer master — admins only (the Customers page
    // routes every other role through a 'Customer master change' approval).
    updateCustomer(name, patch, reason = '') {
      setState(s => (ROLES[s.role]?.admin
        ? withAudit(
            { ...s, customers: s.customers.map(c => (c.name === name ? { ...c, ...patch } : c)) },
            'Customer updated', name,
            [Object.entries(patch).map(([k, v]) => `${k} → ${v}`).join(', '), reason].filter(Boolean).join(' · '))
        : s))
    },

    // New customers land in the master Blue (pending admin verification).
    addCustomer(cust) {
      setState(s => s.customers.some(c => c.name.toLowerCase() === cust.name.toLowerCase())
        ? s
        : { ...s, customers: [...s.customers, cust] })
    },

    setRole(role) {
      // Audit against the pre-switch state so the entry records who switched.
      // External (customer) accounts can never escalate to an internal persona.
      setState(s => (ROLES[role] && s.auth?.user?.role !== 'CUST'
        ? { ...withAudit(s, 'Persona switched', role, `from ${s.role}`), role }
        : s))
    },

    addUser(user) {
      setState(s => s.users.some(u => u.email.toLowerCase() === user.email.toLowerCase())
        ? s
        : { ...s, users: [...s.users, user] })
    },

    updateUser(id, patch) {
      setState(s => ({ ...s, users: s.users.map(u => (u.id === id ? { ...u, ...patch } : u)) }))
    },

    // Only used to reject a pending registration — active accounts are
    // suspended, never deleted.
    deleteUser(id) {
      setState(s => ({ ...s, users: s.users.filter(u => u.id !== id) }))
    },

    // Cosmetic only — deliberately not audited, toggling would flood the log.
    setTabletTheme(theme) {
      setState(s => ((theme === 'dark' || theme === 'light') ? { ...s, tabletTheme: theme } : s))
    },

    // ---- View mode (tablet / full site) -----------------------------------
    // An explicit switch is remembered (`viewModePinned`) and never overridden.
    setViewMode(mode) {
      setState(s => (mode === 'tablet' || mode === 'full'
        ? { ...withAudit(s, 'View switched', mode, `from ${s.viewMode}`), viewMode: mode, viewModePinned: true }
        : s))
    },

    // Rotating a tablet, or dragging a desktop window narrow, used to leave the
    // wrong shell in place: the mode was read from the viewport once on first
    // visit and never again. Only follows the viewport until someone chooses.
    syncViewMode() {
      setState(s => {
        if (s.viewModePinned) return s
        const next = defaultViewMode()
        return next === s.viewMode ? s : { ...s, viewMode: next }
      })
    },

    // ---- Joint approvals (BT flow: needed:[roles] × decisions) ------------
    // Records one approver's decision; overall status resolves when every
    // needed role has decided (any Reject → Rejected immediately).
    recordDecision(id, { d, comment = '', conditions = [] }) {
      setState(s => {
        const appr = s.approvals.find(a => a.id === id)
        if (!appr) return s
        const decisions = { ...(appr.decisions || {}), [s.role]: { d, c: comment, when: new Date().toISOString() } }
        const needed = appr.needed || [appr.approver].filter(Boolean)
        const allIn = needed.every(r => decisions[r])
        const anyRejected = Object.values(decisions).some(x => x.d === 'Rejected')
        const anyReturned = Object.values(decisions).some(x => x.d === 'Returned')
        const newConds = conditions.filter(Boolean).map(text => ({ text, incorporated: false, note: '' }))
        const allConds = [...(appr.conditions || []), ...newConds]
        const status = anyRejected ? 'Rejected'
          : !allIn ? 'Pending'
          : anyReturned ? 'Returned'
          : allConds.length ? 'Approved with conditions' : 'Approved'
        let next = {
          ...s,
          approvals: s.approvals.map(a => a.id === id
            ? { ...a, decisions, conditions: allConds, status,
                decisionTs: status === 'Pending' ? a.decisionTs : new Date().toISOString(),
                decisionNote: comment || a.decisionNote }
            : a),
        }
        if (status !== 'Pending') next = applyApprovalEffects(next, { ...appr, status, conditions: allConds })
        return withAudit(next, `Approval ${d.toLowerCase()}`, id, comment)
      })
    },

    // ---- Customer KYC ------------------------------------------------------
    // `file` is optional: undefined leaves any attached document alone (the
    // simulate path), an object attaches one, null drops it (Reject). The bytes
    // themselves live in IndexedDB — this record is metadata only.
    setKycState(customerName, itemName, state, file) {
      setState(s => withAudit({
        ...s,
        kyc: {
          ...s.kyc,
          [customerName]: (s.kyc[customerName] || (s.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' })))
            .map(k => (k.name === itemName
              ? { ...k, state, when: new Date().toISOString().slice(0, 10), ...(file === undefined ? {} : { file: file || undefined }) }
              : k)),
        },
      }, `KYC ${state.toLowerCase()}`, customerName, file ? `${itemName} — ${file.name}` : itemName))
    },
    kycOverride(oppId, reason) {
      setState(s => withAudit({
        ...s,
        opportunities: s.opportunities.map(o => (o.id === oppId ? { ...o, kycOverride: { by: s.role, reason, ts: new Date().toISOString() } } : o)),
      }, 'KYC overridden', oppId, reason))
    },

    // ---- Clarifications ----------------------------------------------------
    addClarification(row) {
      setState(s => {
        const id = mintId('CL', s.clarifications)
        return withAudit({
          ...s,
          clarifications: [...s.clarifications, { id, status: 'Draft', response: '', ...row }],
        }, 'Clarification drafted', id, row.q?.slice(0, 60))
      })
    },
    updateClarification(id, patch) {
      setState(s => withAudit({
        ...s,
        clarifications: s.clarifications.map(c => (c.id === id ? { ...c, ...patch } : c)),
      }, patch.status ? `Clarification ${patch.status.toLowerCase()}` : 'Clarification updated', id))
    },

    // ---- Spares workbench --------------------------------------------------
    updateSparesLine(id, patch) {
      setState(s => ({ ...s, sparesLines: s.sparesLines.map(l => (l.id === id ? { ...l, ...patch } : l)) }))
    },
    addSparesLine(oppId, line) {
      setState(s => {
        const id = mintId('SL', s.sparesLines)
        return withAudit({
          ...s,
          sparesLines: [...s.sparesLines, {
            id, oppId, match: 'Manual', conf: 100, confirmed: true,
            priceList: 'Ad-hoc', priceState: 'Current', currency: 'INR', qty: 1, ...line,
          }],
        }, 'Manual part added', oppId, line.pn || line.desc)
      })
    },
    removeSparesLine(id) {
      setState(s => ({ ...s, sparesLines: s.sparesLines.filter(l => l.id !== id) }))
    },
    // Simulated price-registry refresh: expired source bumps to current
    // (+4% sell impact is in the registry, cost +3%).
    refreshPrice(id) {
      setState(s => withAudit({
        ...s,
        sparesLines: s.sparesLines.map(l => (l.id === id
          ? { ...l, priceList: 'BNK 2026-Q2', priceState: 'Current', listPrice: Math.round(l.listPrice * 1.04) }
          : l)),
      }, 'Price source refreshed', id, 'BNK 2026-Q2 (+4% list)'))
    },
    // Merge confirmed spares lines into the proposal workbook BoM.
    sendLinesToProposal(oppId) {
      setState(s => {
        const lines = s.sparesLines.filter(l => l.oppId === oppId && l.confirmed)
        if (!lines.length) return s
        const opp = s.opportunities.find(o => o.id === oppId)
        const base = s.proposals[oppId] || newProposal(oppId, opp)
        const existing = new Set((base.bom || []).map(b => b.pn))
        const added = lines.filter(l => !existing.has(l.pn)).map(l => ({
          itemCategory: 'Hardware', pn: l.pn, desc: l.desc, listPrice: l.listPrice, adders: [],
          qtyPerUnit: 0, common: l.qty, spares: 0, quoted: '',
          list: l.priceList?.startsWith('BNK') ? 'BNK' : 'Ad-hoc', currency: l.currency,
        }))
        return withAudit({
          ...s,
          proposals: { ...s.proposals, [oppId]: { ...base, bom: [...(base.bom || []), ...added] } },
        }, 'Lines sent to proposal', oppId, `${added.length} line(s)`)
      })
    },

    // ---- Service workbench -------------------------------------------------
    updateSvcEstimate(oppId, patch) {
      setState(s => {
        const has = s.svcEstimates.some(e => e.oppId === oppId)
        return {
          ...s,
          svcEstimates: has
            ? s.svcEstimates.map(e => (e.oppId === oppId ? { ...e, ...patch } : e))
            : [...s.svcEstimates, { oppId, sheet: 'India', workDays: 1, travelDays: 1, dailyHours: 8, otHours: 0, weekendDays: 0, standbyDays: 0, engineer: '', mobilisation: '', toolsCerts: '', travelConfirmed: false, ...patch }],
        }
      })
    },

    // ---- PO validation & handover -----------------------------------------
    receivePO(oppId) {
      setState(s => withAudit({
        ...s,
        poCompare: { ...s.poCompare, [oppId]: { ...buildPoCompare(oppId), received: new Date().toISOString().slice(0, 10), status: 'In review' } },
        opportunities: s.opportunities.map(o => (o.id === oppId ? { ...o, milestone: 'PO Validation' } : o)),
      }, 'PO received (simulated)', oppId))
    },
    resolvePoLine(oppId, idx, resolution) {
      setState(s => {
        const po = s.poCompare[oppId]
        if (!po) return s
        return withAudit({
          ...s,
          poCompare: {
            ...s.poCompare,
            [oppId]: { ...po, lines: po.lines.map((l, i) => (i === idx ? { ...l, resolved: true, resolution, resolvedBy: s.role } : l)) },
          },
        }, 'PO line resolved', oppId, `${po.lines[idx].aspect} — ${resolution}`)
      })
    },
    acceptPO(oppId) {
      setState(s => {
        const po = s.poCompare[oppId]
        if (!po) return s
        const acceptance = { ...po.acceptance, [s.role]: new Date().toISOString() }
        const both = acceptance.LJS && acceptance.AH
        let next = {
          ...s,
          poCompare: { ...s.poCompare, [oppId]: { ...po, acceptance, status: both ? 'Accepted' : po.status } },
        }
        if (both) {
          next = {
            ...next,
            opportunities: next.opportunities.map(o => (o.id === oppId ? { ...o, milestone: 'Handover' } : o)),
            handover: { ...next.handover, [oppId]: next.handover[oppId] || buildHandover() },
          }
        }
        return withAudit(next, both ? 'PO jointly accepted' : 'PO accepted (one signature)', oppId, s.role)
      })
    },
    hoToggleItem(oppId, gi, ii, done) {
      setState(s => {
        const ho = s.handover[oppId]
        if (!ho) return s
        return {
          ...s,
          handover: {
            ...s.handover,
            [oppId]: {
              ...ho,
              groups: ho.groups.map((g, a) => (a === gi
                ? { ...g, items: g.items.map((it, b) => (b === ii ? { ...it, done } : it)) }
                : g)),
            },
          },
        }
      })
    },
    approveHandover(oppId) {
      setState(s => {
        const today = new Date().toISOString().slice(0, 10)
        return withAudit({
          ...s,
          handover: { ...s.handover, [oppId]: { ...s.handover[oppId], approved: true, approvedBy: s.role, approvedOn: today } },
          opportunities: s.opportunities.map(o => (o.id === oppId
            ? { ...o, stage: 'Won', status: 'Closed', milestone: 'Handover', orderDate: o.orderDate || today, lastUpdated: today }
            : o)),
        }, 'Handover approved', oppId, s.role)
      })
    },

    setMilestone(oppId, milestone, reason = '') {
      setState(s => withAudit({
        ...s,
        opportunities: s.opportunities.map(o => (o.id === oppId ? { ...o, milestone } : o)),
      }, 'Milestone moved', oppId, reason ? `${milestone} — ${reason}` : milestone))
    },

    // ---- Admin config ------------------------------------------------------
    updateConfig(patch) {
      setState(s => withAudit({ ...s, config: { ...s.config, ...patch } },
        'Config updated', 'admin', Object.keys(patch).join(', ')))
    },
    saveAiModel(aiModel) {
      setState(s => withAudit({
        ...s,
        config: { ...s.config, aiModel: { ...aiModel, updatedBy: s.role, updatedOn: new Date().toISOString().slice(0, 10) } },
      }, 'AI model configured', aiModel.provider, aiModel.model || aiModel.customModel))
    },
    addUpload(kind, meta) {
      setState(s => withAudit({
        ...s,
        config: {
          ...s.config,
          uploads: kind === 'priceLists'
            ? { ...s.config.uploads, priceLists: [{ ...meta, uploaded: new Date().toISOString().slice(0, 10) }, ...s.config.uploads.priceLists] }
            : { ...s.config.uploads, [kind]: { ...meta, uploaded: new Date().toISOString().slice(0, 10) } },
        },
      }, 'Admin document uploaded', kind, meta.name))
    },
    setConnectorState(id, stateVal) {
      setState(s => ({
        ...s,
        config: { ...s.config, connectors: s.config.connectors.map(c => (c.id === id ? { ...c, state: stateVal } : c)) },
      }))
    },

    // ---- SharePoint sync bookkeeping --------------------------------------
    setSpSync(oppId, patch) {
      setState(s => ({ ...s, spSync: { ...s.spSync, [oppId]: { ...(s.spSync[oppId] || {}), ...patch, ts: new Date().toISOString() } } }))
    },

    // ---- Auth (demo login — plaintext by design, disclaimed on screen) ----
    login(email, pw) {
      const s = stateRef.current
      const u = s.users.find(x => x.email.toLowerCase() === email.trim().toLowerCase())
      if (!u) return { ok: false, err: 'No account with that email.' }
      if (u.status === 'Pending') return { ok: false, err: 'Account awaiting super-admin approval.' }
      if (u.status === 'Suspended') return { ok: false, err: 'Account suspended — contact the administrator.' }
      if (u.pw !== pw) return { ok: false, err: 'Incorrect password.' }
      setState(st => ({
        ...withAudit(st, 'Signed in', u.email),
        auth: { user: { id: u.id, name: u.name, email: u.email, role: u.role } },
        role: ROLES[u.role] ? u.role : st.role,
      }))
      return { ok: true }
    },
    logout() {
      setState(st => ({ ...withAudit(st, 'Signed out', st.auth?.user?.email || ''), auth: { user: null } }))
    },
    registerUser({ name, email, pw, role }) {
      const s = stateRef.current
      if (s.users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
        return { ok: false, err: 'An account with that email already exists.' }
      }
      // max+1, not length+1 — deletions would otherwise recycle a live id.
      const seq = Math.max(0, ...s.users.map(u => parseInt(String(u.id).replace(/\D/g, ''), 10) || 0)) + 1
      setState(st => withAudit({
        ...st,
        users: [...st.users, {
          id: `U-${String(seq).padStart(3, '0')}`, name, email: email.trim(), pw,
          role: role || 'RS', status: 'Pending', created: new Date().toISOString().slice(0, 10),
        }],
      }, 'Registration submitted', email))
      return { ok: true }
    },
    signInAs(userId) {
      setState(st => {
        const u = st.users.find(x => x.id === userId)
        if (!u || u.status !== 'Active') return st
        return {
          ...withAudit(st, 'Signed in as', u.email, `by ${st.role}`),
          auth: { user: { id: u.id, name: u.name, email: u.email, role: u.role } },
          role: ROLES[u.role] ? u.role : st.role,
        }
      })
    },

    async resetDemo() {
      if (datastore.dbEnabled()) {
        try { await datastore.resetAll(syncedOf(seedState())) }
        catch (e) { console.warn('Supabase reset failed — server data left as-is:', e?.message) }
      }
      // Lead file blobs live in IndexedDB, outside the localStorage snapshot.
      try { await leadBlobs.clearAll() }
      catch (e) { console.warn('Lead file store reset failed:', e?.message) }
      localStorage.removeItem(KEY)
      window.location.reload()
    },
  }

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)

// Opp ID = YYMM + 3-digit running sequence + owner initials (e.g. 2608222RS),
// per the Sales Pipeline Report sheet.
export function nextOppId(opportunities, owner) {
  const now = new Date()
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0')
  const seqs = opportunities
    .map(o => parseInt(String(o.id).slice(4, 7), 10))
    .filter(n => !isNaN(n))
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1
  return `${yymm}${String(next).padStart(3, '0')}${owner}`
}
