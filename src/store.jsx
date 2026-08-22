import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as filestore from './filestore.js'
import * as datastore from './datastore.js'
import * as leadBlobs from './leadBlobs.js'
import { mintId, nextSeq, seqOf } from './ids.js'
import { statusFolderFor } from './sharepoint.js'
import {
  buildPoCompare, buildHandover, milestoneForStage, routeForType,
  contextForType, B_STEPS, REVISION_TYPES,
  ROLES, SUBFOLDERS, newProposal, PORTAL_ENABLED,
} from './seed.js'
import { leadConfig, routeOwner, expiredLeadDeadline, aiAuditDetail } from './leadRules.js'
import { withoutSimulated, simulatedCount } from './simulatedLeads.js'
import { KEY, migrate, seedState, emptyState, stateFromSaved, syncedOf, defaultViewMode } from './appState.js'

const StoreCtx = createContext(null)

// The localStorage read is all that is left here; the decision itself lives in
// appState.js so the tests can drive the boot path directly.
const initialState = () => stateFromSaved(localStorage.getItem(KEY))

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
  //
  // "Replace" is deliberately limited to slices this device has not touched
  // since boot. The fetch resolves after the app is already interactive, and
  // saves are gated on hydratedRef, so anything created in that window lives
  // only in localStorage — spreading the server's copy over it would delete a
  // record the user just made and watched appear (simulate a lead, reload
  // straight away, and it is gone). Same rule as applyServer, measured against
  // bootRef instead of lastSavedRef because we have not saved anything yet.
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
      const s = stateRef.current
      const accepted = {}
      for (const [k, v] of Object.entries(syncedOf(res.slices))) {
        if (k in s && s[k] !== bootRef.current[k]) continue // edited this session — keep local
        accepted[k] = v
      }
      const merged = migrate({ ...s, ...accepted })
      // Only the slices we took from the server are known to match it. A slice
      // we kept is still unsaved, so it must stay dirty for the flush below.
      lastSavedRef.current = Object.fromEntries(
        Object.keys(accepted).map(k => [k, merged[k]]))
      hydratedRef.current = true
      setState(merged)
      // Push whatever the user did during the boot window now, rather than
      // leaving it to depend on them making another change. Deferred by a tick
      // because flushSaves reads stateRef, which only catches up on the render
      // setState above has just scheduled.
      setTimeout(flushSaves, 0)
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
    // visibilitychange is not reliably delivered when the page is being torn
    // down, which is exactly the reload-right-after-editing case. pagehide is.
    const onPageHide = () => flushSaves()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  useEffect(() => {
    // An uncaught throw here (quota, storage disabled) would kill persistence
    // silently while the app carried on looking normal — seed data is rebuilt
    // by migrate() on every boot, so only the records the user created would
    // go missing. Fail loudly in the console instead.
    try { localStorage.setItem(KEY, JSON.stringify(state)) }
    catch (e) { console.warn('Local save failed — changes may not survive a reload:', e?.message) }
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
            // The original dispatch is V1, so the first revision is V2. Count
            // revisions only — `revisions` also carries the 'Submitted' entries
            // the builder writes, which are not versions of the quote.
            rev: `V${revisions.filter(r => r.status === 'Revised').length + 2}`,
            when: new Date().toISOString().slice(0, 10),
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
        : entry.kind === 'proposal-email-compose' ? 'Proposal email compose opened'
        : entry.kind === 'vendor-rfq' ? 'Manufacturer RFQ sent'
        : entry.kind === 'clarification' ? 'Clarification emailed' : 'Proposal emailed',
      oppId, entry.subject))
    },

    // ---- Lead inbox -------------------------------------------------------
    addLead(lead) {
      setState(s => withAudit(
        { ...s, leads: [{ ...lead }, ...s.leads] },
        'Lead received', lead.id, lead.subject))
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
            : [{ ...updated, archivedAt: new Date().toISOString(), archiveReason: updated.droppedReason || detail }, ...(next.leadArchive || [])]
          : next.leadArchive || []
        const audited = withAudit(next, patch.status ? `Lead ${patch.status.toLowerCase()}` : 'Lead updated', id,
          detail || patch.droppedReason || patch.oppId || auditKeys.join(', '))
        return { ...audited, leadArchive: archived }
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
          next.leadArchive = [{ ...updated, archivedAt: new Date(now).toISOString(), archiveReason: updated.droppedReason }, ...next.leadArchive]
          next.leadDeadlines = [...next.leadDeadlines, { key: deadlineKey, leadId: lead.id, type: expired.type, dueAt: expired.dueAt, status: 'Expired', expiredAt: new Date(now).toISOString() }]
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
    recordDecision(id, { d, comment = '', conditions = [] }) {
      setState(s => {
        const appr = s.approvals.find(a => a.id === id)
        if (!appr) return s
        const needed = appr.needed || [appr.approver].filter(Boolean)
        // Guard at the model layer, not only in Approvals.canDecide. Keying by
        // persona alone let an ADMIN/SUPER decision land outside `needed`, and
        // `needed.every(...)` then never came true — stranding a joint gate at
        // Pending with no way back.
        if (needed.length && !needed.includes(s.role)) return s
        const decisions = { ...(appr.decisions || {}), [s.role]: { d, c: comment, when: new Date().toISOString() } }
        // Diagram 02 §5 names two approvers on some gates but only needs one of
        // them: 5A technical is "LJS *or* AN", and the "< ₹10 L & <= 50%" row of
        // the 5C margin matrix is "AH *or* LJS". `anyOf` marks those; every
        // other gate still needs a decision from each named role. A rejection
        // stays authoritative either way — one approver declining ends it
        // rather than sending the request round to the other.
        const allIn = appr.anyOf ? needed.some(r => decisions[r]) : needed.every(r => decisions[r])
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
      setState(s => {
        const items = (s.kyc[customerName] || (s.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' })))
          .map(k => (k.name === itemName
            ? { ...k, state, when: new Date().toISOString().slice(0, 10), ...(file === undefined ? {} : { file: file || undefined }) }
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

    answerClarification(id, { response, answerSource = '', answeredAt = '', attachments = [] }) {
      setState(s => withAudit({
        ...s,
        clarifications: s.clarifications.map(c => (c.id === id ? {
          ...c,
          response,
          answerSource,
          answeredAt: answeredAt || new Date().toISOString().slice(0, 10),
          answeredBy: s.role,
          attachments: [...(c.attachments || []), ...attachments],
          status: 'Answered',
        } : c)),
      }, 'Clarification answered', id, response))
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
        const label = `Manufacturer quote - ${price.manufacturer || quote?.manufacturer || 'Vendor'}`
        return withAudit({
          ...s,
          vendorQuotes: (s.vendorQuotes || []).map(q => (q.id === id ? {
            ...q,
            status: 'Applied',
            receivedAt: q.receivedAt || new Date().toISOString().slice(0, 10),
            prices: [{ lineId, ...price, appliedAt: new Date().toISOString() }, ...(q.prices || [])],
          } : q)),
          sparesLines: s.sparesLines.map(l => (l.id === lineId ? {
            ...l,
            listPrice: price.unitPrice === '' || price.unitPrice == null ? (l.listPrice || 0) : Number(price.unitPrice),
            currency: price.currency || l.currency || 'INR',
            leadTime: price.leadTime || l.leadTime || 'TBC',
            priceList: label,
            priceState: 'Current',
            oem: price.manufacturer || quote?.manufacturer || l.oem,
            quoteRef: price.quoteRef || quote?.subject || quote?.id,
            confirmed: true,
          } : l)),
        }, 'Vendor quote applied', id, `${lineId} ${price.unitPrice || ''} ${price.currency || ''}`)
      })
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
    addSparesLinesFromLead(oppId, rows) {
      setState(s => {
        const existing = s.sparesLines.filter(l => l.oppId === oppId)
        const key = l => `${String(l.pn || l.custRef || '').toUpperCase()}|${String(l.desc || '').toLowerCase()}`
        const seen = new Set(existing.map(key))
        const additions = rows.filter(Boolean).filter(row => {
          const k = key(row)
          if (seen.has(k)) return false
          seen.add(k)
          return true
        }).map((row, i) => ({
          id: mintId('SL', [...s.sparesLines, ...rows.slice(0, i)]), oppId,
          match: row.match || 'AI suggested', conf: Number(row.conf) || 0,
          confirmed: !!row.confirmed, priceList: row.priceList || 'Ad-hoc',
          priceState: row.priceState || 'Current', currency: row.currency || 'INR',
          qty: Number(row.qty) || 1, uom: row.uom || 'EA', ...row,
        }))
        if (!additions.length) return s
        return withAudit({ ...s, sparesLines: [...s.sparesLines, ...additions] }, 'Lead lines imported', oppId, `${additions.length} line(s)`)
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
        const existing = new Set((base.bom || []).map(b => b.pn || b.custRef || b.desc))
        const added = lines.filter(l => !existing.has(l.pn || l.custRef || l.desc)).map(l => ({
          itemCategory: 'Hardware', pn: l.pn, custRef: l.custRef, desc: l.desc, listPrice: l.listPrice, adders: [],
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

    // Drop the saved state entirely — initialState() then rebuilds from
    // seedState(), which carries demoData: true, so this doubles as "bring the
    // demo data back" once clearDemo has removed it.
    async restoreDemo() {
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
    // The original name of the action above — kept so existing callers and the
    // manual smoke checklist keep working.
    async resetDemo() { return api.restoreDemo() },

    // Empty the app: every business record goes, logins and configuration stay.
    async clearDemo() {
      const next = emptyState(stateRef.current)
      if (datastore.dbEnabled()) {
        try { await datastore.resetAll(syncedOf(next)) }
        catch (e) { console.warn('Supabase clear failed — server data left as-is:', e?.message) }
      }
      try { await leadBlobs.clearAll() }
      catch (e) { console.warn('Lead file store clear failed:', e?.message) }
      // Written, not removed: an absent key sends initialState() back to the
      // seeds, which is the opposite of what this action means.
      try { localStorage.setItem(KEY, JSON.stringify(next)) }
      catch (e) { console.warn('Local save failed — demo data may return on reload:', e?.message) }
      window.location.reload()
    },
  }

  // Deadline processing is idempotent and runs on boot/focus so the browser
  // remains responsive while Supabase-backed state is synchronised. A hosted
  // scheduler can call the same store-level policy when the app is unattended.
  useEffect(() => {
    api.processLeadDeadlines(new Date())
    const onFocus = () => api.processLeadDeadlines(new Date())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

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
