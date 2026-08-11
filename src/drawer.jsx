import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from './store.jsx'
import OppPanel from './opppanel.jsx'

// Ephemeral record-detail drawer, mirroring the formula bar's context pattern.
// Selection deliberately lives outside the store: the store persists to
// localStorage and an "open drawer" must not survive a reload.
const DrawerCtx = createContext(null)

export function DrawerProvider({ children }) {
  const [sel, setSel] = useState(null) // null | { type: 'opp'|'customer', id }
  const api = { sel, open: setSel, close: () => setSel(null) }
  return <DrawerCtx.Provider value={api}>{children}</DrawerCtx.Provider>
}

export const useDrawer = () => useContext(DrawerCtx)

export function DrawerHost() {
  const { sel, open, close } = useDrawer()
  const loc = useLocation()
  const nav = useNavigate()

  // Navigating away (e.g. opening the workbook from inside the panel) closes
  // the drawer, same as the formula bar clears its selection per route.
  useEffect(() => { close() }, [loc.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sel) return
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the last selection so the slide-out transition still has content.
  const last = useRef(null)
  if (sel) last.current = sel
  const shown = sel || last.current

  return (
    <>
      <div className={`drawer-backdrop ${sel ? 'open' : ''}`} onClick={close} />
      <div className={`drawer ${sel ? 'open' : ''}`}>
        {shown && (
          <>
            <div className="drawer-head">
              <span>{shown.type === 'opp' ? `${shown.id} — details` : shown.id}</span>
              {shown.type === 'opp' && (
                <button className="drawer-x" style={{ marginLeft: 'auto' }}
                  onClick={() => nav(`/opp/${shown.id}`)} title="Full lifecycle workbench — 11 tabs">
                  Open workbench
                </button>
              )}
              <button className="drawer-x" style={shown.type === 'opp' ? { marginLeft: 0 } : undefined}
                onClick={close} title="Close (Esc)">✕</button>
            </div>
            {shown.type === 'opp'
              ? <OppPanel oppId={shown.id} />
              : <CustomerPanel name={shown.id} openDrawer={open} />}
          </>
        )}
      </div>
    </>
  )
}

function CustomerPanel({ name, openDrawer }) {
  const store = useStore()
  const c = store.customers.find(x => x.name === name)
  const opps = store.opportunities.filter(o => o.sellTo === name)
  if (!c) return <div className="drawer-body"><p className="hint">Customer not found.</p></div>
  return (
    <div className="drawer-body">
      <div className="drawer-form">
        <div className="fgroup">Customer</div>
        <div className="dgrid2">
          <div><label>Name</label><div className="ro">{c.name}</div></div>
          <div><label>Category</label><div className="ro">{c.category}</div></div>
          <div>
            <label>Status</label>
            <div><span className={`pill ${c.status}`}>{c.status}</span></div>
          </div>
          <div><label>KYC</label><div className="ro">{c.kyc}</div></div>
          <div><label>Payment pattern</label><div className="ro">{c.payment}</div></div>
        </div>
        <p className="hint">Status comes from the accounting upload — changes need AH / BU head approval.</p>

        <div className="fgroup">Opportunities ({opps.length})</div>
        {opps.length ? (
          <table className="sheet">
            <thead><tr><th>Opp ID</th><th>Description</th><th>Stage</th></tr></thead>
            <tbody>
              {opps.map(o => (
                <tr key={o.id} className="rowclick" onClick={() => openDrawer({ type: 'opp', id: o.id })}>
                  <td className="oppid">{o.id}</td>
                  <td title={o.oppName}>{o.oppName.length > 42 ? o.oppName.slice(0, 42) + '…' : o.oppName}</td>
                  <td>{o.status === 'Closed' ? o.stage : `Open — ${o.stage}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="hint">No opportunities for this customer yet.</p>}
      </div>
    </div>
  )
}
