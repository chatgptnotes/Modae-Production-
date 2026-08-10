import React from 'react'
import { useStore } from '../store.jsx'

// Customer master — status is set from the accounting-system upload only
// (payment pattern / KYC), never by salespeople.
export default function Customers() {
  const store = useStore()
  return (
    <div className="page">
      <h2>Customer Master</h2>
      <div className="toolbar">
        <span className="hint">
          Read-only for sales. Status comes from the periodic accounting-system upload (payment pattern, KYC);
          changes require approval by AH / BU head. New customers are flagged Blue until verified.
        </span>
        <span className="spacer" />
        <button onClick={() => alert('Admin upload (mock): periodically upload the customer extract from the accounting system; statuses refresh from that file.')}>⬆ Upload accounting extract</button>
      </div>
      <div className="sheet-wrap" style={{ maxWidth: 860 }}>
        <table className="sheet">
          <thead><tr><th>Customer</th><th>Category</th><th>Status</th><th>KYC</th><th>Payment Pattern</th></tr></thead>
          <tbody>
            {store.customers.map(c => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.category}</td>
                <td className={`cstat ${c.status}`}><span className={`pill ${c.status}`}>{c.status}</span></td>
                <td>{c.kyc}</td>
                <td>{c.payment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><span className="pill Green">Green</span> good standing</span>
        <span><span className="pill Amber">Amber</span> watch — credit terms need approval</span>
        <span><span className="pill Red">Red</span> hold — prepayment only</span>
        <span><span className="pill Blue">Blue</span> new — pending verification</span>
      </div>
    </div>
  )
}
