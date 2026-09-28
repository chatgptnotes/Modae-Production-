import React from 'react'
import { useStore } from '../store.jsx'
import { canPriceProposal } from '../utils.js'
import RateSheetPanel from './RateSheetPanel.jsx'
import { serviceUsesStandardRates, legacyServiceReview } from '../gates.js'

// Standard Service is a customer-issuance stage. Deployment inputs, actual
// days, and billing evidence belong to Service Execution & Close.
export default function WbService({ opp, focus = 'offer', onConfirmSent }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const offerMode = serviceUsesStandardRates(opp, store) ? 'Standard Rate Sheet' : (est.offerMode || 'Standard Rate Sheet')
  const legacyReview = !!legacyServiceReview(opp, store.approvals)
  const reviewApproval = legacyReview
    ? (store.approvals || []).find(a => a.oppId === opp.id && a.type === 'Service offer review' && ['Pending', 'Approved', 'Approved with conditions'].includes(a.status))
    : null
  const survey = (store.surveys || []).find(v => v.oppId === opp.id)
  const reviewReady = !!est.travelConfirmed && (!est.surveyRequired || !!survey?.report)
  const reviewAllowed = canPriceProposal(store.role) && reviewReady

  const requestServiceReview = () => {
    if (!reviewAllowed || reviewApproval) return
    store.requestApproval({
      oppId: opp.id, type: 'Service offer review', approver: 'AH', needed: ['AH', 'LJS'], anyOf: false,
      detail: `${offerMode} — ${opp.oppName}; ${est.workDays || 0} work days + ${est.travelDays || 0} travel days; engineer ${est.engineer || 'TBC'}.`,
    })
    store.updateServiceFlow(opp.id, { reviewRequested: true })
  }

  return (
    <div className="ana-grid service-rate-workbench">
      {focus === 'offer' && offerMode === 'Standard Rate Sheet' && (
        <RateSheetPanel
          opp={opp}
          est={est}
          onConfirmSent={onConfirmSent}
          legacyReview={legacyReview}
          reviewApproval={reviewApproval}
          reviewReady={reviewAllowed}
          onRequestReview={requestServiceReview}
        />
      )}
    </div>
  )
}
