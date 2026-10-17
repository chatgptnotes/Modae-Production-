import { canAccessPage, canPerform, effectiveAccess, isNonSalesUser } from './accessPolicy.js'
import { classRule, DEFAULT_CUSTOMER_CLASSES, noExceptionKeys } from './customerClasses.js'
import { canOverrideCustomerKyc } from './kycPolicy.js'
import { verificationSnapshot, kycVerificationComplete, redClearanceFor } from './leadVerification.js'
import { recordBooking } from './orderBookings.js'
import { B_STEPS, canSignBStep } from './seed.js'
import { releaseState, transitionBlockers } from './gates.js'
import { proposalApprovalSnapshot } from './approvalMemory.js'

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const denied = message => { throw Object.assign(new Error(message || 'Your role does not have permission for this action.'), { status: 403 }) }
const pick = (value, keys) => Object.fromEntries(keys.filter(key => key in (value || {})).map(key => [key, value[key]]))
const PUBLIC_OPPORTUNITY = ['id', 'oppName', 'owner', 'sellTo', 'euc', 'eucName', 'customerStatus', 'legacyCustomerClass', 'customerClassificationVersion', 'oppType', 'route', 'context', 'stage', 'status', 'prob', 'expectedOrderDate', 'expectedDate', 'enquiryDate', 'created', 'lastUpdated', 'milestone', 'sourceLeadId', 'region', 'location', 'product', 'solution', 'closeReason', 'closeReasonNote', 'closedDate', 'leadVerification', 'valueK', 'orderDate', 'invoiceDate', 'offerDate', 'wonDate', 'proposalDate', 'createDate', 'closedReason', 'closedReasonNote']
const PUBLIC_LEAD = ['id', 'subject', 'from', 'sender', 'company', 'customer', 'status', 'assignedOwner', 'suggestedOwner', 'oppId', 'ts', 'source', 'receivedAt', 'customerStatus', 'legacyCustomerClass', 'customerClassificationVersion']
const PUBLIC_BOOKING = ['id','oppId','owner','customer','title','po','booked','valueK','status','confirmedAt','confirmedBy','source']
export const projectBooking = booking => booking ? pick(booking,PUBLIC_BOOKING) : booking
const publicSales = sales => ({
  ...pick(sales,['fy','currentQ','monthsElapsed']),
  targets: Object.fromEntries(Object.entries(sales?.targets || {}).map(([owner,target]) => [owner,pick(target,['annual','q','confirmedFy','confirmedBy','confirmedAt'])])),
  orders: (sales?.orders || []).map(projectBooking),
})
const linkedOwner = (row, state) => (state.opportunities || []).find(o => o.id === (row?.oppId || row?.id))?.owner || row?.owner
export const canReadPricing = (user, row, config, state) => canPerform(user, 'commercial.view', config)
  || (canPerform(user, 'proposals.price', config) && linkedOwner(row, state) === user?.role)
const seeAny = (user, config, pages) => pages.some(page => canAccessPage(user, page, config))

// A projection can change without any business-row revision changing.
export function workspaceProjectionVersion(user, config) {
  const access = effectiveAccess(user, config)
  return JSON.stringify([user.role, [...access.roles].sort(), [...access.pages].sort(), [...access.actions].sort()])
}

// Shared metadata visibility rules for bounded revision reads and full projection.
export function canReadWorkspaceRecord(user, entity, row, config, state) {
  if (effectiveAccess(user, config).isAdmin) return true
  if (entity === 'leads') return seeAny(user, config, ['inbox', 'new', 'tender'])
  if (entity === 'opportunities') return seeAny(user, config, ['mydashboard','tracker','my','analytics','folders','proposal','po','approvals'])
  if (entity === 'spares_lines') return canAccessPage(user, 'proposal', config) && canReadPricing(user, row, config, state)
  if (entity === 'clarifications') return seeAny(user, config, ['mydashboard','tracker','my','analytics','folders','proposal','po','approvals']) && (canPerform(user,'commercial.view',config) || linkedOwner(row,state)===user?.role)
  if (entity === 'proposals') return canAccessPage(user, 'proposal', config) && canReadPricing(user, row, config, state)
  if (entity === 'approvals') return canAccessPage(user, 'approvals', config) && (canPerform(user, 'commercial.view', config) || row.needed?.includes(user.role) || row.approver === user.role || row.requestedBy === user.role)
  return false
}

export function projectWorkspace(state, user) {
  const config = state.config || {}
  const access = effectiveAccess(user, config)
  if (isNonSalesUser(user)) return { config: {}, workspaceGeneration: state.workspaceGeneration, demoData: false,
    users: [pick(user, ['id','authId','name','email','role','roles','status'])],
    leads: [], opportunities: [], approvals: [], customers: [], proposals: {}, sparesLines: [], clarifications: [],
    sales: {}, audit: [], svcEstimates: [], vendorQuotes: [], surveys: [], competitors: [], files: {}, communications: {},
    poCompare: {}, handover: {}, bSteps: {}, bStepOwners: {}, rateSheets: {}, adhocParts: [], importedWorkbook: null, leadDeadlines: [], kyc: {}, leadArchive: [] }
  const freshUsers = (state.users || []).map(row => row.id === user.id || row.authId && row.authId === user.authId ? { ...row, ...user } : row)
  if (access.isAdmin) return { ...state, users: freshUsers.map(({ pw, password, passwordHash, ...profile }) => profile) }
  const commercial = canPerform(user, 'commercial.view', config)
  const opportunitiesVisible = seeAny(user, config, ['mydashboard', 'tracker', 'my', 'analytics', 'folders', 'proposal', 'po', 'approvals'])
  const leadVisible = seeAny(user, config, ['inbox', 'new', 'tender'])
  const pricingRows = rows => (rows || []).filter(row => canReadPricing(user, row, config, state))
  // Explicit slice allowlist: future/private state cannot silently enter a shared response.
  const projected = {
    config, workspaceGeneration: state.workspaceGeneration, demoData: false,
    opportunities: opportunitiesVisible ? (state.opportunities || []).map(row => canReadPricing(user, row, config, state) ? row : { ...pick(row, PUBLIC_OPPORTUNITY), ...(row.booking ? { booking: projectBooking(row.booking) } : {}) }) : [],
    leads: leadVisible ? (state.leads || []).map(row => commercial || row.assignedOwner === user?.role ? row : pick(row, PUBLIC_LEAD)) : [],
    users: freshUsers.map(row => pick(row, ['id', 'name', 'email', 'role', 'roles', 'status', ...(row.id === user.id ? ['authId'] : [])])),
    approvals: canAccessPage(user, 'approvals', config) ? (state.approvals || []).filter(row => commercial || row.needed?.includes(user?.role) || row.approver === user?.role || row.requestedBy === user?.role).map(row => canReadPricing(user,row,config,state) ? row : pick(row,['id','oppId','leadId','type','status','needed','approver','anyOf','requestedBy','ts','decisions','decisionTs','decisionNote','conditions','supersededBy','cancelledAt','cancelledBy','cancellationReason','__sv'])) : [],
    customers: canAccessPage(user, 'customers', config) || leadVisible ? state.customers || [] : [],
    proposals: canAccessPage(user, 'proposal', config) ? Object.fromEntries(Object.entries(state.proposals || {}).filter(([id, row]) => canReadPricing(user, { ...row, id }, config, state))) : {},
    sparesLines: canAccessPage(user, 'proposal', config) ? pricingRows(state.sparesLines) : [],
    clarifications: opportunitiesVisible ? (state.clarifications || []).filter(row => commercial || linkedOwner(row, state) === user?.role) : [],
    sales: opportunitiesVisible ? (commercial ? state.sales || {} : publicSales(state.sales)) : {},
    audit: canAccessPage(user, 'audit', config) && commercial ? state.audit || [] : [],
  }
  for (const key of ['svcEstimates', 'vendorQuotes', 'surveys', 'competitors']) projected[key] = pricingRows(state[key])
  for (const key of ['files', 'communications', 'poCompare', 'handover', 'bSteps', 'bStepOwners']) projected[key] =
    Object.fromEntries(Object.entries(state[key] || {}).filter(([id]) => canReadPricing(user, { id }, config, state)))
  projected.rateSheets = canPerform(user, 'proposals.price', config) || commercial ? state.rateSheets || {} : {}
  projected.adhocParts = canPerform(user, 'proposals.price', config) || commercial ? state.adhocParts || [] : []
  projected.importedWorkbook = null
  projected.leadDeadlines = leadVisible ? state.leadDeadlines || [] : []
  projected.kyc = leadVisible || opportunitiesVisible ? state.kyc || {} : {}
  projected.leadArchive = leadVisible ? (state.leadArchive || []).filter(row => commercial || row.assignedOwner === user?.role) : []
  return projected
}

const changedKeys = (before, after) => [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(key => !same(before?.[key], after?.[key]))
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && same([...new Set(a)].sort(), [...new Set(b)].sort()) && a.length === new Set(a).size
const realTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() + 60000

function approvalRouting(request, config, state) {
  if (request.type === 'Milestone exception') {
    const opp = (state.opportunities || []).find(row => row.id === request.oppId)
    if (!opp || noExceptionKeys(config).includes(request.blockerKey)) return null
    const blocker = transitionBlockers(opp,request.targetMilestone,state.proposals?.[opp.id],{...state,config}).find(row => row.key === request.blockerKey)
    if (!blocker || blocker.approvalType || !['amber-fee','red-clearance'].includes(blocker.key)) return null
    return { needed: blocker.needed || [blocker.approver || 'AH'], anyOf: !!blocker.anyOf }
  }
  const configured = (config.approvalRules || []).find(rule => rule.type === request.type && rule.enabled !== false)
  if (configured) return { needed: configured.needed?.length ? configured.needed : [configured.approver].filter(Boolean), anyOf: !!configured.anyOf }
  const fixed = {
    'Technical approval': { needed: ['LJS', 'AN'], anyOf: true },
    'Commercial approval': { needed: ['AH'] },
    'Final quote release': { needed: ['LJS', 'AH'] },
    'Service offer review': { needed: ['AH', 'LJS'] },
    'Technical deviation': { needed: ['LJS'] },
    'Commercial deviation': { needed: ['AH'] },
    'Customer master change': { needed: ['AH'] },
    'Pricing threshold exception': { needed: config.approvalThresholds?.pricingApprovers?.length ? config.approvalThresholds.pricingApprovers : ['AH', 'LJS'], anyOf: (config.approvalThresholds?.pricingApprovers?.length || 2) > 1 },
  }
  if (fixed[request.type]) return fixed[request.type]
  const source = (state.leads || []).find(row => row.id === request.leadId) || (state.opportunities || []).find(row => row.id === request.oppId)
  const rules = Object.keys({ ...DEFAULT_CUSTOMER_CLASSES, ...config.customerClasses }).map(cls => classRule(config, cls))
  if (source) rules.push(classRule(config, source.customerStatus, source))
  for (const rule of rules) {
    for (const gate of [rule?.gate, rule?.verification, rule?.advisory]) {
      if (gate?.approvalType === request.type && gate.approvers?.length) return { needed: gate.approvers, anyOf: !!gate.anyOf }
    }
  }
  return null
}

function assertApprovalRequest(next, user, config, state) {
  const routing = approvalRouting(next, config, state)
  const needed = next.needed || [next.approver].filter(Boolean)
  if (!routing || !routing.needed.length || !sameSet(needed, routing.needed) || !!next.anyOf !== !!routing.anyOf
    || next.approver && !routing.needed.includes(next.approver)) denied('Approval assignments must match the configured workflow gate.')
  if (next.requestedBy !== user.role) denied('Approval requester must match the signed-in user.')
  if (Object.keys(next.decisions || {}).length || next.decidedBy || next.decisionTs) denied('New approvals cannot contain a decision.')
}

function assertPurchaseOrders(previous, next, user, requireAction) {
  for (const id of changedKeys(previous, next)) {
    const before = previous?.[id], after = next?.[id]
    if (!after) denied('Purchase-order evidence cannot be deleted through a generic save.')
    const detailsChanged = !same(before?.bookingDetails, after.bookingDetails)
    const signatures = after.acceptance || {}
    if (detailsChanged && Object.values(signatures).some(Boolean)) denied('Changing PO details must reset both signatures.')
    for (const role of changedKeys(before?.acceptance, signatures)) {
      if (!signatures[role] && detailsChanged) continue
      requireAction('approvals.decide')
      if (!['LJS', 'AH'].includes(role) || role !== user.role || before?.acceptance?.[role] || !realTimestamp(signatures[role])) denied('Another approver’s PO signature cannot be changed.')
      if (after.simulated || !after.bookingDetails || !(after.lines || []).every(line => line.resolved)) denied('Verify the customer PO before accepting it.')
    }
    if (after.status === 'Accepted' && (!signatures.LJS || !signatures.AH)) denied('Both purchase-order approvals are required.')
    if (before?.status === 'Accepted' && after.status !== 'Accepted' && !detailsChanged) denied('Accepted purchase orders cannot be reopened without new details.')
  }
}

export function assertWorkspaceRowWrite(user, entity, previous, next, config, state, id = next?.id || previous?.id, deleted = false) {
  if (isNonSalesUser(user)) denied('Use the New Lead form to submit enquiries.')
  const access = effectiveAccess(user, config)
  const requireAction = action => {
    if (!canPerform(user, action, config)) denied()
    const pages = {
      'leads.create': ['inbox','new','tender'], 'leads.edit': ['inbox','new','tender'],
      'opportunities.create': ['new','inbox','tender'], 'opportunities.edit': ['tracker','my','proposal','po'],
      'approvals.decide': ['approvals'], 'approvals.request': ['approvals','proposal','inbox','customers','tracker'],
      'proposals.price': ['proposal'], 'priceLists.manage': ['pricelists'], 'proposals.send': ['proposal','proposalSent'],
    }[action]
    if (pages && !seeAny(user,config,pages)) denied('Your role does not have access to the page for this action.')
  }
  if (entity === 'settings') {
    if (!access.isAdmin || id !== 'config') denied('Only administrators can change application settings.')
    for (const key of ['accessPolicy', 'opportunityNumbering']) if (!same(previous?.[key], next?.[key])) denied('Use the dedicated access-rules editor to change permissions or numbering.')
    return
  }
  if (entity === 'state' && ['users', 'workspace_generation', 'auth', 'role', 'roles'].includes(id)) denied('Use the dedicated account or workspace operation.')
  if (deleted) requireAction('records.delete')
  if (entity === 'opportunities') {
    requireAction(previous ? 'opportunities.edit' : 'opportunities.create')
    if (deleted && previous?.booking && !(state.sales?.orders || []).some(row => same(row,previous.booking))) denied('Preserve the confirmed booking in the order register before deleting this opportunity.')
    if (previous && !canReadPricing(user, previous, config, state)) {
      for (const key of changedKeys(previous, next)) if (!PUBLIC_OPPORTUNITY.includes(key)) denied('You do not have permission to edit protected opportunity data.')
    }
    if (!access.isAdmin && previous?.owner !== next?.owner && next?.owner !== user.role && !canPerform(user, 'commercial.view', config)) denied('You cannot reassign this opportunity.')
    if (previous && previous.owner !== next?.owner && !access.isAdmin && !canPerform(user, 'commercial.view', config)) denied('Only authorized management can transfer opportunity ownership.')
    if (!same(previous?.importedFrom, next?.importedFrom) || previous?.bookingRequiresPO && !next?.bookingRequiresPO) denied('Imported history and booking requirements cannot be forged.')
    if (!same(previous?.leadVerification, next?.leadVerification) && next?.leadVerification) {
      const source = (state.leads || []).find(lead => lead.id === next.sourceLeadId || lead.oppId === id)
      const expected = source && verificationSnapshot(source, next.customerStatus, { config, approval: redClearanceFor(state.approvals || [], source.id, config, next.customerStatus) })
      if (!source || !same(expected, next.leadVerification)) denied('Lead verification must match the authoritative source lead.')
    }
    if (previous?.booking && !same(previous.booking, next?.booking)) denied('Confirmed order bookings cannot be overwritten.')
    if (!same(previous?.kycOverride, next?.kycOverride)) {
      requireAction('approvals.decide')
      const override = next?.kycOverride
      if (!canOverrideCustomerKyc(user, previous || next, config) || !override || override.by !== user.role
        || !String(override.reason || '').trim() || !realTimestamp(override.ts)
        || override.authority && (!access.isAdmin || override.authority !== 'ADMIN')) denied('Only authorized approvers can record a reasoned KYC bypass.')
    }
    if (!same(previous?.booking, next?.booking) && next?.booking) {
      requireAction('approvals.decide')
      if (!previous || !realTimestamp(next.booking.confirmedAt)) denied('Invalid booking confirmation.')
      try {
        const role = access.isAdmin && !['LJS','AH','ADMIN','SUPER'].includes(user.role) ? 'ADMIN' : user.role
        const expected = recordBooking({ ...state, role }, id, next.booking, new Date(next.booking.confirmedAt)).opportunities.find(row => row.id === id)?.booking
        if (!same({ ...expected, confirmedBy: user.role }, next.booking)) denied('Booking must match verified purchase-order details.')
      } catch (error) { denied(error.message) }
    }
    if ((!same(previous?.proposalDate, next?.proposalDate) && next?.proposalDate) || previous?.milestone !== next?.milestone && next?.milestone === 'Submitted') {
      requireAction('proposals.send')
      const release = releaseState(state.proposals?.[id],state.approvals || [],id,previous || next,config)
      if (release.required && !release.release) denied('Proposal release approval is required before recording a submission.')
    }
  } else if (entity === 'leads') {
    requireAction(previous ? 'leads.edit' : 'leads.create')
    if (previous && previous.assignedOwner !== user.role && !canPerform(user,'commercial.view',config)) {
      for (const key of changedKeys(previous,next)) if (!PUBLIC_LEAD.includes(key)) denied('You do not have permission to edit protected lead data.')
    }
    if (previous && previous.assignedOwner !== next?.assignedOwner && !access.isAdmin && !canPerform(user,'commercial.view',config)) denied('Only authorized management can transfer lead ownership.')
    if (!same(previous?.existingCustomerKyc, next?.existingCustomerKyc) && next?.existingCustomerKyc) {
      const customer = (state.customers || []).find(row => row.name === (next.sellTo || next.customerName))
      if (customer?.kyc !== 'Valid') denied('Existing customer KYC must be verified in the customer master.')
    }
    if (!same(previous?.kycCompletedAt, next?.kycCompletedAt) && next?.kycCompletedAt && !kycVerificationComplete(next, config)) denied('Complete the required KYC evidence before marking it verified.')
  }
  else if (entity === 'approvals') {
    if (!previous) assertApprovalRequest(next, user, config, state)
    const decisionChanged = !same(previous?.decisions || {}, next?.decisions || {})
    if (decisionChanged) {
      requireAction('approvals.decide')
      if (!previous) denied('Create an approval request before deciding it.')
      const needed = previous.needed || [previous.approver].filter(Boolean)
      if (!needed.includes(user?.role)) denied('You are not an assigned approver.')
      for (const role of new Set([...Object.keys(previous.decisions || {}), ...Object.keys(next.decisions || {})])) {
        if (role !== user.role && !same(previous.decisions?.[role], next.decisions?.[role])) denied('Another approver’s decision cannot be changed.')
      }
      if (!['Approved', 'Rejected'].includes(next.decisions?.[user.role]?.d)) denied('Invalid approval decision.')
    } else requireAction('approvals.request')
    if (previous && previous.status !== 'Pending' && decisionChanged) denied('A completed approval decision cannot be rewritten.')
    const decisionFields = ['decisions','status','__sv','decisionTs','decisionNote','conditions','rejectionActions','rejectionCommentReview','cancelledBy','cancelledAt','supersededBy']
    if (previous && previous.status !== 'Pending' && changedKeys(previous,next).some(key => !decisionFields.includes(key) && !(key === 'oppId' && !previous.oppId && previous.leadId && (state.opportunities || []).some(row => row.id === next.oppId && row.sourceLeadId === previous.leadId)))) denied('Approved decision inputs cannot be changed.')
    const linkedOpportunity = !previous?.oppId && next?.oppId && previous?.leadId && (state.opportunities || []).some(row => row.id === next.oppId && row.sourceLeadId === previous.leadId)
    const expectedSnapshot = proposalApprovalSnapshot(state.proposals?.[previous?.oppId] || {}, (state.opportunities || []).find(row => row.id === previous?.oppId) || {})
    const contextRefresh = previous?.status === 'Pending' && previous?.requestedBy === user.role && !decisionChanged
      && same(next?.approvalSnapshot,expectedSnapshot)
    if (previous && (['needed', 'approver', 'anyOf', 'oppId', 'leadId', 'type', 'approvalSnapshot', 'patch', 'customerName', 'pricingSignature', 'pricingRows', 'coversPricingThreshold', 'blockerKey', 'targetMilestone'].some(key =>
      !same(previous[key], next?.[key]) && !(key === 'oppId' && linkedOpportunity)
        && !(key === 'approvalSnapshot' && contextRefresh)))) denied('Approval assignments and scope cannot be changed after requesting approval.')
    if (!previous && (next?.status && next.status !== 'Pending')) denied('New approval requests must be pending.')
    if (previous && !decisionChanged && !['Pending', 'Cancelled', previous.status].includes(next?.status)) denied('Approval status requires an assigned decision.')
    if (decisionChanged) {
      const needed = previous.needed || [previous.approver].filter(Boolean)
      const decisions = next.decisions || {}
      const complete = previous.anyOf ? needed.some(role => decisions[role]) : needed.every(role => decisions[role])
      const expected = Object.values(decisions).some(value => value.d === 'Rejected') ? 'Rejected' : complete ? 'Approved' : 'Pending'
      if (next.status !== expected) denied('Approval status does not match the required decisions.')
    }
  } else if (['proposals', 'spares_lines'].includes(entity)) {
    requireAction('proposals.price')
    if (!(state.opportunities || []).some(row => row.id === (next?.oppId || id))) denied('Proposal pricing requires an existing opportunity.')
    if (!canReadPricing(user, { ...next, id }, config, state) || previous && !canReadPricing(user, { ...previous, id }, config, state)) denied('You cannot price another owner’s proposal.')
  }
  else if (['price_lists', 'price_list_versions'].includes(entity)) requireAction('priceLists.manage')
  else if (entity === 'clarifications') requireAction('opportunities.edit')
  else if (entity === 'audit') {
    if (previous || deleted) denied('Audit history cannot be changed.')
  } else if (entity === 'state') {
    if (id === 'demoData') { if (!access.isAdmin) denied('Only administrators can change this workspace setting.') }
    else if (id === 'sales') {
      if (!access.isAdmin) {
        requireAction('records.delete')
        const { orders: beforeOrders = [], ...beforeSettings } = previous || {}
        const { orders: afterOrders = [], ...afterSettings } = next || {}
        if (!same(beforeSettings,afterSettings) || !Array.isArray(afterOrders) || afterOrders.length < beforeOrders.length) denied('Sales targets and existing orders cannot be changed.')
        const oldById = new Map(beforeOrders.map(row => [row.id,row]))
        const newIds = new Set()
        for (const order of afterOrders) {
          if (!order?.id || newIds.has(order.id)) denied('Order identities must be unique.')
          newIds.add(order.id)
          if (oldById.has(order.id)) {
            if (!same(oldById.get(order.id),order)) denied('Confirmed orders are immutable.')
            oldById.delete(order.id)
          } else if (!(state.opportunities || []).some(row => same(row.booking,order))) denied('Only identical confirmed booking snapshots may be retained.')
        }
        if (oldById.size) denied('Existing confirmed orders must be retained.')
      }
    }
    else if (id === 'customers') {
      if (!Array.isArray(next) || !Array.isArray(previous || [])) denied('Invalid customer roster.')
      if (!access.isAdmin) {
        const customerKey = name => String(name || '').trim().toLowerCase()
        const beforeByName = new Map((previous || []).map(row => [customerKey(row.name),row]))
        const names = new Set()
        for (const customer of next) {
          const name = customerKey(customer.name)
          if (!name || names.has(name)) denied('Customer names must be unique.')
          names.add(name)
          const before = beforeByName.get(name)
          if (same(before,customer)) continue
          if (!before) {
            if (!canAccessPage(user,'customers',config) && !canPerform(user,'leads.create',config) && !canPerform(user,'leads.edit',config)) denied()
            if (['Valid','Verified','Approved'].includes(customer.kyc)) {
              const lead = (state.leads || []).find(row => customerKey(row.sellTo || row.customerName) === name && row.customerStatus === customer.status)
              const items = state.kyc?.[customer.name] || []
              const required = config.kycItems || []
              const masterComplete = required.length && required.every(item => items.some(row => row.name === item && ['Verified','Approved'].includes(row.state)))
              if (!masterComplete && (!lead || !kycVerificationComplete(lead,config))) denied('Customer KYC requires authoritative verification evidence.')
            }
          } else {
            const changed = changedKeys(before,customer)
            const approved = (state.approvals || []).find(row => !row.supersededBy && row.type === 'Customer master change' && row.status === 'Approved'
              && customerKey(row.customerName) === name && changed.every(key => same(row.patch?.[key],customer[key]))
              && (row.needed || [row.approver]).includes(user.role))
            const required = config.kycItems || []
            const kycItems = state.kyc?.[customer.name] || []
            const validKycChange = changed.every(key => key === 'kyc') && (customer.kyc === 'Pending' || required.length && required.every(item => kycItems.some(row => row.name === item && ['Verified','Approved'].includes(row.state))))
            if (!approved && !validKycChange) denied('Customer changes require the matching approved request.')
            requireAction('approvals.decide')
          }
        }
        if ([...beforeByName.keys()].some(name => !names.has(name))) denied('Customer history cannot be removed through generic state saves.')
      }
    }
    else if (['leadArchive', 'leadDeadlines'].includes(id)) requireAction('leads.edit')
    else if (['svcEstimates', 'vendorQuotes'].includes(id)) {
      requireAction('proposals.price')
      const rows = new Map((previous || []).map(row => [row.id || row.oppId, row]))
      for (const row of next || []) {
        const before = rows.get(row.id || row.oppId)
        if (!same(before,row) && (!canReadPricing(user,row,config,state) || before && !canReadPricing(user,before,config,state))) denied('You cannot price another owner’s records.')
        rows.delete(row.id || row.oppId)
      }
      for (const row of rows.values()) if (!canReadPricing(user,row,config,state)) denied('Hidden pricing records must be preserved.')
    }
    else if (id === 'rateSheets') requireAction('priceLists.manage')
    else if (id === 'adhocParts') requireAction('proposals.price')
    else if (id === 'importedWorkbook') denied('Use the reviewed workbook import operation.')
    else if (id === 'poCompare') {
      requireAction('opportunities.edit')
      for (const oppId of changedKeys(previous,next)) if (!canReadPricing(user,{id:oppId},config,state)) denied('You cannot change another owner’s purchase-order records.')
      assertPurchaseOrders(previous, next, user, requireAction)
    }
    else if (id === 'handover') {
      requireAction('opportunities.edit')
      for (const key of changedKeys(previous,next)) {
        const after = next?.[key]
        if (!canReadPricing(user,{id:key},config,state)) denied('You cannot change another owner’s handover records.')
        if (['approved','approvedBy','approvedOn'].some(field => !same(previous?.[key]?.[field],after?.[field]))) {
          requireAction('approvals.decide')
          if (!access.isAdmin && !['LJS','AH'].includes(user.role)) denied('Only the designated approvers can approve handover.')
          if (after?.approved && (after.approvedBy !== user.role || state.poCompare?.[key]?.status !== 'Accepted')) denied('Handover requires accepted purchase-order evidence and your own signature.')
        }
      }
    }
    else if (id === 'bStepOwners') { if (!access.isAdmin) { requireAction('approvals.decide'); if (!['LJS','AH'].includes(user.role)) denied() } }
    else if (id === 'bSteps') {
      requireAction('opportunities.edit')
      for (const oppId of changedKeys(previous,next)) {
        const opp = (state.opportunities || []).find(row => row.id === oppId)
        if (!opp || !canSignBStep(user.role,opp)) denied('Only the assigned salesperson or LJS may sign this workflow.')
        for (const step of changedKeys(previous?.[oppId],next?.[oppId])) {
          const value = next?.[oppId]?.[step], index = B_STEPS.findIndex(row => row.id === step)
          if (value && (index < 0 || value.by !== user.role || value.state !== 'Signed' || index > 0 && next?.[oppId]?.[B_STEPS[index-1].id]?.state !== 'Signed')) denied('Invalid workflow signature or step order.')
        }
      }
    }
    else if (id === 'kyc') {
      requireAction('opportunities.edit')
      for (const name of changedKeys(previous,next)) {
        const before = previous?.[name] || []
        for (const item of next?.[name] || []) {
          if (['Approved','Verified'].includes(item.state) && !same(before.find(row => row.name === item.name),item)) {
            requireAction('approvals.decide')
            if (!access.isAdmin && !(config.legacyCustomerClasses?.Blue?.gate?.approvers || ['AH']).includes(user.role)) denied('Only the configured KYC approver can verify customer-master evidence.')
          }
        }
      }
    }
    else if (['files', 'communications', 'surveys', 'competitors'].includes(id)) {
      requireAction('opportunities.edit')
      const beforeRows = Array.isArray(previous) ? Object.fromEntries(previous.map(row => [row.id || row.oppId,row])) : previous
      const afterRows = Array.isArray(next) ? Object.fromEntries(next.map(row => [row.id || row.oppId,row])) : next
      for (const key of changedKeys(beforeRows,afterRows)) {
        const row = afterRows?.[key] || beforeRows?.[key]
        if (!access.isAdmin && !canReadPricing(user, { ...row, id: row?.oppId || key }, config,state)) denied('You cannot change another owner’s workflow records.')
        if (id === 'communications') {
          const oldRows = new Map((beforeRows?.[key] || []).map(row => [row.id,row]))
          for (const communication of row || []) {
            if (!same(oldRows.get(communication.id), communication) && (communication.kind === 'submission' || communication.status === 'sent' || communication.sentAt)) {
              requireAction('proposals.send')
              const opp = (state.opportunities || []).find(o => o.id === key)
              const release = releaseState(state.proposals?.[key], state.approvals || [], key, opp, config)
              if (release.required && !release.release) denied('Proposal release approval is required before recording a submission.')
            }
          }
        }
      }
    }
    else denied('This workspace state cannot be changed through the data endpoint.')
  } else denied('Unsupported workspace entity.')
}
