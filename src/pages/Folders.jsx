import React, { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { SUBFOLDERS } from '../seed.js'

export default function Folders() {
  const store = useStore()
  const { oppId } = useParams()
  const nav = useNavigate()
  const [subfolder, setSubfolder] = useState(null)

  const opp = oppId ? store.opportunities.find(o => o.id === oppId) : null
  const folderClass = o => (o.stage === 'Won' ? 'won' : o.stage === 'Lost' ? 'lost' : 'open')

  const addMockFile = () => {
    const name = prompt('File name to upload (mock):', 'Customer_Spec.pdf')
    if (!name) return
    store.addFile(oppId, subfolder, {
      name, date: new Date().toISOString().slice(0, 10), size: `${Math.ceil(Math.random() * 900) + 90} KB`,
    })
  }

  // Root: the OneDrive "Sales - Opportunities" wall of folders
  if (!opp) {
    const sorted = [...store.opportunities].sort((a, b) => a.id.localeCompare(b.id))
    return (
      <div className="page">
        <div className="explorer-bar">
          <span>📁</span>
          <a onClick={() => nav('/folders')}>OneDrive - ModAE India Pvt Ltd</a> ›
          <b>Sales - Opportunities</b>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="hint">{sorted.length} items</span>
        </div>
        <div className="legend">
          <span>🟩 Green = Won</span><span>🟥 Red = Lost</span><span>🟨 Standard = Open</span>
          <span className="hint">One folder per opportunity, created automatically on intake submit.</span>
        </div>
        <div className="folder-grid">
          {sorted.map(o => (
            <div className="folder-card" key={o.id} onClick={() => nav(`/folders/${o.id}`)} title={o.oppName}>
              <span className={`folder-icon ${folderClass(o)}`}>{o.stage === 'Won' ? '🟢' : o.stage === 'Lost' ? '🔴' : '📁'}</span>
              <div className="fname">{o.id}</div>
              <div className="fmeta">{o.sellTo}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const files = store.files[opp.id] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))

  // Inside a subfolder: file list
  if (subfolder) {
    return (
      <div className="page">
        <div className="explorer-bar">
          <span>📁</span>
          <a onClick={() => nav('/folders')}>Sales - Opportunities</a> ›
          <a onClick={() => setSubfolder(null)}>{opp.id}</a> ›
          <b>{subfolder}</b>
          <span style={{ flex: 1 }} />
          <button onClick={addMockFile}>⬆ Upload (mock)</button>
        </div>
        <div className="sheet-wrap" style={{ maxWidth: 720 }}>
          <table className="sheet">
            <thead><tr><th>Name</th><th>Date modified</th><th>Size</th></tr></thead>
            <tbody>
              {(files[subfolder] || []).map(fl => (
                <tr key={fl.name}><td>📄 {fl.name}</td><td>{fl.date}</td><td>{fl.size}</td></tr>
              ))}
              {!(files[subfolder] || []).length && (
                <tr><td colSpan={3} className="hint">This folder is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Opportunity folder: standard subfolders + shortcut to the proposal workbook
  return (
    <div className="page">
      <div className="explorer-bar">
        <span>📁</span>
        <a onClick={() => nav('/folders')}>Sales - Opportunities</a> ›
        <b>{opp.id}</b>
        <span style={{ flex: 1 }} />
        <span className={`pill ${opp.stage === 'Won' ? 'won' : opp.stage === 'Lost' ? 'lost' : 'Blue'}`}>
          {opp.status === 'Closed' ? opp.stage : 'Open — ' + opp.stage}
        </span>
      </div>
      <h2>{opp.oppName}</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        {opp.sellTo} · EUC: {opp.eucName} ({opp.eucLocation}) · Owner {opp.owner}
      </div>
      <div className="folder-grid" style={{ maxWidth: 640 }}>
        {SUBFOLDERS.map(sf => (
          <div className="folder-card" key={sf} onClick={() => setSubfolder(sf)}>
            <span className="folder-icon">📁</span>
            <div className="fname">{sf}</div>
            <div className="fmeta">{(files[sf] || []).length} file(s)</div>
          </div>
        ))}
        <Link className="folder-card" to={`/proposal/${opp.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="folder-icon">📊</span>
          <div className="fname">Proposal Workbook</div>
          <div className="fmeta">Cover Letter · Signal List · Rack Layout · Priced BoQ</div>
        </Link>
      </div>
    </div>
  )
}
