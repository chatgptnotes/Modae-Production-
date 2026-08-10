import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { SUBFOLDERS } from '../seed.js'
import { stageClass } from '../utils.js'
import { supabase, uploadFile, removePaths, removePrefix } from '../supabase.js'

function FolderIcon({ cls = 'open', size = 44 }) {
  return (
    <svg className={`folder-icon ${cls}`} width={size} height={size * 0.78}
      viewBox="0 0 44 34" aria-hidden="true">
      <path d="M2 6.5 Q2 4 4.5 4 H15.5 L19 8 H39.5 Q42 8 42 10.5 V29.5 Q42 32 39.5 32 H4.5 Q2 32 2 29.5 Z" />
    </svg>
  )
}

// Two-step inline delete: first click arms ("Delete?"), second click fires.
// Mouse leaving the card disarms. Avoids blocking browser confirm() dialogs.
function DeleteButton({ id, armed, onArm, onDelete, title }) {
  return (
    <button className={`folder-del ${armed ? 'arm' : ''}`}
      title={armed ? title : 'Delete'}
      onClick={e => { e.stopPropagation(); armed ? onDelete() : onArm(id) }}>
      {armed ? 'Delete?' : '✕'}
    </button>
  )
}

export default function Folders() {
  const store = useStore()
  const { oppId, sub } = useParams()
  const nav = useNavigate()
  const [confirmDel, setConfirmDel] = useState(null) // id of the item armed for deletion
  // The same component instance serves every /folders route — an armed delete
  // must never survive navigation and pre-arm an identically-named item elsewhere.
  useEffect(() => { setConfirmDel(null) }, [oppId, sub])

  const opp = oppId ? store.opportunities.find(o => o.id === oppId) : null
  const files = opp ? (store.files[opp.id] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))) : null
  const subNames = files ? Object.keys(files) : []
  const subfolder = sub && subNames.includes(sub) ? sub : null

  const disarm = id => () => { if (confirmDel === id) setConfirmDel(null) }

  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [cloudErr, setCloudErr] = useState('')
  // Cloud deletes run best-effort behind the store update; a failure surfaces
  // in the explorer bar but never blocks the UI.
  const cloud = fn => { if (supabase) fn().catch(e => setCloudErr(`Cloud delete failed: ${e.message}`)) }

  const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

  const onUpload = async e => {
    const picked = [...e.target.files]
    e.target.value = ''
    setCloudErr(''); setBusy(true)
    for (const f of picked) {
      try {
        const path = `${opp.id}/${subfolder}/${f.name}`
        const url = await uploadFile(path, f)
        store.addFile(opp.id, subfolder, {
          name: f.name, date: new Date().toISOString().slice(0, 10), size: fmtSize(f.size), url, path,
        })
      } catch (ex) {
        setCloudErr(`Upload of ${f.name} failed: ${ex.message}`)
      }
    }
    setBusy(false)
  }

  const addMockFile = () => {
    const name = prompt('File name to upload (mock):', 'Customer_Spec.pdf')
    if (!name) return
    store.addFile(oppId, subfolder, {
      name, date: new Date().toISOString().slice(0, 10), size: `${Math.ceil(Math.random() * 900) + 90} KB`,
    })
  }

  const addSubfolder = () => {
    const name = prompt('New subfolder name:', 'Site Photos')
    if (!name || !name.trim()) return
    store.addSubfolder(opp.id, name.trim())
  }

  // Root: the OneDrive "Sales - Opportunities" wall of folders
  if (!opp) {
    const newestFirst = [...store.opportunities].sort((a, b) => b.id.localeCompare(a.id))
    const sections = [
      ['Open', newestFirst.filter(o => stageClass(o) === 'open')],
      ['Won', newestFirst.filter(o => stageClass(o) === 'won')],
      ['Lost', newestFirst.filter(o => stageClass(o) === 'lost')],
    ].filter(([, opps]) => opps.length)
    return (
      <div className="page">
        <div className="explorer-bar">
          <FolderIcon size={18} />
          <Link to="/folders">OneDrive - ModAE India Pvt Ltd</Link> ›
          <b>Sales - Opportunities</b>
          <span className="spacer" style={{ flex: 1 }} />
          <button onClick={() => nav('/new')} title="Folders are 1:1 with opportunities — creating one goes through the intake form">
            ＋ New folder
          </button>
          <span className="hint">{newestFirst.length} items</span>
        </div>
        <div className="legend">
          <span><FolderIcon cls="won" size={16} /> Won</span>
          <span><FolderIcon cls="lost" size={16} /> Lost</span>
          <span><FolderIcon cls="open" size={16} /> Open</span>
          <span className="hint">One folder per opportunity, created automatically on intake submit. Deleting a folder also removes its tracker row.</span>
        </div>
        {sections.map(([label, opps]) => (
          <section key={label}>
            <div className="folder-section-head">{label} ({opps.length})</div>
            <div className="folder-grid">
              {opps.map(o => (
                <div className="folder-card" key={o.id} onClick={() => nav(`/folders/${o.id}`)}
                  onMouseLeave={disarm(o.id)} title={o.oppName}>
                  <DeleteButton id={o.id} armed={confirmDel === o.id} onArm={setConfirmDel}
                    onDelete={() => { setConfirmDel(null); cloud(() => removePrefix(o.id)); store.deleteOpportunity(o.id) }}
                    title={`Permanently delete ${o.id} — folder, files, proposal AND its tracker row`} />
                  <FolderIcon cls={stageClass(o)} />
                  <div className="fname">{o.id}</div>
                  <div className="fmeta">{o.sellTo}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  // Inside a subfolder: file list
  if (subfolder) {
    return (
      <div className="page">
        <div className="explorer-bar">
          <FolderIcon size={18} />
          <Link to="/folders">Sales - Opportunities</Link> ›
          <Link to={`/folders/${opp.id}`}>{opp.id}</Link> ›
          <b>{subfolder}</b>
          <span style={{ flex: 1 }} />
          {cloudErr && <span className="hint" style={{ color: 'var(--lost-text)' }}>{cloudErr}</span>}
          {supabase ? (
            <>
              <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={onUpload} />
              <button onClick={() => fileInput.current.click()} disabled={busy}>
                {busy ? 'Uploading…' : '⬆ Upload'}
              </button>
            </>
          ) : (
            <button onClick={addMockFile}>⬆ Upload (mock)</button>
          )}
        </div>
        <div className="sheet-wrap" style={{ maxWidth: 720 }}>
          <table className="sheet">
            <thead><tr><th>Name</th><th>Date modified</th><th>Size</th><th style={{ width: 60 }}></th></tr></thead>
            <tbody>
              {subfolder === 'Proposal' && !(files.Proposal || []).some(fl => fl.name.endsWith('.xlsx')) && (
                <tr onClick={() => nav(`/proposal/${opp.id}`)} style={{ cursor: 'pointer' }} title="Open the proposal workbook">
                  <td>📊 <b>{opp.id} Proposal Workbook.xlsx</b> <span className="hint">Cover Letter · Signal List · Rack Layout · Priced BoQ</span></td>
                  <td>{opp.lastUpdated}</td><td>247 KB</td><td></td>
                </tr>
              )}
              {(files[subfolder] || []).map(fl => {
                const isWorkbook = subfolder === 'Proposal' && fl.name.endsWith('.xlsx')
                const delId = `${opp.id}/${subfolder}/${fl.name}`
                return (
                  <tr key={fl.name} onClick={isWorkbook ? () => nav(`/proposal/${opp.id}`) : undefined}
                    onMouseLeave={disarm(delId)}
                    style={isWorkbook ? { cursor: 'pointer' } : undefined}
                    title={isWorkbook ? 'Open the proposal workbook' : undefined}>
                    <td>
                      {isWorkbook ? '📊 ' : '📄 '}
                      {isWorkbook ? <b>{fl.name}</b>
                        : fl.url ? <a href={fl.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{fl.name}</a>
                        : fl.name}
                    </td>
                    <td>{fl.date}</td><td>{fl.size}</td>
                    <td style={{ textAlign: 'center' }}>
                      <DeleteButton id={delId} armed={confirmDel === delId} onArm={setConfirmDel}
                        onDelete={() => {
                          setConfirmDel(null)
                          if (fl.path) cloud(() => removePaths([fl.path]))
                          store.deleteFile(opp.id, subfolder, fl.name)
                        }}
                        title={`Permanently delete ${fl.name}`} />
                    </td>
                  </tr>
                )
              })}
              {!(files[subfolder] || []).length && subfolder !== 'Proposal' && (
                <tr><td colSpan={4} className="hint">This folder is empty.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Opportunity folder: subfolders (standard three + any custom) + workbook shortcut
  return (
    <div className="page">
      <div className="explorer-bar">
        <FolderIcon cls={stageClass(opp)} size={18} />
        <Link to="/folders">Sales - Opportunities</Link> ›
        <b>{opp.id}</b>
        <span style={{ flex: 1 }} />
        <button onClick={addSubfolder}>＋ New subfolder</button>
        <span className={`pill ${opp.stage === 'Won' ? 'won' : opp.stage === 'Lost' ? 'lost' : 'Blue'}`}>
          {opp.status === 'Closed' ? opp.stage : 'Open — ' + opp.stage}
        </span>
      </div>
      <h2>{opp.oppName}</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        {opp.sellTo} · EUC: {opp.eucName} ({opp.eucLocation}) · Owner {opp.owner}
      </div>
      <div className="folder-grid" style={{ maxWidth: 640 }}>
        {subNames.map(sf => {
          const count = (files[sf] || []).length + (sf === 'Proposal' && !(files.Proposal || []).some(fl => fl.name.endsWith('.xlsx')) ? 1 : 0)
          return (
            <div className="folder-card" key={sf} onClick={() => nav(`/folders/${opp.id}/${encodeURIComponent(sf)}`)}
              onMouseLeave={disarm(`${opp.id}:${sf}`)}>
              <DeleteButton id={`${opp.id}:${sf}`} armed={confirmDel === `${opp.id}:${sf}`} onArm={setConfirmDel}
                onDelete={() => { setConfirmDel(null); cloud(() => removePrefix(`${opp.id}/${sf}`)); store.deleteSubfolder(opp.id, sf) }}
                title={count ? `Permanently delete ${sf} and its ${count} file(s)` : `Delete empty folder ${sf}`} />
              <FolderIcon />
              <div className="fname">{sf}</div>
              <div className="fmeta">{count} file(s)</div>
            </div>
          )
        })}
        <div className="folder-card new-folder" onClick={addSubfolder} title="Create a subfolder">
          <span className="new-folder-plus">＋</span>
          <div className="fname">New subfolder</div>
        </div>
      </div>
      {subNames.includes('Proposal') && (
        <div className="hint" style={{ marginTop: 10 }}>
          The proposal workbook lives inside the <Link to={`/folders/${opp.id}/Proposal`}>Proposal</Link> folder —{' '}
          <Link to={`/proposal/${opp.id}`}>open {opp.id} Proposal Workbook.xlsx ▸</Link>
        </div>
      )}
    </div>
  )
}
