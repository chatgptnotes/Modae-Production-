import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as filestore from './filestore.js'
import * as datastore from './datastore.js'
import * as leadBlobs from './leadBlobs.js'
import { deleteDemoUserFiles } from './userFiles.js'
import { mintId, nextSeq, seqOf } from './ids.js'
import { statusFolderFor } from './sharepoint.js'
import {
  buildPoCompare, buildHandover, milestoneForStage, routeForType,
  contextForType, B_STEPS, REVISION_TYPES,
  ROLES, SUBFOLDERS, MILESTONES, newProposal, PORTAL_ENABLED, defaultBStepOwners,
  canSignBStep,
} from './seed.js'
import { leadConfig, routeOwner, expiredLeadDeadline, aiAuditDetail } from './leadRules.js'
import { withoutSimulated, simulatedCount } from './simulatedLeads.js'
import { KEY, migrate, seedState, emptyState, stateFromSaved, syncedOf, mergeLeadSlice, mergeOpportunitySlice, mergeSparesLineSlice, mergeClarificationSlice, mergeApprovalRows, defaultViewMode } from './appState.js'
import { unitCostINR, unitSellINR, setRoleNameConfig, nowIST, toISTISOString, canManagePriceLists } from './utils.js'
import { PRICE_SOURCES, isConfirmableSparesLine, normalizePriceFields, sparesLineFinancials } from './pricing.js'
import { clarificationTopic } from './leadClarification.js'
import { reconcileSparesLines } from './clarificationSparesSync.js'
import { normalizedCurrencyRates } from './currency.js'
import { approvalMemoryKey, pricingExceptionSignature, proposalApprovalSnapshot } from './approvalMemory.js'
import { shouldSyncProposalFromOpportunity, syncProposalFromOpportunity } from './proposal/opportunitySync.js'
import {
  isPlaceholderSparesLine,
  isLegacyAutoSparesSupportRow,
  isSparesSupportRow,
  sparesProposalBom,
  orderedSparesProposalBom,
} from './proposal/sparesBoq.js'
import { releaseState, transitionBlockers } from './gates.js'
import { supabase, supabaseConfigError } from './supabase.js'

const StoreCtx = createContext(null)
const CLARIFICATION_FIELD_KEYS = new Set([
  'oppName', 'rfqNumber', 'sellTo', 'category', 'location', 'customerStatus',
  'eucName', 'eucLocation', 'oppType', 'bu', 'segment', 'solution',
  'contactPerson', 'contactPhone', 'additionalCustomerInformation',
])

export { isPlaceholderSparesLine, sparesProposalBom }

// Captures what a proposal actually looked like at the moment a revision
// entry is logged, so "Revisions" has real content to show instead of just
// who/when/why metadata. Deep-cloned so later edits to the live proposal
// can't mutate an already-logged revision's snapshot.
export function snapshotProposal(p) {
  const reviewedUpload = p.reviewedUpload
    ? {
      filename: p.reviewedUpload.filename,
      type: p.reviewedUpload.type,
      size: p.reviewedUpload.size,
      uploadedAt: p.reviewedUpload.uploadedAt,
      blobKey: p.reviewedUpload.blobKey,
      webUrl: p.reviewedUpload.webUrl,
      url: p.reviewedUpload.url,
      path: p.reviewedUpload.path,
      itemId: p.reviewedUpload.itemId,
      sheets: p.reviewedUpload.sheets,
      importedChanges: p.reviewedUpload.importedChanges,
      validationIssues: p.reviewedUpload.validationIssues,
      comparisonAvailable: p.reviewedUpload.comparisonAvailable,
      table: p.reviewedUpload.table,
    }
    : null
  return JSON.parse(JSON.stringify({
    revision: p.revision, bom: p.bom, terms: p.terms, signals: p.signals, costing: p.costing,
    pricingMode: p.pricingMode, discountPct: p.discountPct, markupPct: p.markupPct,
    approvedPricing: p.approvedPricing,
    revisionDate: p.revisionDate, validityDays: p.validityDays,
    addressee: p.addressee, kindAttn: p.kindAttn, subject: p.subject,
    bidStage: p.bidStage, bidType: p.bidType, sourceCurrency: p.sourceCurrency,
    sourceRate: p.sourceRate, sourceRateDate: p.sourceRateDate, clauseIds: p.clauseIds,
    clauses: p.clauses, docTerms: p.docTerms, docTermsHeading: p.docTermsHeading,
    letterSalutation: p.letterSalutation, letterBody: p.letterBody, letterClose: p.letterClose,
    ourRef: p.ourRef,
    reviewedUpload,
    reviewStatus: p.reviewStatus,
    reviewIssues: p.reviewIssues,
    reviewCompletedAt: p.reviewCompletedAt,
    reviewOverride: p.reviewOverride,
  }))
}

// The localStorage read is all that is left here; the decision itself lives in
// appState.js so the tests can drive the boot path directly.
const initialState = () => {
  // Keep the active snapshot intact. Removing the v4 key here also removes
  // the key currently used by appState.js, which made every offline reload
  // reseed an empty workspace when Supabase was unavailable.
  const saved = localStorage.getItem(KEY)
  const state = stateFromSaved(saved)
  // Production starts clean. Existing demo-mode snapshots are migrated once
  // into an empty workspace; real records entered after that remain intact.
  const next = reconcileApprovedSubmissions(state.demoData === true ? emptyState(state) : state)
  if (next.demoData !== true && !Object.keys(next.priceLists || {}).length) {
    const cachedPriceLists = datastore.readPriceListsCache()
    if (cachedPriceLists && Object.keys(cachedPriceLists).length) next.priceLists = cachedPriceLists
  }
  return next
}

// Supabase is the authoritative store for catalogues, files, and the full
// audit trail. Cache only the compact slices needed to paint the workspace;
// spreading the whole state here eventually exceeds localStorage quota after
// proposals, communications, or sourcing payloads accumulate.
const CACHE_VERSION = 2
const localSnapshot = state => ({
  cacheVersion: CACHE_VERSION,
  demoData: state.demoData,
  opportunities: state.opportunities,
  opportunitySyncBaseline: state.opportunitySyncBaseline,
  deletedOpportunityIds: state.deletedOpportunityIds,
  pendingOpportunitySyncIds: state.pendingOpportunitySyncIds,
  leads: state.leads,
  leadArchive: state.leadArchive,
  leadDeadlines: state.leadDeadlines,
  leadSyncBaseline: state.leadSyncBaseline,
  deletedLeadIds: state.deletedLeadIds,
  // Keep sourcing rows in the compact browser cache so a stale/empty server
  // response cannot blank an otherwise populated BOQ during hydration.
  sparesLines: state.sparesLines,
  sparesLinesSyncBaseline: state.sparesLinesSyncBaseline,
  // Keep proposals in the browser fallback too. Supabase remains authoritative
  // when available, but a local/offline refresh must not reset saved terms.
  proposals: state.proposals,
  approvals: state.approvals,
  customers: state.customers,
  users: state.users,
  config: state.config,
  auth: state.auth,
  role: state.role,
  viewMode: state.viewMode,
  viewModePinned: state.viewModePinned,
  tabletTheme: state.tabletTheme,
  inboxShowAll: state.inboxShowAll,
})

let localCacheWarningShown = false

const persistLocalSnapshot = state => {
  try {
    localStorage.setItem(KEY, JSON.stringify(localSnapshot(state)))
  } catch (e) {
    // localStorage.setItem is atomic: if it throws (usually quota exceeded),
    // the previously valid snapshot remains. Never remove it before trying a
    // smaller replacement — that old recovery path could turn a full browser
    // cache into an incomplete one and make records appear to vanish on reload.
    if (!localCacheWarningShown) {
      localCacheWarningShown = true
      console.warn('Local cache was not updated; keeping the last known-good browser snapshot:', e?.message || e)
    }
  }
}

const BUSINESS_SLICE_KEYS = new Set(['leads', 'leadArchive', 'approvals', 'opportunities', 'proposals', 'sparesLines', 'clarifications', 'audit'])
const populated = value => Array.isArray(value) ? value.length > 0 : !!value && typeof value === 'object' && Object.keys(value).length > 0
const unexpectedEmptyBusinessSlice = (key, local, server) => BUSINESS_SLICE_KEYS.has(key) && populated(local) && !populated(server)

// Append-only event log, newest first. Every mutation gets its own entry: audit
// history is business data and must not be compacted or capped away.
function withAudit(s, action, objectId, detail = '') {
  const entry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: nowIST(), role: s.role, action,
    objectId: String(objectId ?? ''), detail: String(detail ?? ''),
  }
  const prev = s.audit || []
  return { ...s, audit: [entry, ...prev] }
}

// Side effects of a resolved approval (BT prototype's applyApprovalEffects):
// Red-continuation gates qualify or archive the lead; final quote release
// flips the proposal release state and the milestone.
function applyApprovalEffects(s, appr) {
  let next = s
  if (appr.type === 'Red customer clearance' && appr.leadId) {
    // 'Returned' does NOT clear the gate — leave the lead untouched so the
    // salesperson can address the comments and re-request.
    const lead = next.leads.find(l => l.id === appr.leadId)
    const leadPatch = appr.status === 'Rejected'
      ? { status: 'Dropped', droppedReason: 'Red-class continuation rejected' }
      : appr.status === 'Approved' || appr.status === 'Approved with conditions'
        // A late decision must not walk an already-registered lead backwards:
        // 'Converted' owns a live opportunity, and Qualified would orphan it.
        ? (lead?.status === 'Converted' ? null : { status: 'Qualified' })
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
      if (p) next = {
        ...next,
        proposals: { ...next.proposals, [appr.oppId]: {
          ...p,
          releaseStatus: 'Released',
          approvedPricing: {
            revision: p.revision,
            approvalSnapshot: appr.approvalSnapshot || proposalApprovalSnapshot(p, next.opportunities.find(o => o.id === appr.oppId)),
            listValue: appr.listValue ?? null,
            approvedValue: appr.requestedValue ?? null,
            discountPct: appr.discountPct ?? 0,
            markupPct: appr.markupPct ?? 0,
            approvedAt: new Date().toISOString(),
            approvalId: appr.id,
          },
          pricingHistory: [...(p.pricingHistory || []), {
            revision: p.revision,
            status: appr.status,
            when: new Date().toISOString(),
            listValue: appr.listValue ?? null,
            approvedValue: appr.requestedValue ?? null,
            discountPct: appr.discountPct ?? 0,
            markupPct: appr.markupPct ?? 0,
            approvalId: appr.id,
          }],
        } },
      }
      // Once the second joint decision lands, the quote is ready to dispatch
      // without requiring the owner to revisit the stepper.  Run the same
      // transition guard used by the workbench: a release must not skip a
      // still-pending technical/commercial gate or another lifecycle rule.
      const releasedProposal = next.proposals[appr.oppId]
      const releasedOpp = next.opportunities.find(o => o.id === appr.oppId)
      if (releasedProposal && releasedOpp && releasedOpp.milestone !== 'Submitted'
        && !transitionBlockers(releasedOpp, 'Submitted', releasedProposal, next).length) {
        next = {
          ...next,
          opportunities: next.opportunities.map(o => o.id === appr.oppId
            ? { ...o, milestone: 'Submitted', lastUpdated: nowIST().slice(0, 10) }
            : o),
        }
      }
    } else if (appr.status === 'Returned') {
      next = { ...next, opportunities: next.opportunities.map(o => (o.id === appr.oppId ? { ...o, milestone: 'Proposal' } : o)) }
    } else if (appr.status === 'Rejected') {
      next = { ...next, opportunities: next.opportunities.map(o => (o.id === appr.oppId ? { ...o, health: 'Blocked' } : o)) }
    }
  }
  return next
}

// An approval may have been completed before this version was deployed, or on
// another device while this browser was closed.  Reconcile those already-valid
// releases during boot and shared-state refresh, rather than waiting for a new
// button click to run applyApprovalEffects.  Only Approval moves forward here:
// a green historical release must never skip a quote from Proposal directly to
// Submitted, and later milestones must never move backward.
function reconcileApprovedSubmissions(s) {
  // Approval and proposal rows are persisted separately in Supabase. A
  // pull/focus refresh can therefore briefly deliver the approved
  // decision without the proposal mutation written by applyApprovalEffects
  // (and older clients may never have written that mutation at all). Rebuild
  // the release marker from the authoritative approval row so the submission
  // panel cannot stay locked after an approval that is already complete.
  let proposals = s.proposals || {}
  for (const approval of s.approvals || []) {
    if (approval.type !== 'Final quote release'
      || !approval.oppId
      || !['Approved', 'Approved with conditions'].includes(approval.status)) continue
    const proposal = proposals[approval.oppId]
    const opportunity = (s.opportunities || []).find(opp => opp.id === approval.oppId)
    if (!proposal || !opportunity || !releaseState(proposal, s.approvals, approval.oppId, opportunity).release) continue
    if (proposal.releaseStatus === 'Released' && proposal.approvedPricing?.approvalId === approval.id) continue
    proposals = {
      ...proposals,
      [approval.oppId]: {
        ...proposal,
        releaseStatus: 'Released',
        approvedPricing: {
          ...(proposal.approvedPricing || {}),
          revision: proposal.revision,
          approvalSnapshot: approval.approvalSnapshot || proposalApprovalSnapshot(proposal, opportunity),
          listValue: approval.listValue ?? proposal.approvedPricing?.listValue ?? null,
          approvedValue: approval.requestedValue ?? proposal.approvedPricing?.approvedValue ?? null,
          discountPct: approval.discountPct ?? proposal.approvedPricing?.discountPct ?? 0,
          markupPct: approval.markupPct ?? proposal.approvedPricing?.markupPct ?? 0,
          approvedAt: approval.decisionTs || proposal.approvedPricing?.approvedAt || new Date().toISOString(),
          approvalId: approval.id,
        },
      },
    }
  }
  let changed = false
  const opportunities = (s.opportunities || []).map(opp => {
    if (opp.milestone !== 'Approval') return opp
    const proposal = proposals[opp.id]
    if (!proposal || !releaseState(proposal, s.approvals, opp.id, opp).release) return opp
    if (transitionBlockers(opp, 'Submitted', proposal, s).length) return opp
    changed = true
    return { ...opp, milestone: 'Submitted', lastUpdated: nowIST().slice(0, 10) }
  })
  const proposalsChanged = proposals !== s.proposals
  return changed || proposalsChanged ? { ...s, proposals, opportunities } : s
}

export function StoreProvider({ children }) {
  const location = useLocation()
  const [state, setState] = useState(initialState)
  const [authReady, setAuthReady] = useState(() => !supabase || !!state.auth?.user)
  const [liveSyncStatus, setLiveSyncStatus] = useState(() => supabaseConfigError ? 'config-error' : datastore.dbEnabled() ? 'connecting' : 'offline')
  const [priceListsStatus, setPriceListsStatus] = useState(() => Object.keys(state.priceLists || {}).length ? 'ready' : 'loading')
  const [syncDiagnostics, setSyncDiagnostics] = useState({ normalizedOpportunityCount: null })
  setRoleNameConfig(state.config)
  // Ref mirror so read APIs (getProposal) see same-tick mutations, not the render closure.
  const stateRef = useRef(state)
  stateRef.current = state

  // ---- Supabase records-state sync (see datastore.js). localStorage stays the
  // instant source of truth; the server holds one JSONB row per synced slice.
  // hydratedRef gates server saves until the boot fetch resolves, so a fresh
  // device can't clobber good server data with its local seeds.
  const hydratedRef = useRef(!datastore.dbEnabled())
  const lastSavedRef = useRef({}) // per-slice snapshot of what the server has
  const saveTimerRef = useRef(null)
  const localCacheTimerRef = useRef(null)
  // What this device booted from. The boot fetch resolves *after* the app is
  // interactive, so a lead created in that window exists locally but has not
  // been saved yet (flushSaves is gated on hydratedRef). Comparing against this
  // is how hydrate() tells "untouched since boot, safe to replace" apart from
  // "the user already changed this, keep it" — the same rule applyServer uses.
  const bootRef = useRef(syncedOf(stateRef.current))

  const dirtySlices = () => {
    const s = stateRef.current
    const dirty = {}
    for (const [k, v] of Object.entries(syncedOf(s))) {
      if (v !== lastSavedRef.current[k]) dirty[k] = v
    }
    return dirty
  }

  const flushSaves = () => {
    persistLocalSnapshot(stateRef.current)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    if (!hydratedRef.current) return Promise.resolve()
    const dirty = dirtySlices()
    if (!Object.keys(dirty).length) return Promise.resolve()
    return datastore.saveSlices(dirty)
      .then(() => {
        setLiveSyncStatus('live')
        const current = stateRef.current
        const saved = { ...lastSavedRef.current }
      const confirmed = {}
        for (const [key, value] of Object.entries(dirty)) {
          if (JSON.stringify(current[key]) !== JSON.stringify(value)) continue
          saved[key] = value
          if (key === 'leads' || key === 'leadArchive' || key === 'clarifications' || key === 'opportunities') confirmed[key] = value
        }
        lastSavedRef.current = saved
        if (Object.keys(confirmed).length) {
          setState(s => ({
            ...s,
            leadSyncBaseline: { ...(s.leadSyncBaseline || {}), ...Object.fromEntries(Object.entries(confirmed).filter(([key]) => key === 'leads' || key === 'leadArchive')) },
            clarificationSyncBaseline: confirmed.clarifications || s.clarificationSyncBaseline || [],
            opportunitySyncBaseline: confirmed.opportunities || s.opportunitySyncBaseline || [],
          }))
        }
      })
      .catch(e => {
        setLiveSyncStatus('error')
        const saveError = {
          message: e?.message || 'Supabase save failed',
          code: e?.code || '',
          details: e?.details || '',
          hint: e?.hint || '',
        }
        setSyncDiagnostics(diagnostics => ({
          ...diagnostics,
          lastSaveErrorAt: new Date().toISOString(),
          lastSaveError: saveError,
        }))
        console.warn('Supabase save failed — will retry on next change/focus:', saveError)
      })
  }

  const flushLocalCache = () => {
    clearTimeout(localCacheTimerRef.current)
    localCacheTimerRef.current = null
    persistLocalSnapshot(stateRef.current)
  }

  // Boot fetch: server slices replace local synced ones (through migrate, so
  // schema backfills apply). An empty response is treated as degraded until an
  // operator explicitly initializes the shared workspace.
  //
  // "Replace" is deliberately limited to slices this device has not touched
  // since boot. The fetch resolves after the app is already interactive, and
  // saves are gated on hydratedRef, so anything created in that window lives
  // only in localStorage — spreading the server's copy over it would delete a
  // record the user just made and watched appear (simulate a lead, reload
  // straight away, and it is gone). Same rule as applyServer, measured against
  // bootRef instead of lastSavedRef because we have not saved anything yet.
  const hydrate = async () => {
    const res = await datastore.loadCore()
    if (!res) {
      if (!supabaseConfigError) setLiveSyncStatus('error')
      return
    }
    if (res.diagnostics) setSyncDiagnostics(res.diagnostics)
    if (res.error) {
      setLiveSyncStatus('error')
      return
    }
    setLiveSyncStatus('live')
    if (hydratedRef.current) return
    if (res.empty) {
      // An empty response can be a genuinely new workspace, but it is also
      // what an RLS/configuration mistake looks like in the browser. Never
      // auto-seed production from a browser snapshot: that can overwrite a
      // shared workspace with stale demo/local data. Explicit clear/reset
      // actions remain the only code paths allowed to initialise the server.
      hydratedRef.current = true
      setLiveSyncStatus('degraded')
      setSyncDiagnostics(diagnostics => ({ ...diagnostics, emptyWorkspaceAt: new Date().toISOString() }))
      console.debug('Supabase returned an empty workspace; local data was preserved and no automatic seed was written.')
      // A lead created while the initial request was in flight was preserved
      // locally, but its earlier flush was gated on hydration. Publish that
      // pending local change now that the empty-workspace decision is complete.
      setTimeout(flushSaves, 0)
    } else {
      const s = stateRef.current
      const accepted = {}
      const serverSlices = syncedOf(res.slices)
      // Existing deployments may still contain the old seeded dataset. Once
      // this browser is in production mode, purge that server snapshot before
      // accepting hydration so demo customers cannot reappear after refresh.
      if (s.demoData === false && serverSlices.demoData === true) {
        const clean = emptyState(s)
        try { await datastore.resetAll(syncedOf(clean)) }
        catch (e) { console.warn('Demo data purge could not be synced:', e?.message) }
        hydratedRef.current = true
        lastSavedRef.current = syncedOf(clean)
        setState(clean)
        return
      }
      const nextBaseline = { ...(s.leadSyncBaseline || {}) }
      let nextClarificationBaseline = s.clarificationSyncBaseline || []
      let nextOpportunityBaseline = s.opportunitySyncBaseline || []
      let nextSparesLinesBaseline = s.sparesLinesSyncBaseline || []
      for (const [k, v] of Object.entries(serverSlices)) {
        if (unexpectedEmptyBusinessSlice(k, s[k], v)) {
          console.debug(`Ignoring empty ${k} hydration response because this browser has populated data.`)
          continue
        }
        if (k === 'leads' || k === 'leadArchive') {
          const deletedLeadIds = [...new Set([...(s.deletedLeadIds || []), ...(serverSlices.deletedLeadIds || [])])]
          accepted.deletedLeadIds = deletedLeadIds
          const mergedLead = mergeLeadSlice(s[k], v, nextBaseline[k], deletedLeadIds)
          accepted[k] = mergedLead.rows
          nextBaseline[k] = mergedLead.baseline
          continue
        }
        // Approvals merge per row by sync stamp: a stale server snapshot must
        // never downgrade a local decision (this re-locked approved releases).
        if (k === 'approvals') {
          accepted[k] = mergeApprovalRows(s.approvals || [], v)
          continue
        }
        if (k === 'clarifications') {
          const mergedClarifications = mergeClarificationSlice(s.clarifications || [], v, s.clarificationSyncBaseline || [])
          accepted[k] = mergedClarifications.rows
          nextClarificationBaseline = mergedClarifications.baseline
          continue
        }
        if (k === 'opportunities') {
          const serverOpportunityIds = new Set((v || []).map(row => row?.id).filter(Boolean))
          const pendingOpportunitySyncIds = (s.pendingOpportunitySyncIds || []).filter(id => !serverOpportunityIds.has(id))
          const mergedOpportunities = mergeOpportunitySlice(s.opportunities || [], v, s.opportunitySyncBaseline || [], s.deletedOpportunityIds || [], pendingOpportunitySyncIds)
          accepted[k] = mergedOpportunities.rows
          nextOpportunityBaseline = mergedOpportunities.baseline
          accepted.pendingOpportunitySyncIds = pendingOpportunitySyncIds
          continue
        }
        if (k === 'sparesLines') {
          const mergedSparesLines = mergeSparesLineSlice(s.sparesLines || [], v, s.sparesLinesSyncBaseline || [])
          accepted[k] = mergedSparesLines.rows
          nextSparesLinesBaseline = mergedSparesLines.baseline
          continue
        }
        if (k in s && s[k] !== bootRef.current[k]) continue // edited this session — keep local
        accepted[k] = v
      }
      const merged = reconcileApprovedSubmissions(migrate({ ...s, ...accepted, leadSyncBaseline: nextBaseline, clarificationSyncBaseline: nextClarificationBaseline, opportunitySyncBaseline: nextOpportunityBaseline, sparesLinesSyncBaseline: nextSparesLinesBaseline }))
      // Only user changes made during the boot request should be dirty. A
      // cached state slice that the server has never stored is not an edit;
      // treating every such slice as dirty makes every browser push its whole
      // local snapshot and causes consolidated state conflicts between tabs.
      const acceptedKeys = new Set(Object.keys(accepted))
      const serverKeys = new Set(Object.keys(serverSlices))
      const savedBaseline = {}
      for (const key of acceptedKeys) savedBaseline[key] = serverSlices[key] ?? merged[key]
      for (const [key, value] of Object.entries(syncedOf(merged))) {
        if (acceptedKeys.has(key) || serverKeys.has(key)) continue
        if (JSON.stringify(s[key]) === JSON.stringify(bootRef.current[key])) {
          savedBaseline[key] = value
        }
      }
      lastSavedRef.current = savedBaseline
      hydratedRef.current = true
      setState(merged)
      // Push whatever the user did during the boot window now, rather than
      // leaving it to depend on them making another change. Deferred by a tick
      // because flushSaves reads stateRef, which only catches up on the render
      // setState above has just scheduled.
      setTimeout(flushSaves, 0)
    }
    // Non-critical configuration and catalogues must not delay the first
    // opportunity render. They still flow through applyServer so dirty local
    // edits and the normal merge rules remain protected.
    datastore.loadBackground()
      .then(background => {
        if (!background) return
        if (background.diagnostics) setSyncDiagnostics(background.diagnostics)
        if (background.error) { setLiveSyncStatus('error'); return }
        if (hydratedRef.current && !background.empty) {
          applyServer(background.slices, background.diagnostics)
          setLiveSyncStatus('live')
        }
      })
      .catch(() => setLiveSyncStatus('error'))
  }

  // Focus refetch: pull server slices where this device has no unsaved edits.
  // Dirty local slices win until their debounced save lands.
  const applyServer = (slices, diagnostics = null, { allowEmptyBusinessSlices = false } = {}) => {
    if (diagnostics) setSyncDiagnostics(diagnostics)
    const s = stateRef.current
    const updates = {}
    const nextBaseline = { ...(s.leadSyncBaseline || {}) }
    let nextClarificationBaseline = s.clarificationSyncBaseline || []
    let nextOpportunityBaseline = s.opportunitySyncBaseline || []
    let nextSparesLinesBaseline = s.sparesLinesSyncBaseline || []
    for (const [k, v] of Object.entries(syncedOf(slices))) {
      if (!allowEmptyBusinessSlices && unexpectedEmptyBusinessSlice(k, s[k], v)) {
        console.debug(`Ignoring empty ${k} refresh response because this browser has populated data.`)
        setSyncDiagnostics(current => ({ ...current, protectedEmptyRefreshAt: new Date().toISOString(), protectedEmptySlice: k }))
        continue
      }
      // Approvals merge per row by sync stamp — a stale server snapshot must
      // never downgrade a decision that was just recorded locally.
      if (k === 'approvals') {
        const mergedApprovals = mergeApprovalRows(s.approvals || [], v)
        if (JSON.stringify(s.approvals) !== JSON.stringify(mergedApprovals)) {
          updates.approvals = mergedApprovals
          nextBaseline.approvals = mergedApprovals
        }
        continue
      }
      if (k === 'clarifications') {
        const mergedClarifications = mergeClarificationSlice(s.clarifications || [], v, s.clarificationSyncBaseline || [])
        // Even when the rendered rows stay local, a differing server snapshot
        // must update the dirty baseline so the preserved questions are pushed
        // back instead of silently accepted as synced.
        if (JSON.stringify(s.clarifications || []) !== JSON.stringify(v)) updates.clarifications = mergedClarifications.rows
        nextClarificationBaseline = mergedClarifications.baseline
        continue
      }
      if (k === 'opportunities') {
        const serverOpportunityIds = new Set((v || []).map(row => row?.id).filter(Boolean))
        const pendingOpportunitySyncIds = (s.pendingOpportunitySyncIds || []).filter(id => !serverOpportunityIds.has(id))
        const mergedOpportunities = mergeOpportunitySlice(s.opportunities || [], v, s.opportunitySyncBaseline || [], s.deletedOpportunityIds || [], pendingOpportunitySyncIds)
        if (JSON.stringify(s.opportunities || []) !== JSON.stringify(mergedOpportunities.rows)) updates.opportunities = mergedOpportunities.rows
        nextOpportunityBaseline = mergedOpportunities.baseline
        if (JSON.stringify(s.pendingOpportunitySyncIds || []) !== JSON.stringify(pendingOpportunitySyncIds)) updates.pendingOpportunitySyncIds = pendingOpportunitySyncIds
        continue
      }
      if (k === 'sparesLines') {
        const mergedSparesLines = mergeSparesLineSlice(s.sparesLines || [], v, s.sparesLinesSyncBaseline || [])
        if (JSON.stringify(s.sparesLines || []) !== JSON.stringify(mergedSparesLines.rows)) updates.sparesLines = mergedSparesLines.rows
        nextSparesLinesBaseline = mergedSparesLines.baseline
        continue
      }
      // A background slice may not have a server baseline yet because the
      // fast boot path intentionally skips large records. Compare those
      // slices with the boot cache instead of mistaking every cached value
      // for an unsaved edit. Once a baseline exists, the normal save-aware
      // comparison protects edits made while the request was in flight.
      const hasSavedBaseline = Object.prototype.hasOwnProperty.call(lastSavedRef.current, k)
      const baseline = hasSavedBaseline ? lastSavedRef.current[k] : bootRef.current[k]
      const dirty = k in s && JSON.stringify(s[k]) !== JSON.stringify(baseline)
      if (dirty) continue
      if (JSON.stringify(s[k]) === JSON.stringify(v)) continue
      updates[k] = v
      if (k === 'leads' || k === 'leadArchive') nextBaseline[k] = v
    }
    const sparesBaselineChanged = JSON.stringify(s.sparesLinesSyncBaseline || []) !== JSON.stringify(nextSparesLinesBaseline)
    if (!Object.keys(updates).length && !sparesBaselineChanged) return
    const merged = reconcileApprovedSubmissions(migrate({ ...s, ...updates, leadSyncBaseline: nextBaseline, clarificationSyncBaseline: nextClarificationBaseline, opportunitySyncBaseline: nextOpportunityBaseline, sparesLinesSyncBaseline: nextSparesLinesBaseline }))
    // Keep the server snapshot as the dirty baseline. If the merge preserved
    // a local question over stale server data, the next debounced save must
    // still upload that local row instead of treating it as already synced.
    lastSavedRef.current = { ...lastSavedRef.current, ...Object.fromEntries(Object.entries(syncedOf(slices))) }
    setState(merged)
  }

  const loadApprovedPriceLists = async ({ force = false } = {}) => {
    const cached = datastore.readPriceListsCache()
    if (cached && !Object.keys(stateRef.current.priceLists || {}).length) {
      setState(s => ({ ...s, priceLists: cached }))
      lastSavedRef.current = { ...lastSavedRef.current, priceLists: cached }
      setPriceListsStatus(Object.keys(cached).length ? 'ready' : 'empty')
    }
    if (!datastore.dbEnabled()) {
      setPriceListsStatus(Object.keys(stateRef.current.priceLists || {}).length ? 'ready' : 'empty')
      return
    }
    setPriceListsStatus(Object.keys(stateRef.current.priceLists || {}).length ? 'refreshing' : 'loading')
    try {
      const result = await datastore.loadPriceLists({ force })
      if (!result) throw new Error('Approved price lists could not be loaded')
      const next = result.priceLists || {}
      const current = stateRef.current.priceLists || {}
      const baseline = lastSavedRef.current.priceLists
      const dirty = baseline && JSON.stringify(current) !== JSON.stringify(baseline)
      if (!dirty) {
        lastSavedRef.current = { ...lastSavedRef.current, priceLists: next }
        setState(s => ({ ...s, priceLists: next }))
      }
      setPriceListsStatus(Object.keys(next).length ? (result.degraded ? 'degraded' : 'ready') : 'empty')
    } catch (error) {
      console.warn('Approved price-list load failed:', error?.message || error)
      setPriceListsStatus(Object.keys(stateRef.current.priceLists || {}).length ? 'ready' : 'error')
    }
  }

  const pullSharedData = async () => {
    if (!datastore.dbEnabled()) return false
    await flushSaves()
    const res = await datastore.loadAll({ force: true })
    if (!res) { setLiveSyncStatus('error'); return false }
    if (res.diagnostics) setSyncDiagnostics(res.diagnostics)
    if (res.error) { setLiveSyncStatus('error'); return false }
    if (res.empty) { setLiveSyncStatus('degraded'); return false }
    setLiveSyncStatus('live')
    applyServer(res.slices, res.diagnostics)
    return true
  }

  useEffect(() => {
    if (!datastore.dbEnabled()) return
    hydrate()
    loadApprovedPriceLists()
    let lastFetch = Date.now()
    const onFocus = () => {
      if (Date.now() - lastFetch < 45000) return
      lastFetch = Date.now()
      if (!hydratedRef.current) { hydrate(); return }
      // Retry any write that failed while the browser was reconnecting before
      // pulling a newer server snapshot. The dirty local slice remains
      // protected by lastSavedRef until this succeeds.
      flushSaves()
      pullSharedData()
        .catch(() => setLiveSyncStatus('error'))
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushLocalCache(); flushSaves()
      } else if (hydratedRef.current) {
        flushSaves()
        pullSharedData().catch(() => setLiveSyncStatus('error'))
      }
    }
    const onOnline = () => {
      if (!hydratedRef.current) { hydrate(); return }
      flushSaves()
      pullSharedData()
        .catch(() => setLiveSyncStatus('error'))
    }
    // visibilitychange is not reliably delivered when the page is being torn
    // down, which is exactly the reload-right-after-editing case. pagehide is.
    const onPageHide = () => { flushLocalCache(); flushSaves() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  // Pull the shared snapshot after route navigation. The store remains the
  // single merge/conflict boundary, so page components do not need separate
  // Supabase loaders or their own offline/error handling.
  useEffect(() => {
    if (!datastore.dbEnabled() || !hydratedRef.current) return
    flushSaves()
    pullSharedData().catch(() => setLiveSyncStatus('error'))
  }, [location.pathname])

  useEffect(() => {
    // An uncaught throw here (quota, storage disabled) would kill persistence
    // silently while the app carried on looking normal — seed data is rebuilt
    // by migrate() on every boot, so only the records the user created would
    // go missing. Fail loudly in the console instead.
    clearTimeout(localCacheTimerRef.current)
    localCacheTimerRef.current = setTimeout(flushLocalCache, 300)
    if (!datastore.dbEnabled() || !hydratedRef.current) return
    if (!Object.keys(dirtySlices()).length) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushSaves, 1500)
  }, [state])

  useEffect(() => () => clearTimeout(localCacheTimerRef.current), [])

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
    priceListsStatus,
    reloadPriceLists: () => loadApprovedPriceLists({ force: true }),
    async loadPriceListVersion(listCode, versionCode) {
      const loaded = await datastore.loadPriceListVersion(listCode, versionCode)
      if (!loaded) return
      setState(s => {
        const current = s.priceLists?.[listCode]
        if (!current) return s
        const versions = (current.versions || []).map(version => version.version === versionCode
          ? { ...version, currency: loaded.source_currency, uploaded: loaded.uploaded_at || '', filename: loaded.filename || '', parts: loaded.parts }
          : version)
        const next = { ...s.priceLists, [listCode]: { ...current, versions } }
        persistLocalSnapshot({ ...s, priceLists: next })
        return { ...s, priceLists: next }
      })
    },

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
        deletedOpportunityIds: (s.deletedOpportunityIds || []).filter(id => id !== opp.id),
        pendingOpportunitySyncIds: [...new Set([...(s.pendingOpportunitySyncIds || []), opp.id])],
        files: { ...s.files, [opp.id]: Object.fromEntries(SUBFOLDERS.map(f => [f, []])) },
      }, 'Opportunity registered', opp.id, opp.oppName))
      // Opportunity creation is immediately followed by navigation to the
      // workbench. Do not make the first refresh depend on the ordinary draft
      // debounce or on an asynchronous pagehide event; the next turn gives
      // React time to publish the new state through stateRef before saving it.
      setTimeout(flushSaves, 0)
      spTrack(opp.id, 'Open', () => filestore.ensureOppFolder(opp))
    },

    updateOpportunity(id, patch) {
      const today = nowIST().slice(0, 10)
      // Status-folder diff BEFORE the patch lands — a stage change (Won/Lost/
      // reopen) moves the SharePoint folder between the four status folders.
      const before = stateRef.current.opportunities.find(o => o.id === id)
      // Registration facts are editable only while the opportunity is being
      // captured. Later stages, including Approval, must not rewrite the
      // values an approver reviewed.
      const editableMilestones = new Set(['Intake', 'Registration'])
      const detailFields = new Set([
        'owner', 'oppName', 'opportunityScope', 'rfqNumber', 'rfqDate', 'valueK',
        'sellTo', 'category', 'location', 'customerStatus', 'eucName',
        'eucLocation', 'oppType', 'bu', 'segment', 'solution', 'product',
        'prob', 'contactPerson', 'contactPhone', 'additionalCustomerInformation',
      ])
      if (before && !editableMilestones.has(before.milestone)) {
        patch = Object.fromEntries(Object.entries(patch).filter(([key]) => !detailFields.has(key)))
      }
      // Legacy pipeline edits still need to move the canonical workflow. The
      // milestone is what the workbench and list views use to choose the page.
      if (patch.stage && !patch.milestone) {
        patch = { ...patch, milestone: milestoneForStage(patch.stage, patch.status || before?.status) }
      }
      // A type change re-derives both branching axes — leaving a Retrofit on
      // the Greenfield lane would silently skip the B-01..B-05 chain.
      if (patch.oppType) {
        patch = { route: routeForType(patch.oppType), context: contextForType(patch.oppType), ...patch }
      }
      const shouldSyncProposal = shouldSyncProposalFromOpportunity(patch)
      setState(s => {
        const opportunities = s.opportunities.map(o =>
          o.id === id ? { ...o, ...patch, lastUpdated: today } : o)
        const updated = opportunities.find(o => o.id === id)
        const proposal = s.proposals[id]
        return withAudit({
          ...s,
          opportunities,
          ...(proposal && updated && shouldSyncProposal
            ? { proposals: { ...s.proposals, [id]: syncProposalFromOpportunity(proposal, updated) } }
            : {}),
        }, 'Opportunity updated', id, Object.keys(patch).join(', '))
      })
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
            deletedOpportunityIds: [...new Set([...(s.deletedOpportunityIds || []), id])],
            pendingOpportunitySyncIds: (s.pendingOpportunitySyncIds || []).filter(pendingId => pendingId !== id),
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
      return newProposal(oppId, opp, { validityDays: s.config?.proposalValidityDays, currencyRates: s.config?.currencyRates, costingDefaults: s.config?.costingDefaults })
    },

    saveProposal(oppId, proposal, { immediate = false } = {}) {
      setState(s => withAudit(
        { ...s, proposals: { ...s.proposals, [oppId]: proposal } },
        'Proposal saved', oppId, `Rev ${proposal.revision}`))
      if (immediate) {
        // Commercial decisions are workflow-critical. Publish the state
        // change through React, then flush on the next turn so stateRef sees
        // the new proposal instead of waiting for the ordinary debounce.
        setTimeout(flushSaves, 0)
      }
    },

    updateProposalCosting(oppId, patch) {
      setState(s => {
        const opp = s.opportunities.find(item => item.id === oppId)
        const current = s.proposals[oppId] || newProposal(oppId, opp, {
          validityDays: s.config?.proposalValidityDays,
          currencyRates: s.config?.currencyRates,
          costingDefaults: s.config?.costingDefaults,
        })
        const costing = { ...(current.costing || {}), ...patch }
        return withAudit({
          ...s,
          proposals: { ...s.proposals, [oppId]: { ...current, costing } },
        }, 'Proposal costing updated', oppId, JSON.stringify(patch))
      })
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
        // Only explicit quote revisions count toward the customer-facing version.
        const nextRevisionNumber = revisions.filter(r => r.status === 'Revised').length + 2
        const spec = REVISION_TYPES.find(r => r.id === type) || REVISION_TYPES[REVISION_TYPES.length - 1]
        const next = {
          ...p,
          revision: String(Math.max((+p.revision || 0) + 1, nextRevisionNumber)).padStart(2, '0'),
          releaseStatus: 'Superseded',
          reviewStatus: 'Needs review',
          reviewIssues: [],
          reviewNeedsRevision: false,
          revisions: [...revisions, {
            rev: `Rev-${String((+p.revision || 0) + 1).padStart(2, '0')}`,
            when: new Date().toISOString().slice(0, 10),
            by: s.role, note: note || 'Revision opened', status: 'Revised', type: spec.id,
            snapshot: snapshotProposal(p),
          }],
        }
        return withAudit({
          ...s,
          proposals: { ...s.proposals, [oppId]: next },
          opportunities: s.opportunities.map(o => (o.id === oppId ? { ...o, milestone: 'Sourcing' } : o)),
        }, 'Quote revision opened', oppId,
        `Rev ${next.revision} - ${spec.id} change, re-approval required - ${note || 'no reason given'}`)
      })
    },

    // Diagram 02 §3: the assigned salesperson signs off each Brownfield step.
    assignBStep(oppId, stepId, assignee) {
      if (!B_STEPS.some(step => step.id === stepId) || !ROLES[assignee] || ROLES[assignee].external) return
      setState(s => {
        if (!['LJS', 'AH'].includes(s.role) && !ROLES[s.role]?.admin) return s
        const opp = s.opportunities.find(item => item.id === oppId)
        if (!opp || opp.context !== 'Brownfield') return s
        const owners = { ...defaultBStepOwners(opp), ...(s.bStepOwners[oppId] || {}) }
        if (owners[stepId] === assignee) return s
        const index = B_STEPS.findIndex(step => step.id === stepId)
        const signed = { ...(s.bSteps[oppId] || {}) }
        for (const step of B_STEPS.slice(index)) delete signed[step.id]
        return withAudit({
          ...s,
          bStepOwners: { ...s.bStepOwners, [oppId]: { ...owners, [stepId]: assignee } },
          bSteps: { ...s.bSteps, [oppId]: signed },
        }, 'B-step owner assigned', oppId, `${stepId} -> ${assignee}`)
      })
    },

    signBStep(oppId, stepId, note = '') {
      const step = B_STEPS.find(b => b.id === stepId)
      if (!step) return
      const current = stateRef.current
      const opp = current.opportunities.find(item => item.id === oppId)
      if (!opp || opp.context !== 'Brownfield') return
      if (!canSignBStep(current.role, opp)) return
      const index = B_STEPS.findIndex(item => item.id === stepId)
      const signed = current.bSteps[oppId] || {}
      if (index > 0 && signed[B_STEPS[index - 1].id]?.state !== 'Signed') return
      setState(s => withAudit({
        ...s,
        bSteps: {
          ...s.bSteps,
          [oppId]: {
            ...(s.bSteps[oppId] || {}),
            [stepId]: { state: 'Signed', by: s.role, assignedTo: opp.owner, at: new Date().toISOString(), note },
          },
        },
      }, 'Workflow step signed off', oppId, `${stepId} ${step.label}${note ? ` — ${note}` : ''}`))
    },

    unsignBStep(oppId, stepId, reason = '') {
      setState(s => {
        const opp = s.opportunities.find(item => item.id === oppId)
        if (!opp || !canSignBStep(s.role, opp)) return s
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
    closeLost(oppId, reason, competitor = null, reasonNote = '') {
      if (!reason) return
      setState(s => {
        const next = withAudit({
          ...s,
          opportunities: s.opportunities.map(o => (o.id === oppId
            ? { ...o, stage: 'Lost', status: 'Closed', closedReason: reason, closedReasonNote: reason === 'Others' ? reasonNote : '', milestone: 'Follow-up', lastUpdated: nowIST().slice(0, 10) }
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

    markWon(oppId, reason = 'Customer acceptance', reasonNote = '') {
      const today = nowIST().slice(0, 10)
      const before = stateRef.current.opportunities.find(o => o.id === oppId)
      if (!before) return
      setState(s => withAudit({
        ...s,
        opportunities: s.opportunities.map(o => (o.id === oppId
          ? { ...o, stage: 'Won', status: 'Closed', closedReason: reason, closedReasonNote: reason === 'Other' ? reasonNote : '', milestone: 'Handover', lastUpdated: today }
          : o)),
      }, 'Opportunity won', oppId, reason))
      const after = { ...before, stage: 'Won', status: 'Closed', milestone: 'Handover' }
      const from = statusFolderFor(before)
      const to = statusFolderFor(after)
      if (from !== to) spTrack(oppId, to, () => filestore.moveOppFolder(after, from, to))
    },

    addAdhocPart(part) {
      setState(s => ({ ...s, adhocParts: [part, ...s.adhocParts] }))
    },

    // communications[oppId] = [{ id, ts, to, subject, kind }], newest first.
    addCommunication(oppId, entry) {
      setState(s => withAudit({
        ...s,
        communications: {
          ...(s.communications || {}),
          [oppId]: [{ id: entry.id || `CM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: new Date().toISOString(), ...entry }, ...((s.communications || {})[oppId] || [])],
        },
      }, entry.kind === 'submission'
        ? 'Proposal submitted'
        : entry.kind === 'proposal-email-compose' ? 'Proposal email compose opened'
        : entry.kind === 'vendor-rfq' ? 'Manufacturer RFQ sent'
        : entry.kind === 'clarification' ? 'Clarification emailed' : 'Proposal emailed',
      oppId, entry.subject))
    },

    updateCommunication(oppId, communicationId, patch, action = 'Communication updated') {
      setState(s => withAudit({
        ...s,
        communications: {
          ...(s.communications || {}),
          [oppId]: ((s.communications || {})[oppId] || []).map(c => (
            c.id === communicationId ? { ...c, ...patch } : c
          )),
        },
      }, action, oppId, patch.reviewerDecision || patch.aiClassification?.outcome || communicationId))
    },

    // ---- Lead inbox -------------------------------------------------------
    addLead(lead) {
      setState(s => withAudit(
        { ...s, leads: [{ ...lead, ts: toISTISOString(lead.ts || new Date()) }, ...s.leads] },
        'Lead received', lead.id, lead.subject))
      // A new enquiry is immediately followed by navigation. Publish it after
      // React commits the state update so a quick refresh cannot lose the row
      // before the ordinary draft-save debounce runs.
      setTimeout(flushSaves, 0)
    },

    // Throw away the rows the inbox simulator generated, without the blunt
    // instrument of a full "Reset demo data". Converted ones stay — see
    // isPurgeableSimulated; an opportunity hangs off those.
    clearSimulatedLeads() {
      setState(s => withAudit({
        ...s,
        leads: withoutSimulated(s.leads),
        leadArchive: withoutSimulated(s.leadArchive || []),
      }, 'Simulated leads cleared', '', `${simulatedCount(s.leads, s.leadArchive)} removed`))
    },

    updateLead(id, patch, detail = '') {
      setState(s => {
        const next = { ...s, leads: s.leads.map(l => (l.id === id ? { ...l, ...patch } : l)) }
        const auditKeys = Object.keys(patch).filter(k => !['readAt', 'starred'].includes(k))
        if (!auditKeys.length) return next
        const updated = next.leads.find(l => l.id === id)
        const archived = patch.status === 'Dropped' && updated
          ? (next.leadArchive || []).some(x => x.id === id)
            ? next.leadArchive
            : [{ ...updated, archivedAt: nowIST(), archiveReason: updated.droppedReason || detail }, ...(next.leadArchive || [])]
          : next.leadArchive || []
        const audited = withAudit(next, patch.status ? `Lead ${patch.status.toLowerCase()}` : 'Lead updated', id,
          detail || patch.droppedReason || patch.oppId || auditKeys.join(', '))
        return { ...audited, leadArchive: archived }
      })
    },

    // Draft edits are persisted without adding an audit entry for every
    // keystroke. The explicit Save action still uses updateLead above so the
    // completed decision is recorded in the audit trail.
    updateLeadDraft(id, patch) {
      setState(s => ({
        ...s,
        leads: s.leads.map(l => (l.id === id ? { ...l, ...patch } : l)),
      }))
    },

    updateLeads(ids, patch, detail = '') {
      const wanted = new Set(ids || [])
      if (!wanted.size) return
      setState(s => {
        const changed = (s.leads || []).filter(lead => wanted.has(lead.id))
        if (!changed.length) return s
        const next = { ...s, leads: s.leads.map(lead => wanted.has(lead.id) ? { ...lead, ...patch } : lead) }
        const auditKeys = Object.keys(patch).filter(k => !['readAt', 'starred'].includes(k))
        return auditKeys.length
          ? withAudit(next, 'Leads updated', `${changed.length} selected`, detail || auditKeys.join(', '))
          : next
      })
    },

    // Permanent cleanup for an inbox lead. Registration/opportunity records
    // are protected here so deleting a mailbox row cannot orphan commercial
    // history; the caller confirms before invoking this action.
    deleteLead(id) {
      const lead = stateRef.current.leads.find(l => l.id === id)
        || (stateRef.current.leadArchive || []).find(l => l.id === id)
      if (!lead || lead.oppId) return false
      leadBlobs.deleteLead(id)
      setState(s => withAudit({
        ...s,
        leads: (s.leads || []).filter(l => l.id !== id),
        leadArchive: (s.leadArchive || []).filter(l => l.id !== id),
        leadDeadlines: (s.leadDeadlines || []).filter(d => d.leadId !== id),
        deletedLeadIds: [...new Set([...(s.deletedLeadIds || []), id])],
      }, 'Lead deleted', id, lead.subject || lead.sender || 'Inbox lead'))
      return true
    },

    processLeadDeadlines(now = new Date()) {
      setState(s => {
        const cfg = leadConfig(s.config)
        const rows = []
        let next = { ...s, leadDeadlines: s.leadDeadlines || [], leadArchive: s.leadArchive || [] }
        for (const lead of s.leads || []) {
          if (['Converted', 'Dropped'].includes(lead.status)) continue
          const expired = expiredLeadDeadline(lead, cfg, now)
          if (!expired) continue
          const deadlineKey = `${lead.id}:${expired.type}`
          if (next.leadDeadlines.some(d => d.key === deadlineKey && d.status === 'Expired')) continue
          const updated = { ...lead, status: 'Dropped', droppedReason: `${expired.reason} after ${cfg.leadDeadlines[`${expired.type}Days`] || 7} days`, expiredDeadline: expired.type }
          next.leads = next.leads.map(item => item.id === lead.id ? updated : item)
          next.leadArchive = [{ ...updated, archivedAt: toISTISOString(now), archiveReason: updated.droppedReason }, ...next.leadArchive]
          next.leadDeadlines = [...next.leadDeadlines, { key: deadlineKey, leadId: lead.id, type: expired.type, dueAt: expired.dueAt, status: 'Expired', expiredAt: toISTISOString(now) }]
          rows.push(lead.id)
        }
        return rows.length ? withAudit(next, 'Lead deadlines processed', rows.join(','), `${rows.length} lead(s) discarded`) : s
      })
    },

    recordAiAction(leadId, payload) {
      setState(s => withAudit(s, 'AI action', leadId, aiAuditDetail(payload)))
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
            ? { ...l, status: 'New', oppId: null, droppedReason: '', revertedAt: nowIST(), revertReason: reason }
            : l)),
        },
        'Lead reverted to inbox', id, [lead?.oppId && `removed ${lead.oppId}`, reason].filter(Boolean).join(' — ')))
    },

    // ---- Approvals --------------------------------------------------------
    requestApproval(req) {
      setState(s => {
        const opportunity = s.opportunities.find(item => item.id === req.oppId)
        // The builder can display a generated proposal before the first save.
        // Snapshot that same proposal instead of recording an empty snapshot,
        // otherwise approval is immediately voided when the quote is saved.
        const proposal = s.proposals[req.oppId] || newProposal(req.oppId, opportunity, {
          validityDays: s.config?.proposalValidityDays,
          currencyRates: s.config?.currencyRates,
          costingDefaults: s.config?.costingDefaults,
        })
        const memoryKey = approvalMemoryKey(req)
        const alreadyRemembered = s.approvals.find(existing => existing.oppId === req.oppId
          && existing.type === req.type
          && existing.status === 'Pending'
          && (existing.approvalKey || approvalMemoryKey(existing)) === memoryKey)
        if (alreadyRemembered) {
          if (!req.refreshPendingContext || alreadyRemembered.status !== 'Pending') return s
          const { refreshPendingContext, ...requestContext } = req
          return withAudit({
            ...s,
            approvals: s.approvals.map(existing => existing.id === alreadyRemembered.id
              ? { ...existing, ...requestContext, approvalKey: memoryKey }
              : existing),
          }, 'Approval request context updated', alreadyRemembered.id, `${alreadyRemembered.type} — ${alreadyRemembered.oppId}`)
        }
        const id = mintId('AP', s.approvals, 100)
        const previous = s.approvals
          .filter(existing => existing.oppId === req.oppId
            && existing.type === req.type
            && existing.status === 'Rejected'
            && (existing.approvalKey || approvalMemoryKey(existing)) === memoryKey)
          .sort((a, b) => (b.decisionTs || b.ts || '').localeCompare(a.decisionTs || a.ts || ''))[0]
        const previousRejection = previous ? {
          approvalId: previous.id,
          comment: previous.decisionNote || '',
          requiredActions: previous.rejectionActions?.length
            ? previous.rejectionActions
            : [previous.decisionNote].filter(Boolean),
        } : null
        const appr = {
          id, status: 'Pending', conditions: [], decisionTs: '', decisionNote: '',
          ts: new Date().toISOString(), requestedBy: s.role, ...req, approvalKey: memoryKey,
          // Sync stamp: lets applyServer tell a newer local row from a stale
          // server copy (see mergeApprovalRows).
          __sv: new Date().toISOString(),
          approvalSnapshot: req.approvalSnapshot || proposalApprovalSnapshot(proposal, opportunity),
          // Pricing approvals are remembered by the offending rows only, so the
          // approval survives unrelated proposal edits and revision bumps.
          ...(req.type === 'Pricing threshold exception' && req.pricingRows?.length
            ? { pricingSignature: pricingExceptionSignature(req.pricingRows) }
            : {}),
          ...(previousRejection ? { previousRejection } : {}),
        }
        // A same-key Approved/Returned row the gate still refuses to honor
        // (stale stamp from before deviationDetails were recorded) is
        // superseded here, not left dangling — otherwise the Approvals list
        // shows a green "Approved" row while the dialog keeps asking, and the
        // approver can never tell which row actually counts.
        const superseded = s.approvals
          .filter(existing => existing.oppId === req.oppId
            && existing.type === req.type
            && ['Approved', 'Approved with conditions', 'Returned'].includes(existing.status)
            && (existing.approvalKey || approvalMemoryKey(existing)) === memoryKey)
        return withAudit(
          { ...s,
            approvals: [
              appr,
              ...s.approvals.map(existing => superseded.some(x => x.id === existing.id)
                ? { ...existing, status: 'Cancelled', supersededBy: id, cancelledAt: new Date().toISOString(), __sv: new Date().toISOString() }
                : existing),
            ] },
          'Approval requested', appr.id, `${appr.type} — ${appr.oppId} → ${appr.approver}`)
      })
    },

    cancelApproval(id, reason = '') {
      setState(s => {
        const approval = s.approvals.find(a => a.id === id)
        if (!approval || approval.status !== 'Pending') return s
        const next = {
          ...s,
          approvals: s.approvals.map(a => (a.id === id
            ? { ...a, status: 'Cancelled', cancelledBy: s.role, cancelledAt: new Date().toISOString(), __sv: new Date().toISOString(), decisionNote: reason || a.decisionNote }
            : a)),
        }
        return withAudit(next, 'Approval cancelled', id, reason || 'No longer required')
      })
    },

    decideApproval(id, { status, conditions = [], decisionNote = '' }) {
      setState(s => withAudit({
        ...s,
        approvals: s.approvals.map(a => a.id === id
          // decidedBy so the outcome can be reported back to whoever decided it;
          // the joint path below records the same thing as keys of `decisions`.
          ? { ...a, status, decisionNote, decidedBy: s.role, decisionTs: new Date().toISOString(),
              conditions: status === 'Approved with conditions'
                ? conditions.map(c => (typeof c === 'string' ? { text: c, incorporated: false, note: '' } : c))
                : a.conditions }
          : a),
      }, `Approval ${status.toLowerCase()}`, id, decisionNote))
    },

    // Salesperson confirms an approval condition is incorporated in the proposal.
    confirmCondition(approvalId, idx, note, evidence = null) {
      setState(s => withAudit({
        ...s,
        approvals: s.approvals.map(a => a.id === approvalId
          ? { ...a, conditions: a.conditions.map((c, i) => (i === idx ? { ...c, incorporated: true, note, ...(evidence ? { evidence } : {}) } : c)) }
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
        : withAudit({ ...s, customers: [...s.customers, cust] }, 'Customer added', cust.name, 'Customer master record created'))
    },

    // Bulk import of the client's existing customer list (the Customer
    // Master's Excel/CSV upload). Rows whose name already exists are skipped —
    // a file never overwrites the master. Admin-only, one audit entry.
    importCustomers(rows, reason = '') {
      setState(s => {
        if (!ROLES[s.role]?.admin) return s
        const have = new Set(s.customers.map(c => c.name.toLowerCase()))
        const fresh = (rows || []).filter(r => r?.name && !have.has(String(r.name).toLowerCase()))
        if (!fresh.length) return s
        const names = fresh.map(c => c.name).slice(0, 8).join(', ') + (fresh.length > 8 ? '…' : '')
        return withAudit(
          { ...s, customers: [...s.customers, ...fresh] },
          'Customers imported', `${fresh.length} added`,
          [names, reason].filter(Boolean).join(' · '))
      })
    },

    setRole(role) {
      // Audit against the pre-switch state so the entry records who switched.
      // External (customer) accounts can never escalate to an internal persona.
      setState(s => (ROLES[role] && s.auth?.user?.role !== 'CUST'
        ? { ...withAudit(s, 'Persona switched', role, `from ${s.role}`), role }
        : s))
    },

    addUser(user) {
      setState(s => {
        if (!ROLES[s.role]?.admin || !user?.email) return s
        if (s.users.some(u => String(u.email || '').toLowerCase() === String(user.email).toLowerCase())) return s
        return withAudit({ ...s, users: [...s.users, user] }, 'User added', user.id || user.email, `role ${user.role || '—'}`)
      })
    },

    updateUser(id, patch) {
      setState(s => {
        const users = s.users.map(u => (u.id === id ? { ...u, ...patch } : u))
        const authUser = s.auth?.user
        const isCurrentUser = authUser?.id === id
        const auth = isCurrentUser && (patch.email !== undefined || patch.name !== undefined || patch.role !== undefined)
          ? { ...s.auth, user: {
            ...authUser,
            ...(patch.email !== undefined ? { email: patch.email } : {}),
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.role !== undefined ? { role: patch.role } : {}),
          } }
          : s.auth
        const safeUser = user => {
          if (!user) return user
          const { pw: _pw, ...withoutPassword } = user
          return withoutPassword
        }
        const safePatch = Object.fromEntries(Object.entries(patch || {}).map(([key, value]) => [key, key === 'pw' ? '[redacted]' : value]))
        return withAudit(
          { ...s, users, auth, role: isCurrentUser && patch.role !== undefined ? patch.role : s.role },
          'User updated', id,
          JSON.stringify({ before: safeUser(s.users.find(u => u.id === id)), patch: safePatch }))
      })
    },

    // Only used to reject a pending registration — active accounts are
    // suspended, never deleted.
    deleteUser(id) {
      setState(s => withAudit({ ...s, users: s.users.filter(u => u.id !== id) }, 'User removed', id, 'Pending registration rejected'))
    },

    // Approvers (LJS/AH) and admins set the FY numbers each owner is measured
    // against. Values are K₹, matching store.sales.targets.
    setSalesTarget(owner, { annual, q }) {
      setState(s => withAudit({
        ...s,
        sales: { ...s.sales, targets: { ...(s.sales?.targets || {}), [owner]: { annual, q } } },
      }, 'Sales target updated', owner, `annual ${annual}K · quarters ${q.join('/')}K`))
    },

    // Cosmetic only — deliberately not audited, toggling would flood the log.
    setTabletTheme(theme) {
      setState(s => ((theme === 'dark' || theme === 'light') ? { ...s, tabletTheme: theme } : s))
    },

    // ---- Lead inbox: "Show all" ------------------------------------------
    // Survives a reload so a lead routed to another owner cannot silently
    // disappear from the list that just created it.
    setInboxShowAll(on) {
      setState(s => ({ ...s, inboxShowAll: !!on }))
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
    recordDecision(id, { d, comment = '', commentReview = null }) {
      setState(s => {
        const appr = s.approvals.find(a => a.id === id)
        if (!appr) return s
        // The active approval workflow has only two outcomes. Historical
        // conditional/returned records remain readable but cannot be created.
        if (!['Approved', 'Rejected'].includes(d)) return s
        const needed = appr.needed || [appr.approver].filter(Boolean)
        // Guard at the model layer, not only in Approvals.canDecide. Keying by
        // persona alone let an ADMIN/SUPER decision land outside `needed`, and
        // `needed.every(...)` then never came true — stranding a joint gate at
        // Pending with no way back. Discard silently NO MORE: a System Owner
        // clicking Approve on an AH gate must at least see why nothing changed.
        if (needed.length && !needed.includes(s.role)) {
          console.warn(`Decision ignored: ${s.role} is not a required approver for "${appr.type}" (needs ${needed.join(' + ')})`)
          return s
        }
        const decisions = { ...(appr.decisions || {}), [s.role]: {
          d, c: comment, when: new Date().toISOString(), commentReview,
        } }
        // Sync stamp (see mergeApprovalRows): the decision must survive a
        // stale server snapshot on the next focus refetch.
        const syncStamp = new Date().toISOString()
        // Diagram 02 §5 names two approvers on some gates but only needs one of
        // them: 5A technical is "LJS *or* AN", and the "< ₹10 L & <= 50%" row of
        // the 5C margin matrix is "AH *or* LJS". `anyOf` marks those; every
        // other gate still needs a decision from each named role. A rejection
        // stays authoritative either way — one approver declining ends it
        // rather than sending the request round to the other.
        const allIn = appr.anyOf ? needed.some(r => decisions[r]) : needed.every(r => decisions[r])
        const anyRejected = Object.values(decisions).some(x => x.d === 'Rejected')
        const status = anyRejected ? 'Rejected'
          : !allIn ? 'Pending'
          : 'Approved'
        const decisionOpportunity = s.opportunities.find(o => o.id === appr.oppId)
        const decisionProposal = appr.oppId ? s.proposals[appr.oppId] : null
        const approvalSnapshot = appr.approvalSnapshot || (status === 'Approved' && decisionProposal
          ? proposalApprovalSnapshot(decisionProposal, decisionOpportunity)
          : null)
        let next = {
          ...s,
          approvals: s.approvals.map(a => a.id === id
            ? { ...a, decisions, status, __sv: syncStamp,
                ...(approvalSnapshot ? { approvalSnapshot } : {}),
                decisionTs: status === 'Pending' ? a.decisionTs : new Date().toISOString(),
                decisionNote: comment || a.decisionNote,
                ...(status === 'Rejected' ? {
                  rejectionActions: commentReview?.requiredActions?.length
                    ? commentReview.requiredActions
                    : [comment].filter(Boolean),
                  rejectionCommentReview: commentReview || null,
                } : {}) }
            : a),
        }
        if (status !== 'Pending') next = applyApprovalEffects(next, { ...appr, status, approvalSnapshot })
        return withAudit(next, `Approval ${d.toLowerCase()}`, id, comment)
      })
      // Decisions are coordination events, not ordinary draft edits.  Start
      // persistence on the next turn (after React has committed state) instead
      // of waiting for the normal 1.5s debounce; other devices pull the update
      // on their next route, focus, visibility, reconnect, or manual refresh.
      setTimeout(flushSaves, 0)
    },

    // ---- Customer KYC ------------------------------------------------------
    // `file` is optional: undefined leaves any attached document alone (the
    // simulate path), an object attaches one, null drops it (Reject). The bytes
    // themselves live in IndexedDB — this record is metadata only.
    cancelLeadKyc(leadId) {
      setState(s => {
        const lead = s.leads.find(l => l.id === leadId)
        if (!lead) return s
        const verification = lead.verification || {}
        const kyc = Object.fromEntries(Object.entries(verification.kyc || {})
          .map(([name, item]) => [name, { ...item, state: 'Missing', mode: '', verifiedAt: '' }]))
        return withAudit({
          ...s,
          leads: s.leads.map(l => l.id === leadId ? {
            ...l,
            kycCompletedAt: null,
            verification: { ...verification, kycRequestStatus: 'cancelled', kycVerifiedAt: '', kyc },
          } : l),
        }, 'KYC request cancelled', leadId)
      })
    },
    reopenLeadKyc(leadId) {
      setState(s => {
        const lead = s.leads.find(l => l.id === leadId)
        if (!lead) return s
        const verification = lead.verification || {}
        return withAudit({
          ...s,
          leads: s.leads.map(l => l.id === leadId ? {
            ...l,
            verification: { ...verification, kycRequestStatus: 'pending' },
          } : l),
        }, 'KYC request reopened', leadId)
      })
    },
    clearLeadKycItem(leadId, itemName) {
      setState(s => {
        const lead = s.leads.find(l => l.id === leadId)
        if (!lead || !itemName) return s
        const verification = lead.verification || {}
        const current = verification.kyc?.[itemName]
        if (!current || !['Approved', 'Verified', 'Rejected', 'Pending Review'].includes(current.state)) return s
        const kyc = {
          ...(verification.kyc || {}),
          [itemName]: { ...current, state: 'Missing', mode: '', file: '', size: '', pages: 0, verifiedAt: '' },
        }
        const complete = Object.values(kyc).length > 0 && Object.values(kyc).every(item => ['Approved', 'Verified'].includes(item.state))
        const attachments = (lead.attachments || []).filter(file => file.kycItem !== itemName)
        const next = {
          ...s,
          leads: s.leads.map(l => l.id === leadId ? {
            ...l,
            attachments,
            kycCompletedAt: complete ? (verification.kycVerifiedAt || l.kycCompletedAt || '') : '',
            verification: {
              ...verification,
              kyc,
              kycVerifiedAt: complete ? verification.kycVerifiedAt : '',
              kycRequestStatus: 'pending',
            },
          } : l),
        }
        return withAudit(next, 'KYC document cancelled', leadId, itemName)
      })
    },
    reviewLeadKycItem(leadId, itemName, state, details = {}) {
      const allowed = new Set(['Approved', 'Rejected', 'Pending Review'])
      if (!allowed.has(state) || !itemName) return
      setState(s => {
        const lead = s.leads.find(l => l.id === leadId)
        if (!lead) return s
        const verification = lead.verification || {}
        const current = verification.kyc?.[itemName]
        if (!current) return s
        const kyc = {
          ...(verification.kyc || {}),
          [itemName]: {
            ...current,
            state,
            reviewedAt: nowIST(),
            reviewedBy: s.role,
            ...(state === 'Rejected' ? { rejectionReason: String(details.reason || '').trim() } : { rejectionReason: '' }),
          },
        }
        const complete = Object.values(kyc).length > 0 && Object.values(kyc).every(item => ['Approved', 'Verified'].includes(item.state))
        const next = {
          ...s,
          leads: s.leads.map(l => l.id === leadId ? {
            ...l,
            kycCompletedAt: complete ? (verification.kycVerifiedAt || nowIST()) : null,
            verification: {
              ...verification,
              kyc,
              kycVerifiedAt: complete ? (verification.kycVerifiedAt || nowIST()) : '',
              kycRequestStatus: 'pending',
            },
          } : l),
        }
        return withAudit(next, `KYC document ${state.toLowerCase()}`, leadId,
          `${itemName}${state === 'Rejected' ? ` — ${String(details.reason || '').trim()}` : ''}`)
      })
    },
    setKycState(customerName, itemName, state, file, mode = '') {
      setState(s => {
        const items = (s.kyc[customerName] || (s.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' })))
          .map(k => (k.name === itemName
            ? { ...k, state, when: new Date().toISOString().slice(0, 10), ...(file === undefined ? {} : { file: file || undefined }), ...(mode ? { mode } : {}) }
            : k))
        const complete = items.length > 0 && items.every(k => k.state === 'Verified')
        const next = {
          ...s,
          kyc: { ...s.kyc, [customerName]: items },
          customers: s.customers.map(c => (c.name === customerName
            ? { ...c, kyc: complete ? 'Valid' : 'Pending' }
            : c)),
          leads: s.leads.map(l => (l.sellTo === customerName || l.customerName === customerName
            ? { ...l, ...(complete ? { kycCompletedAt: new Date().toISOString() } : { kycCompletedAt: null }) }
            : l)),
        }
        return withAudit(next, `KYC ${state.toLowerCase()}`, customerName, file ? `${itemName} — ${file.name}` : itemName)
      })
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
        if (!row?.oppId || !String(row.q || '').trim()) return s
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

    stageClarificationAnswer(id, { response, answerSource = '', answeredAt = '', attachments = [], evidence = '', aiConfidence = null, status = 'Needs review', missing = '', fieldSuggestion = null }) {
      setState(s => withAudit({
        ...s,
        clarifications: s.clarifications.map(c => (c.id === id ? {
          ...c,
          response,
          answerSource,
          answeredAt: answeredAt || new Date().toISOString().slice(0, 10),
          answeredBy: s.role,
          ...(evidence ? { answerEvidence: evidence } : {}),
          ...(aiConfidence !== null && aiConfidence !== undefined ? { aiConfidence } : {}),
          ...(fieldSuggestion ? { aiFieldSuggestion: fieldSuggestion } : {}),
          ...(missing ? { missing } : { missing: '' }),
          attachments: [...(c.attachments || []), ...attachments],
          status: status === 'Answered' && !fieldSuggestion ? 'Answered' : 'Needs review',
        } : c)),
      }, 'Clarification answer staged for salesperson review', id, response))
    },

    confirmClarificationField(id, { field, value }) {
      if (!CLARIFICATION_FIELD_KEYS.has(field) || !String(value || '').trim()) return false
      setState(s => {
        const target = s.clarifications.find(c => c.id === id)
        if (!target) return s
        const nextValue = String(value).trim()
        return withAudit({
          ...s,
          opportunities: s.opportunities.map(o => (o.id === target.oppId ? { ...o, [field]: nextValue } : o)),
          clarifications: s.clarifications.map(c => (c.id === id ? {
            ...c,
            field,
            fieldValue: nextValue,
            fieldConfirmedBy: s.role,
            fieldConfirmedAt: new Date().toISOString(),
            status: 'Answered',
            aiFieldSuggestion: null,
            missing: '',
          } : c)),
        }, 'AI clarification field update confirmed', id, `${field} = ${nextValue}`)
      })
      return true
    },

    rejectClarificationField(id) {
      setState(s => withAudit({
        ...s,
        clarifications: s.clarifications.map(c => (c.id === id ? {
          ...c,
          status: c.response?.trim() ? 'Answered' : 'Needs review',
          aiFieldSuggestion: null,
        } : c)),
      }, 'AI clarification field update rejected', id))
    },

    answerClarification(id, { response, answerSource = '', answeredAt = '', attachments = [], evidence = '', aiConfidence = null, status = 'Answered', missing = '' }) {
      setState(s => {
        const target = s.clarifications.find(c => c.id === id)
        const resolvedStatus = status === 'Needs review' ? 'Needs review' : 'Answered'
        // A clarification can be tagged with the Opportunity Details field it
        // answers (see the "Updates field" picker in ClarificationsTab). Once
        // it resolves to Answered with real text, apply that answer straight
        // to the opportunity — that field is otherwise locked after Intake.
        const fieldPatch = target?.field && resolvedStatus === 'Answered' && response.trim()
          ? { opportunities: s.opportunities.map(o => (o.id === target.oppId ? { ...o, [target.field]: response.trim() } : o)) }
          : {}
        return withAudit({
          ...s,
          clarifications: s.clarifications.map(c => (c.id === id ? {
            ...c,
             response,
             answerSource,
             answeredAt: answeredAt || new Date().toISOString().slice(0, 10),
             answeredBy: s.role,
             ...(evidence ? { answerEvidence: evidence } : {}),
             ...(aiConfidence !== null && aiConfidence !== undefined ? { aiConfidence } : {}),
             ...(missing ? { missing } : { missing: '' }),
             attachments: [...(c.attachments || []), ...attachments],
            status: resolvedStatus,
          } : c)),
          ...fieldPatch,
        }, resolvedStatus === 'Needs review' ? 'Clarification marked needs review' : 'Clarification answered', id, response)
      })
    },

    syncClarificationSpares(oppId, clarificationId, requested, { answeredAt = '', answerSource = '' } = {}) {
      if (!oppId || !Array.isArray(requested) || !requested.length) return { changes: [], unmatched: [] }
      let report = { changes: [], unmatched: [] }
      setState(s => {
        const current = s.sparesLines.filter(line => line.oppId === oppId)
        const result = reconcileSparesLines(current, requested, {
          priceLists: s.priceLists,
          clarificationId,
          answeredAt,
          answerSource,
        })
        report = { changes: result.changes, unmatched: result.unmatched }
        if (!result.changes.length) return s
        const byId = new Map(result.lines.map(line => [line.id, line]))
        const nextLines = s.sparesLines
          .filter(line => line.oppId !== oppId || byId.has(line.id))
          .map(line => byId.get(line.id) || line)
        const added = result.lines.filter(line => !line.id)
        const withIds = added.map(line => normalizePriceFields({ ...line, id: mintId('SL', [...nextLines, ...added]), oppId }))
        return withAudit({ ...s, sparesLines: [...nextLines, ...withIds] }, 'Customer clarification synced to sourcing', oppId,
          `${result.changes.length} line change(s)${result.unmatched.length ? `; review ${result.unmatched.length} existing line(s)` : ''}`)
      })
      return report
    },

    // ---- Manufacturer / vendor quotes --------------------------------------
    addVendorQuote(oppId, quote) {
      setState(s => {
        const id = mintId('VQ', s.vendorQuotes || [])
        return withAudit({
          ...s,
          vendorQuotes: [{
            id, oppId, status: 'Sent', sentAt: new Date().toISOString(), attachments: [], prices: [], ...quote,
          }, ...(s.vendorQuotes || [])],
        }, 'Vendor RFQ sent', id, quote.subject || quote.manufacturer || oppId)
      })
    },

    updateVendorQuote(id, patch) {
      setState(s => withAudit({
        ...s,
        vendorQuotes: (s.vendorQuotes || []).map(q => (q.id === id ? { ...q, ...patch } : q)),
      }, patch.status ? `Vendor quote ${String(patch.status).toLowerCase()}` : 'Vendor quote updated', id))
    },

    attachVendorQuoteFile(id, file) {
      setState(s => withAudit({
        ...s,
        vendorQuotes: (s.vendorQuotes || []).map(q => (q.id === id ? {
          ...q,
          attachments: [file, ...(q.attachments || [])],
          status: q.status === 'Sent' ? 'Received' : q.status,
          receivedAt: q.receivedAt || new Date().toISOString().slice(0, 10),
        } : q)),
      }, 'Vendor quote file attached', id, file?.name || 'file'))
    },

    applyVendorQuoteToLine(id, lineId, price) {
      setState(s => {
        const quote = (s.vendorQuotes || []).find(q => q.id === id)
        const currentLine = s.sparesLines.find(l => l.id === lineId)
        const quotePrice = price?.unitPrice
        const hasReplacementPrice = quotePrice !== '' && quotePrice != null && Number.isFinite(Number(quotePrice))
        const unitPrice = hasReplacementPrice
          ? Number(quotePrice)
          : Number(currentLine?.listUnitPrice ?? currentLine?.listPrice) || 0
        const hasPositiveQuotePrice = hasReplacementPrice && unitPrice > 0
        const label = `Manufacturer quote - ${price?.manufacturer || quote?.manufacturer || 'Vendor'}`
        return withAudit({
          ...s,
          vendorQuotes: (s.vendorQuotes || []).map(q => (q.id === id ? {
            ...q,
            status: 'Applied',
            receivedAt: q.receivedAt || new Date().toISOString().slice(0, 10),
            prices: [{ lineId, ...(price || {}), appliedAt: new Date().toISOString() }, ...(q.prices || [])],
          } : q)),
          sparesLines: s.sparesLines.map(l => (l.id === lineId ? {
            ...l,
            listPrice: unitPrice,
            currency: price?.currency || l.currency || 'INR',
            leadTime: price?.leadTime || l.leadTime || '',
            priceList: label,
            priceSource: PRICE_SOURCES.VENDOR,
            priceSourceName: price?.manufacturer || quote?.manufacturer || 'Vendor',
            priceSourceRef: price?.quoteRef || quote?.quoteRef || quote?.id || '',
            priceSourceDate: new Date().toISOString().slice(0, 10),
            listUnitPrice: unitPrice,
            priceState: hasPositiveQuotePrice ? 'Current' : 'Needs pricing',
            oem: price?.manufacturer || quote?.manufacturer || l.oem,
            quoteRef: price?.quoteRef || quote?.subject || quote?.id,
            confirmed: false,
          } : l)).map(line => {
            if (line.id !== lineId) return line
            const normalized = normalizePriceFields(line)
            return { ...normalized, confirmed: hasPositiveQuotePrice && isConfirmableSparesLine(normalized) }
          }),
        }, 'Vendor quote applied', id, `${lineId} ${price?.unitPrice || ''} ${price?.currency || ''}`)
      })
    },

    // ---- Spares workbench --------------------------------------------------
    updateSparesLine(id, patch) {
      setState(s => {
        const current = s.sparesLines.find(l => l.id === id)
        if (!current) return s
        const updated = normalizePriceFields({ ...current, ...(patch || {}) })
        const changed = Object.keys(updated).filter(key => updated[key] !== current[key])
        if (!changed.length) return s
        const detail = changed.map(key => `${key}: ${String(current[key] ?? '')} -> ${String(updated[key] ?? '')}`).join('; ')
        const next = { ...s, sparesLines: s.sparesLines.map(l => (l.id === id ? updated : l)) }
        return withAudit(next, 'Spares line updated', current.oppId, `${id} — ${detail}`)
      })
    },
    addSparesLine(oppId, line) {
      setState(s => {
        const id = mintId('SL', s.sparesLines)
        return withAudit({
          ...s,
          sparesLines: [...s.sparesLines, normalizePriceFields({
            id, oppId, match: 'Manual', conf: 100, confirmed: true,
            origin: 'manual', priceList: 'Ad-hoc', priceState: 'Current', currency: 'INR', qty: 1, ...line,
          })],
        }, 'Manual part added', oppId, line.pn || line.desc)
      })
    },
    ensureSparesSupportLines(oppId) {
      // Compatibility no-op: optional support rows are created only through
      // an explicit manual add action.
      return oppId
    },
    dedupeSparesLines(oppId) {
      setState(s => {
        const byKey = new Map()
        const order = []
        let duplicateCount = 0
        const canonical = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
        const preference = line => {
          const customerRef = canonical(line.custRef || line.customerReference)
          const part = canonical(line.pn)
          const isCustomerPart = customerRef && part && customerRef === part
          const isSuggestion = Boolean(line.priceSourceSuggested) || /^suggested/i.test(String(line.match || ''))
          return (line.confirmed ? 100 : 0) + (isCustomerPart ? 40 : 0) - (isSuggestion ? 30 : 0)
        }
        s.sparesLines.filter(line => line.oppId === oppId).forEach(line => {
          const identity = line.sparesSupport
            ? `support:${String(line.desc || '').trim().toLowerCase()}`
            : String(line.custRef || line.customerReference || line.pn || '').trim()
              ? `ref:${canonical(line.custRef || line.customerReference || line.pn)}`
              : `desc:${String(line.desc || '').trim().toLowerCase()}`
          const current = byKey.get(identity)
          if (!current) {
            byKey.set(identity, line)
            order.push(identity)
            return
          }
          duplicateCount += 1
          const currentPrice = Number(current.listUnitPrice ?? current.listPrice) || 0
          const nextPrice = Number(line.listUnitPrice ?? line.listPrice) || 0
          const winner = preference(line) > preference(current) || (preference(line) === preference(current) && nextPrice > currentPrice) ? line : current
          byKey.set(identity, { ...winner, qty: Math.max(Number(current.qty) || 0, Number(line.qty) || 0) })
        })
        if (!duplicateCount) return s
        const nextLines = s.sparesLines.filter(line => line.oppId !== oppId)
        return withAudit({ ...s, sparesLines: [...nextLines, ...order.map(identity => byKey.get(identity))] }, 'Duplicate spares lines removed', oppId, `${duplicateCount} duplicate line(s)`)
      })
    },
    addSparesLinesFromLead(oppId, rows, { auditAction = 'Lead lines imported' } = {}) {
      setState(s => {
        const existing = s.sparesLines.filter(l => l.oppId === oppId)
        const key = l => `${String(l.pn || l.custRef || '').toUpperCase()}|${String(l.desc || '').toLowerCase()}`
        const seen = new Set(existing.map(key))
        const additions = []
        rows.filter(Boolean).filter(row => {
          const k = key(row)
          if (seen.has(k)) return false
          seen.add(k)
          return true
        }).forEach(row => {
          additions.push(normalizePriceFields({
          id: mintId('SL', [...s.sparesLines, ...additions]), oppId,
          match: row.match || 'AI suggested', conf: Number(row.conf) || 0,
          confirmed: !!row.confirmed, priceList: row.priceList || 'Ad-hoc',
          priceState: row.priceState || 'Current', currency: row.currency || 'INR',
          qty: Number(row.qty) || 1, uom: row.uom || 'EA', ...row,
          }))
        })
        if (!additions.length) return s
        return withAudit({ ...s, sparesLines: [...s.sparesLines, ...additions] }, auditAction, oppId, `${additions.length} line(s)`)
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
          ? normalizePriceFields({ ...l, priceList: 'BNK 2026-Q2', priceState: 'Current', listPrice: Math.round(l.listPrice * 1.04), listUnitPrice: Math.round((l.listUnitPrice ?? l.listPrice) * 1.04), priceSource: PRICE_SOURCES.LIST, priceSourceName: 'BNK', priceSourceVersion: '2026-Q2' })
          : l)),
      }, 'Price source refreshed', id, 'BNK 2026-Q2 (+4% list)'))
    },
    // Synchronize confirmed spares lines into the proposal workbook BoM. The
    // sourcing workbench is authoritative for Spares proposals, so stale lead
    // extraction rows must not remain alongside the confirmed matches.
    sendLinesToProposal(oppId) {
      setState(s => {
        const sourceLines = s.sparesLines.filter(l => l.oppId === oppId
          && !l.removedFromSourcing
          && !isPlaceholderSparesLine(l)
          && !isLegacyAutoSparesSupportRow(l)
          && (l.confirmed && Number(l.qty) > 0 || isSparesSupportRow(l)))
        const lines = s.sparesLines.filter(l => l.oppId === oppId && l.confirmed)
        const pricedLinesSource = sourceLines.filter(l => l.confirmed && Number(l.qty) > 0)
        const orderedSourceLines = sourceLines.filter(l => l.origin !== 'proposal-support')
        const opp = s.opportunities.find(o => o.id === oppId)
        const base = s.proposals[oppId] || newProposal(oppId, opp, {
          validityDays: s.config?.proposalValidityDays,
          currencyRates: s.config?.currencyRates,
          costingDefaults: s.config?.costingDefaults,
        })
        if (!orderedSourceLines.length) {
          if (!(base.bom || []).length) return s
          return withAudit({
            ...s,
            proposals: { ...s.proposals, [oppId]: { ...base, bom: [] } },
          }, 'Lines sent to proposal', oppId, '0 line(s) synchronized')
        }
        const costing = {
          ...(base.costing || {}),
          currencyRates: normalizedCurrencyRates(base.costing?.currencyRates || s.config?.currencyRates),
        }
        const bom = orderedSparesProposalBom(orderedSourceLines, s.priceLists, costing)
        const pricedLines = pricedLinesSource.reduce((totals, line) => {
          const financials = sparesLineFinancials(line, costing)
          return {
            value: totals.value + financials.lineTotalINR,
            cogs: totals.cogs + financials.cogsINR,
          }
        }, { value: 0, cogs: 0 })
        return withAudit({
          ...s,
          opportunities: s.opportunities.map(item => item.id === oppId ? {
            ...item,
            valueK: Math.round(pricedLines.value / 1000),
            cogsK: Math.round(pricedLines.cogs / 1000),
          } : item),
          proposals: { ...s.proposals, [oppId]: { ...base, costing, bom } },
        }, 'Lines sent to proposal', oppId, `${bom.length} line(s) synchronized`)
        // proposals: { ...s.proposals, [oppId]: { ...base, bom } }
      })
    },

    // ---- Service workbench -------------------------------------------------
    // Service day rates are commercial reference data — an FY revision has to
    // leave a trail, so this is audited like any other gated change.
    updateRateSheets(sheet, patch) {
      setState(s => withAudit({
        ...s,
        rateSheets: {
          ...s.rateSheets,
          [sheet]: {
            ...s.rateSheets[sheet],
            ...patch,
            rates: { ...s.rateSheets[sheet].rates, ...(patch.rates || {}) },
          },
        },
      }, 'Service rate sheet updated', sheet, Object.keys(patch.rates || patch).join(', ')))
    },

    updateSvcEstimate(oppId, patch) {
      setState(s => {
        const has = s.svcEstimates.some(e => e.oppId === oppId)
        return {
          ...s,
          svcEstimates: has
            ? s.svcEstimates.map(e => (e.oppId === oppId ? { ...e, ...patch } : e))
            : [...s.svcEstimates, { oppId, workDays: 1, travelDays: 1, dailyHours: 8, otHours: 0, weekendDays: 0, standbyDays: 0, engineer: '', mobilisation: '', toolsCerts: '', travelConfirmed: false, ...patch }],
        }
      })
    },
    updateServiceFlow(oppId, patch) {
      setState(s => {
        const current = s.svcEstimates.find(e => e.oppId === oppId) || { oppId }
        const nextEstimate = { ...current, ...patch }
        return withAudit({
          ...s,
          svcEstimates: s.svcEstimates.some(e => e.oppId === oppId)
            ? s.svcEstimates.map(e => (e.oppId === oppId ? nextEstimate : e))
            : [...s.svcEstimates, nextEstimate],
        }, 'Service flow updated', oppId, Object.keys(patch).join(', '))
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
        const today = nowIST().slice(0, 10)
        return withAudit({
          ...s,
          handover: { ...s.handover, [oppId]: { ...s.handover[oppId], approved: true, approvedBy: s.role, approvedOn: today } },
          opportunities: s.opportunities.map(o => (o.id === oppId
            ? { ...o, stage: 'Won', status: 'Closed', milestone: 'Handover', orderDate: o.orderDate || today, lastUpdated: today }
            : o)),
        }, 'Handover approved', oppId, s.role)
      })
    },

    setMilestone(oppId, milestone, reason = '', { alreadyGated = false } = {}) {
      const before = stateRef.current.opportunities.find(o => o.id === oppId)
      if (!before) return false
      if (!alreadyGated) {
        const currentIndex = MILESTONES.indexOf(before.milestone)
        const targetIndex = MILESTONES.indexOf(milestone)
        if (targetIndex >= 0 && currentIndex >= 0 && targetIndex < currentIndex && !reason.trim()) return false
        if (targetIndex > currentIndex && transitionBlockers(before, milestone, stateRef.current.proposals?.[oppId], stateRef.current).length) return false
      }
      const today = nowIST().slice(0, 10)
      setState(s => withAudit({
        ...s,
        opportunities: s.opportunities.map(o => (o.id === oppId ? { ...o, milestone, lastUpdated: today } : o)),
      }, 'Milestone moved', oppId, reason ? `${milestone} — ${reason}` : milestone))
      return true
    },

    // ---- Admin config ------------------------------------------------------
    updateConfig(patch) {
      setState(s => {
        const nextConfig = { ...s.config, ...patch }
        return withAudit({ ...s, config: nextConfig }, 'Config updated', 'admin',
          JSON.stringify({ fields: Object.keys(patch), before: Object.fromEntries(Object.keys(patch).map(k => [k, s.config?.[k]])), after: patch }))
      })
    },
    saveClause(clause) {
      if (!clause?.id || !ROLES[stateRef.current.role]?.admin) return
      setState(s => withAudit({ ...s, config: { ...s.config, clauses: [...(s.config.clauses || []), clause] } }, 'T&C clause added', clause.id, clause.label))
    },
    updateClause(id, patch) {
      if (!id || !ROLES[stateRef.current.role]?.admin) return
      setState(s => withAudit({ ...s, config: { ...s.config, clauses: (s.config.clauses || []).map(c => c.id === id ? { ...c, ...patch } : c) } }, 'T&C clause updated', id, patch.label || patch.text || ''))
    },
    removeClause(id) {
      if (!id || !ROLES[stateRef.current.role]?.admin) return
      setState(s => withAudit({ ...s, config: { ...s.config, clauses: (s.config.clauses || []).filter(c => c.id !== id) } }, 'T&C clause removed', id, ''))
    },
    updateRoleNames(roleNames) {
      setState(s => {
        if (!ROLES[s.role]?.admin) return s
        const defaults = Object.fromEntries(Object.entries(ROLES).map(([id, role]) => [id, role.name]))
        const nextNames = { ...defaults, ...(roleNames || {}) }
        const changed = Object.keys(defaults).filter(id => nextNames[id] !== (s.config?.roleNames?.[id] || defaults[id]))
        if (!changed.length) return s
        const detail = JSON.stringify({ changed: Object.fromEntries(changed.map(id => [id, {
          from: s.config?.roleNames?.[id] || defaults[id], to: nextNames[id],
        }])) })
        return withAudit({ ...s, config: { ...s.config, roleNames: nextNames } }, 'Role names changed', 'roleNames', detail)
      })
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
            : kind === 'datasheets'
              ? { ...s.config.uploads, datasheets: [{ ...meta, uploaded: new Date().toISOString().slice(0, 10) }, ...(s.config.uploads.datasheets || [])] }
            : { ...s.config.uploads, [kind]: { ...meta, uploaded: new Date().toISOString().slice(0, 10) } },
        },
      }, 'Admin document uploaded', kind, meta.name))
    },
    saveKycTemplate(itemName, meta) {
      if (!itemName || !meta) return
      setState(s => withAudit({
        ...s,
        config: {
          ...s.config,
          uploads: {
            ...s.config.uploads,
            kycTemplates: {
              ...(s.config.uploads?.kycTemplates || {}),
              [itemName]: { ...meta, uploaded: new Date().toISOString().slice(0, 10) },
            },
          },
        },
      }, 'KYC template updated', itemName, meta.name))
    },
    replacePriceList(name, catalog, meta = {}) {
      setState(s => {
        if (!canManagePriceLists(s.role)) return s
        const current = s.priceLists?.[name] || {
          version: 'Initial', currency: catalog.currency || meta.currency || 'INR', uploaded: '', parts: [], versions: [], activeVersionId: '',
        }
        const requestedVersion = meta.version || `Revision ${current.versions?.length + 1 || 1}`
        const duplicateCount = (current.versions || []).filter(item => item.version === requestedVersion).length
        const version = duplicateCount ? `${requestedVersion} (${duplicateCount + 1})` : requestedVersion
        const id = `${name}-${Date.now()}`
        const snapshot = {
          id, version, currency: meta.currency || catalog.currency || current.currency,
          uploaded: new Date().toISOString().slice(0, 10),
          filename: meta.filename || '', parts: catalog.parts,
        }
        const nextList = {
          ...current,
          parts: catalog.parts,
          currency: snapshot.currency, version: snapshot.version,
          uploaded: snapshot.uploaded, versions: [...(current.versions || []), snapshot], activeVersionId: id,
        }
        const uploads = s.config?.uploads || {}
        const priceUploads = uploads.priceLists || []
        const history = priceUploads.map(item => item.supplier === name || item.list === name
          ? { ...item, status: item.status === 'Current' ? 'Archived' : item.status }
          : item)
        return withAudit({
          ...s,
          priceLists: { ...s.priceLists, [name]: nextList },
          config: {
            ...s.config,
            uploads: {
              ...uploads,
              priceLists: [{ supplier: name, list: name, name: meta.filename || `${name} price list`, version: nextList.version, status: 'Current', uploaded: nextList.uploaded }, ...history],
            },
          },
        }, 'Price list replaced', name, `${catalog.parts.length} parts · version ${nextList.version}`)
      })
    },
    savePriceListVersion(name, baseVersionId, parts, meta = {}) {
      setState(s => {
        if (!canManagePriceLists(s.role)) return s
        const current = s.priceLists?.[name]
        if (!current) return s
        const requestedVersion = meta.version || `Revision ${(current.versions || []).length + 1}`
        const duplicateCount = (current.versions || []).filter(item => item.version === requestedVersion).length
        const version = duplicateCount ? `${requestedVersion} (${duplicateCount + 1})` : requestedVersion
        const id = `${name}-${Date.now()}`
        const snapshot = {
          id, version, currency: meta.currency || current.currency,
          uploaded: new Date().toISOString().slice(0, 10), filename: meta.filename || '',
          basedOn: baseVersionId || current.activeVersionId || '', parts,
        }
        return withAudit({
          ...s,
          priceLists: { ...s.priceLists, [name]: { ...current, parts, currency: snapshot.currency, version, uploaded: snapshot.uploaded, versions: [...(current.versions || []), snapshot], activeVersionId: id } },
        }, 'Price list version saved', name, `${parts.length} parts · version ${version}`)
      })
    },
    updateCurrencyRate(currency, value) {
      setState(s => {
        if (!canManagePriceLists(s.role)) return s
        const code = String(currency || '').trim().toUpperCase()
        const rate = Number(value)
        if (!code || code === 'INR' || !Number.isFinite(rate) || rate <= 0) return s
        const currencyRates = { ...(s.config?.currencyRates || {}), [code]: rate, INR: 1 }
        return withAudit({
          ...s,
          config: { ...s.config, currencyRates },
        }, 'Currency conversion rate updated', code, `1 ${code} = ₹${rate}`)
      })
    },
    restorePriceListVersion(name, versionId) {
      setState(s => {
        if (!canManagePriceLists(s.role)) return s
        const current = s.priceLists?.[name]
        const version = current?.versions?.find(item => item.id === versionId)
        if (!current || !version) return s
        return withAudit({
          ...s,
          priceLists: { ...s.priceLists, [name]: { ...current, parts: version.parts, currency: version.currency, version: version.version, uploaded: version.uploaded, activeVersionId: version.id } },
        }, 'Price list version restored', name, version.version)
      })
    },
    saveProposalTemplate(template) {
      setState(s => {
        const existing = s.config?.uploads?.proposalTemplates || []
        const archived = existing.map(item => item.lane === template.lane && item.status === 'Current'
          ? { ...item, status: 'Archived' }
          : item)
        return withAudit({
          ...s,
          config: {
            ...s.config,
            uploads: { ...s.config.uploads, proposalTemplates: [{ ...template, status: 'Current' }, ...archived] },
          },
        }, 'Proposal template updated', template.lane, template.name)
      })
    },
    setConnectorState(id, stateVal) {
      setState(s => withAudit({
        ...s,
        config: { ...s.config, connectors: s.config.connectors.map(c => (c.id === id ? { ...c, state: stateVal } : c)) },
      }, 'Connector state updated', id, `${s.config?.connectors?.find(c => c.id === id)?.state || '—'} → ${stateVal}`))
    },

    // ---- SharePoint sync bookkeeping --------------------------------------
    setSpSync(oppId, patch) {
      setState(s => ({ ...s, spSync: { ...s.spSync, [oppId]: { ...(s.spSync[oppId] || {}), ...patch, ts: new Date().toISOString() } } }))
    },

    async refreshSharedData() {
      if (!datastore.dbEnabled()) return false
      const res = await datastore.loadAll({ force: true })
      if (!res) { setLiveSyncStatus('error'); return false }
      if (res.diagnostics) setSyncDiagnostics(res.diagnostics)
      if (res.error) { setLiveSyncStatus('error'); return false }
      if (res.empty) { setLiveSyncStatus('degraded'); return false }
      setLiveSyncStatus('live')
      applyServer(res.slices, res.diagnostics)
      return true
    },

    async recoverOpportunity(id) {
      if (!datastore.dbEnabled() || !id) return false
      try {
        const opportunity = await datastore.loadOpportunity(id)
        if (!opportunity) return false
        setState(s => {
          if (s.opportunities.some(item => item.id === id)) return s
          return {
            ...s,
            opportunities: [...s.opportunities, opportunity],
            opportunitySyncBaseline: [...(s.opportunitySyncBaseline || []), opportunity],
            pendingOpportunitySyncIds: (s.pendingOpportunitySyncIds || []).filter(itemId => itemId !== id),
          }
        })
        return true
      } catch (e) {
        setLiveSyncStatus('error')
        console.warn('Opportunity recovery failed:', e?.message || e)
        return false
      }
    },

    // ---- Auth (demo login — plaintext by design, disclaimed on screen) ----
    login(email, pw) {
      const s = stateRef.current
      const u = s.users.find(x => x.email.toLowerCase() === email.trim().toLowerCase())
      if (!u) return { ok: false, err: 'No account with that email.' }
      if (u.status === 'Pending') return { ok: false, err: 'Account awaiting super-admin approval.' }
      if (u.status === 'Suspended') return { ok: false, err: 'Account suspended — contact the administrator.' }
      // The portal is parked (seed.js PORTAL_ENABLED). A customer account has
      // nowhere to land while it is off, so refuse the sign-in rather than
      // dropping them into an app with no pages.
      if (u.role === 'CUST' && !PORTAL_ENABLED) {
        return { ok: false, err: 'The customer portal is unavailable at the moment.' }
      }
      if (u.pw !== pw) return { ok: false, err: 'Incorrect password.' }
      setState(st => ({
        ...withAudit(st, 'Signed in', u.email),
        auth: { user: { id: u.id, name: u.name, email: u.email, role: u.role } },
        role: ROLES[u.role] ? u.role : st.role,
      }))
      return { ok: true }
    },
    loginExternal(user, fallbackRole = 'RS') {
      if (!user?.id || !user.email) return { ok: false, err: 'Supabase did not return a valid user.' }
      const local = stateRef.current.users.find(item => item.email.toLowerCase() === user.email.toLowerCase())
      const role = local?.role || user.user_metadata?.role || fallbackRole
      setState(st => ({
        ...withAudit(st, 'Signed in', user.email),
        auth: { user: { id: user.id, name: local?.name || user.user_metadata?.name || user.email, email: user.email, role } },
        role: ROLES[role] ? role : st.role,
      }))
      return { ok: true }
    },
    logout() {
      if (supabase) {
        // The app auth state is local-only, but the Supabase session must also
        // be cleared or the next boot will immediately restore the account.
        supabase.auth.signOut().catch(e => {
          console.warn('Supabase sign-out failed:', e?.message || e)
        })
      }
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

    // Drop the saved state entirely — initialState() then rebuilds from
    // seedState(), which carries demoData: true, so this doubles as "bring the
    // demo data back" once clearDemo has removed it.
    async restoreDemo() {
      const next = withAudit({ ...seedState(), audit: stateRef.current.audit || [] }, 'Demo data restored', 'demo', 'Seed business records restored; audit history retained')
      if (datastore.dbEnabled()) {
        try { await datastore.resetAll(syncedOf(next)) }
        catch (e) { console.warn('Supabase reset failed — server data left as-is:', e?.message) }
      }
      if (datastore.dbEnabled()) {
        try { await deleteDemoUserFiles() }
        catch (e) { console.warn('Supabase demo file cleanup failed:', e?.message) }
      }
      // Lead file blobs live in IndexedDB, outside the localStorage snapshot.
      try { await leadBlobs.clearAll() }
      catch (e) { console.warn('Lead file store reset failed:', e?.message) }
      persistLocalSnapshot(next)
      window.location.reload()
    },
    // The original name of the action above — kept so existing callers and the
    // manual smoke checklist keep working.
    async resetDemo() { return api.restoreDemo() },

    // Empty the app: every business record goes, logins and configuration stay.
    async clearDemo() {
      // Preserve the audit history and append the cleanup action itself. The
      // audit trail is never part of demo data and is never cleared here.
      const next = withAudit(emptyState(stateRef.current), 'Demo data cleared', 'demo', 'Business records removed; audit history retained')
      if (datastore.dbEnabled()) {
        try { await datastore.resetAll(syncedOf(next)) }
        catch (e) { console.warn('Supabase clear failed — server data left as-is:', e?.message) }
      }
      if (datastore.dbEnabled()) {
        try { await deleteDemoUserFiles() }
        catch (e) { console.warn('Supabase demo file cleanup failed:', e?.message) }
      }
      try { await leadBlobs.clearAll() }
      catch (e) { console.warn('Lead file store clear failed:', e?.message) }
      // Written, not removed: an absent key sends initialState() back to the
      // seeds, which is the opposite of what this action means.
      persistLocalSnapshot(next)
      window.location.reload()
    },
  }

  // Supabase persists its browser session independently from the app store.
  // Rehydrate the app-specific identity on boot so a page refresh does not
  // send an otherwise valid Supabase user back to the login screen.
  useEffect(() => {
    if (!supabase) return
    let active = true
    const SESSION_RESTORE_TIMEOUT_MS = 8000

    const restoreSession = async () => {
      const applySession = ({ data, error }) => {
        if (!active || error) return
        if (data?.session?.user) {
          const current = stateRef.current.auth?.user
          if (!current || current.email?.toLowerCase() !== data.session.user.email?.toLowerCase()) {
            api.loginExternal(data.session.user)
          }
        } else if (stateRef.current.auth?.user) {
          setState(st => ({ ...st, auth: { user: null } }))
        }
      }
      const sessionRequest = supabase.auth.getSession()
      try {
        const result = await Promise.race([
          sessionRequest,
          new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), SESSION_RESTORE_TIMEOUT_MS)),
        ])
        if (result?.timedOut) {
          // Do not keep the entire application behind a loading screen when a
          // network/session read stalls. Apply the result if it arrives later.
          console.warn('Supabase session restore timed out; continuing to the sign-in screen.')
          setSyncDiagnostics(diagnostics => ({ ...diagnostics, authRestoreTimedOutAt: new Date().toISOString() }))
          sessionRequest.then(applySession).catch(e => console.warn('Supabase session restore failed:', e?.message || e))
        } else {
          applySession(result)
        }
      } catch (e) {
        console.warn('Supabase session restore failed:', e?.message || e)
      } finally {
        if (active) setAuthReady(true)
      }
    }

    restoreSession()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        setState(st => ({ ...st, auth: { user: null } }))
      } else if (event === 'SIGNED_IN' && session?.user && !stateRef.current.auth?.user) {
        api.loginExternal(session.user)
      }
    })

    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  // Deadline processing is idempotent and runs on boot/focus so the browser
  // remains responsive while Supabase-backed state is synchronised. A hosted
  // scheduler can call the same store-level policy when the app is unattended.
  useEffect(() => {
    api.processLeadDeadlines(new Date())
    const onFocus = () => api.processLeadDeadlines(new Date())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return <StoreCtx.Provider value={{ ...api, authReady, liveSyncStatus, syncDiagnostics }}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)

// Opp ID = YYMM + 3-digit monthly sequence + owner initials
// (e.g. 2609001RS), per the Sales Pipeline Report sheet.
export function nextOppId(opportunities, owner) {
  const now = new Date()
  const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0')
  const seqs = opportunities
    .filter(o => String(o.id).startsWith(yymm))
    .map(o => parseInt(String(o.id).slice(4, 7), 10))
    .filter(n => !isNaN(n))
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1
  return `${yymm}${String(next).padStart(3, '0')}${owner}`
}
