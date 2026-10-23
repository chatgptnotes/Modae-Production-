import React, { useEffect, useSyncExternalStore } from 'react'
import { leadAddressValidation } from '../leadAddressValidationApi.js'

export default function LeadAddressAdvisory({ account, leadId, field, value, onApply, onCheck, disabled }) {
  useEffect(() => { leadAddressValidation.setAccount(account) }, [account])
  const check = useSyncExternalStore(leadAddressValidation.subscribe,
    () => leadAddressValidation.read(account, leadId, field, value), () => null)
  const checkButton = onCheck && String(value || '').trim() && <button type="button" disabled={disabled} onClick={onCheck}>Check address</button>
  if (!check) return checkButton ? <div className="lead-address-advisory">{checkButton}</div> : null
  if (check.pending) return <div className="lead-address-advisory" role="status">Checking address…</div>
  const result = check.result
  const suggested = result.standardizedAddress && result.standardizedAddress !== value
  const mapAddress = String(result.standardizedAddress || value || '').trim()
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}`
  return <div className="lead-address-advisory">
    <div className="lead-address-status" role="status"><strong>{result.status === 'Needs Clarification' ? 'Needs clarification' : result.status}</strong> · <span title="Address confidence" aria-label={`Address confidence: ${result.confidence}`}>{result.confidence}</span></div>
    {suggested && <div className="lead-address-suggestion">
      <span>Suggested: {result.standardizedAddress}</span>
      {result.canApply && <button type="button" disabled={disabled} aria-label="Confirm and use suggested address"
        onClick={() => onApply(result.standardizedAddress)}>Use address</button>}
    </div>}
    <div className="lead-address-actions">
      {checkButton}
      {Boolean(result.issues?.length) && <details className="lead-address-details">
        <summary>Details</summary>
        <div>{result.issues.map((issue, i) => <p key={i}>{issue}</p>)}</div>
      </details>}
      {result.source && mapAddress && <span className="lead-address-attribution"><a href={mapUrl} title={`Open in Google Maps: ${mapAddress}`} aria-label={`Open in Google Maps: ${mapAddress}`} target="_blank" rel="noopener noreferrer" translate="no">Google Maps</a></span>}
    </div>
  </div>
}
