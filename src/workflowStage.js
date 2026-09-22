// The workbench milestone is the canonical workflow position. These labels
// keep list views and deep-linked opportunity pages speaking the same language.
import { milestoneForStage } from './seed.js'

const SPARES_STAGES = [
  ['Intake', 'Opportunity Intake'],
  ['Customer/KYC', 'Customer Verification'],
  ['Screening', 'Requirement Validation'],
  ['Sourcing', 'Spares Sourcing'],
  ['Proposal', 'Quotation Preparation'],
  ['Approval', 'Approval'],
  ['Submitted', 'Quotation Submission'],
  ['Follow-up', 'Follow-up & Closure'],
]

const SERVICE_STAGES = [
  ['Intake', 'Service Intake'],
  ['Qualification', 'Capture Enquiry'],
  ['Screening', 'Scope & Survey'],
  ['Proposal', 'Prepare Offer'],
  ['Approval', 'Internal Review'],
  ['Submitted', 'Send Offer'],
  ['Follow-up', 'Execute Service'],
]

const GENERIC_STAGES = [
  ['Intake', 'Intake'],
  ['Customer/KYC', 'Customer/KYC'],
  ['Registration', 'Registration'],
  ['Screening', 'Screening'],
  ['Clarification', 'Clarification'],
  ['Sourcing', 'Sourcing'],
  ['Proposal', 'Proposal'],
  ['Approval', 'Approval'],
  ['Submitted', 'Submitted'],
  ['Follow-up', 'Follow-up'],
]

const routeStages = opp => opp?.route === 'Spares'
  ? SPARES_STAGES
  : opp?.route === 'Service' ? SERVICE_STAGES : GENERIC_STAGES

export const workflowStageOptionsFor = opp => routeStages(opp).map(([milestone, label]) => ({ milestone, label }))

export const workflowStageMilestoneFor = opp => {
  // Terminal pipeline stages are authoritative. Older rows could be closed
  // through the tracker without their workbench milestone being updated, so
  // never let a stale Submitted/Proposal milestone hide Won or Lost here.
  const terminal = opp?.status === 'Closed' && ['Won', 'Lost'].includes(opp?.stage)
    ? milestoneForStage(opp.stage, opp.status)
    : null
  const stored = terminal || opp?.milestone || milestoneForStage(opp?.stage, opp?.status)
  return opp?.route === 'Spares' && stored === 'Qualification' ? 'Screening' : stored
}

export const workflowStageLabelFor = opp => {
  const milestone = workflowStageMilestoneFor(opp)
  return routeStages(opp).find(([key]) => key === milestone)?.[1] || milestone || opp?.stage || '—'
}
