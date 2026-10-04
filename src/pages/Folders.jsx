import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { SUBFOLDERS, displayOpportunityId } from '../seed.js'
import { stageClass, displayRole } from '../utils.js'
import * as filestore from '../filestore.js'
import { getConfig } from '../sharepoint.js'
import { Icon } from '../icons.jsx'
import { PromptModal } from '../ui.jsx'

// The client's four real SharePoint status folders and their Excel-ish colors.
const OPEN_FOLDER = { fill: 'var(--amber-fill)', stroke: 'var(--amber-text)' }
const BLUE_FOLDER = { fill: 'var(--primary-soft)', stroke: 'var(--primary-deep)' }

function FolderIcon({ cls = 'open', size = 44, pathStyle }) {
  return (
    <svg className={`folder-icon ${cls}`} width={size} height={size * 0.78}
      viewBox="0 0 44 34" aria-hidden="true">
      <path style={pathStyle} d="M2 6.5 Q2 4 4.5 4 H15.5 L19 8 H39.5 Q42 8 42 10.5 V29.5 Q42 32 39.5 32 H4.5 Q2 32 2 29.5 Z" />
    </svg>
  )
}

// SharePoint folder group: stage Won → WON; stage Lost or Closed non-won → Closed; else Open.
const groupFor = o => (o.stage === 'Won' ? 'WON' : (o.stage === 'Lost' || o.status === 'Closed') ? 'Closed' : 'Open')

function SyncPill({ sync, style }) {
  if (!sync || !sync.state) return null
  const tone = sync.state === 'synced' ? 'conf-hi' : sync.state === 'error' ? 'conf-lo' : 'grey'
  const title = sync.state === 'synced' ? 'Folder synced to SharePoint'
    : sync.state === 'error' ? `SharePoint sync error: ${sync.error || sync.message || 'unknown'}`
    : 'Local only — not yet synced to SharePoint'
  return <span className={`chip ${tone}`} title={title} style={style}>SP</span>
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
  const files = opp ? (store.files?.[opp.id] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))) : null
  const subNames = files ? Object.keys(files) : []
  const subfolder = sub && subNames.includes(sub) ? sub : null

  const disarm = id => () => { if (confirmDel === id) setConfirmDel(null) }

  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [cloudErr, setCloudErr] = useState('')
  const [prompt, setPrompt] = useState(null)
  const backend = filestore.activeBackend()
  const spConnected = backend === 'sharepoint'
  // Cloud deletes run best-effort behind the store update; a failure surfaces
  // in the explorer bar but never blocks the UI.
  const cloud = fn => { if (backend !== 'mock') fn().catch(e => setCloudErr(`Cloud delete failed: ${e.message}`)) }

  // Cloud-backed files are the source of truth — merge the listing into the
  // local metadata cache so the subfolder views survive a reload.
  useEffect(() => {
    if (!opp || !['sharepoint', 'supabase'].includes(filestore.activeBackend())) return
    let alive = true
    filestore.listOppFiles(opp).then(map => {
      if (!alive || !map) return
      Object.entries(map).forEach(([sf, rows]) => {
        const have = ((store.files?.[opp.id] || {})[sf] || []).map(f => f.name)
        rows.forEach(r => { if (!have.includes(r.name)) store.addFile(opp.id, sf, r) })
      })
    }).catch(e => { if (alive) setCloudErr(e.message) })
    return () => { alive = false }
  }, [oppId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onUpload = async e => {
    const picked = [...e.target.files]
    e.target.value = ''
    setCloudErr(''); setBusy(true)
    for (const f of picked) {
      try {
        const rec = await filestore.uploadOppFile(opp, subfolder, f)
        store.addFile(opp.id, subfolder, rec)
      } catch (ex) {
        setCloudErr(ex.message)
      }
    }
    setBusy(false)
  }

  const addMockFile = () => {
    setPrompt({ kind: 'file', title: 'Add mock file', message: 'Enter the file name to add to this folder.', defaultValue: 'Customer_Spec.pdf' })
  }
  const savePrompt = name => {
    setPrompt(null)
    if (!name?.trim()) return
    if (prompt?.kind === 'folder') {
      store.addSubfolder(opp.id, name.trim())
      return
    }
    store.addFile(oppId, subfolder, {
      name: name.trim(), date: new Date().toISOString().slice(0, 10), size: `${Math.ceil(Math.random() * 900) + 90} KB`,
    })
  }

  const openSupabaseFile = async (file, event) => {
    event.preventDefault()
    event.stopPropagation()
    const tab = window.open('', '_blank', 'noopener')
    try {
      const found = await filestore.getOppFile(opp, subfolder, file.name)
      if (!found?.blob) throw new Error('The file could not be loaded.')
      const url = URL.createObjectURL(found.blob)
      if (tab) tab.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      if (tab) tab.close()
      setCloudErr(error.message)
    }
  }

  const addSubfolder = () => {
    setPrompt({ kind: 'folder', title: 'Create subfolder', message: 'Enter a name for the new subfolder.', defaultValue: 'Site Photos' })
  }

  // Root: the "Sales - Opportunities" wall, grouped by the four SharePoint status folders
  if (!opp) {
    const cfg = spConnected ? getConfig() : null
    const newestFirst = [...store.opportunities].sort((a, b) => b.id.localeCompare(a.id))
    const sections = [
      { label: 'Open', opps: newestFirst.filter(o => groupFor(o) === 'Open'), cls: 'open', pathStyle: OPEN_FOLDER },
      { label: 'WON', opps: newestFirst.filter(o => groupFor(o) === 'WON'), cls: 'won' },
      { label: 'Closed', opps: newestFirst.filter(o => groupFor(o) === 'Closed'), cls: 'lost' },
    ].filter(s => s.opps.length)
    // Deleted opps whose SharePoint folder was preserved (moved, never deleted).
    const notInList = Object.entries(store.spSync || {})
      .filter(([, e]) => e && e.folder === 'Not In Opp List')
      .sort(([a], [b]) => b.localeCompare(a))
    return (
      <div className="page">
        <h2 className="workspace-page-title"><Icon name="folder" size={18} /> Documents</h2>
        <div className="explorer-bar">
          <FolderIcon size={18} />
          {spConnected ? (
            <>
              <Link to="/folders">{cfg.siteHostname}</Link> › {cfg.sitePath} ›{' '}
              <b>{cfg.rootFolder || 'Opportunities'}</b>
            </>
          ) : (
            <>
              <Link to="/folders">OneDrive - Modae Private Limited</Link> ›{' '}
              <b>Sales - Opportunities</b>
            </>
          )}
          <span className="spacer" style={{ flex: 1 }} />
          {cloudErr && <span className="hint" style={{ color: 'var(--lost-text)' }}>{cloudErr}</span>}
          <button onClick={() => nav('/new')} title="Folders are 1:1 with opportunities — creating one goes through the intake form">
            ＋ New folder
          </button>
          <span className="hint">{newestFirst.length} items</span>
        </div>
        <div className="legend">
          <span><FolderIcon size={16} pathStyle={OPEN_FOLDER} /> Open</span>
          <span><FolderIcon cls="won" size={16} /> WON</span>
          <span><FolderIcon cls="lost" size={16} /> Closed</span>
          {notInList.length > 0 && <span><FolderIcon size={16} pathStyle={BLUE_FOLDER} /> Not In Opp List</span>}
          <span className="hint">
            One folder per opportunity, created automatically on intake submit.
            {spConnected
              ? ' SharePoint folders are retained as workspace records.'
              : ' Opportunity records are retained in the workspace.'}
          </span>
        </div>
        {sections.map(({ label, opps, cls, pathStyle }) => (
          <section key={label}>
            <div className="folder-section-head">{label} ({opps.length})</div>
            <div className="folder-grid">
              {opps.map(o => (
                <div className="folder-card" key={o.id} onClick={() => nav(`/folders/${o.id}`)}
                  onMouseLeave={disarm(o.id)} title={o.oppName}>
                  <SyncPill sync={(store.spSync || {})[o.id]} style={{ position: 'absolute', top: 3, left: 3 }} />
                  <FolderIcon cls={cls} pathStyle={pathStyle} />
                <div className="fname">{displayOpportunityId(o.id)}</div>
                  <div className="fmeta">{o.sellTo}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {notInList.length > 0 && (
          <section>
            <div className="folder-section-head">Not In Opp List ({notInList.length})</div>
            <div className="folder-grid">
              {notInList.map(([id, e]) => (
                <div className="folder-card" key={id}
                  onClick={e.webUrl ? () => window.open(e.webUrl, '_blank', 'noopener') : undefined}
                  title={e.webUrl ? `${id} — open the preserved SharePoint folder` : `${id} — folder preserved in SharePoint`}>
                  <FolderIcon pathStyle={BLUE_FOLDER} />
                  <div className="fname">{id}</div>
                  <div className="fmeta">deleted opp · folder preserved{e.ts ? ` · ${String(e.ts).slice(0, 10)}` : ''}</div>
                </div>
              ))}
            </div>
          </section>
        )}
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
          <Link to={`/folders/${opp.id}`}>{displayOpportunityId(opp.id)}</Link> ›
          <b>{subfolder}</b>
          <span style={{ flex: 1 }} />
          {cloudErr && <span className="hint" style={{ color: 'var(--lost-text)' }}>{cloudErr}</span>}
          {backend !== 'mock' ? (
            <>
              <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={onUpload} />
              <button onClick={() => fileInput.current?.click()} disabled={busy}>
                <Icon name="upload" size={13} /> {busy ? 'Uploading…' : 'Upload'}
              </button>
            </>
          ) : (
            <button onClick={addMockFile}><Icon name="upload" size={13} /> Upload (mock)</button>
          )}
        </div>
        <div className="sheet-wrap sheet-wrap-fill">
          <table className="sheet">
            <thead><tr><th>Name</th><th>Date modified</th><th>Size</th><th style={{ width: 60 }}></th></tr></thead>
            <tbody>
              {subfolder === 'Proposal' && !(files.Proposal || []).some(fl => fl.name.endsWith('.xlsx')) && (
                <tr onClick={() => nav(`/proposal/${opp.id}`)} style={{ cursor: 'pointer' }} title="Open the proposal workbook">
                  <td><Icon name="fileSheet" size={13} /> <b>{opp.id} Proposal Workbook.xlsx</b> <span className="hint">Cover Letter · Signal List · Rack Layout · Priced BoQ</span></td>
                  <td>{opp.lastUpdated}</td><td>247 KB</td><td></td>
                </tr>
              )}
              {(files[subfolder] || []).map(fl => {
                const isWorkbook = subfolder === 'Proposal' && fl.name.endsWith('.xlsx')
                const href = fl.webUrl || fl.url
                const delId = `${opp.id}/${subfolder}/${fl.name}`
                return (
                  <tr key={fl.name} onClick={isWorkbook ? () => nav(`/proposal/${opp.id}`) : undefined}
                    onMouseLeave={disarm(delId)}
                    style={isWorkbook ? { cursor: 'pointer' } : undefined}
                    title={isWorkbook ? 'Open the proposal workbook' : fl.webUrl ? 'Opens in SharePoint' : undefined}>
                    <td>
                      <Icon name={isWorkbook ? 'fileSheet' : 'fileText'} size={13} />{' '}
                      {isWorkbook ? <b>{fl.name}</b>
                        : href ? <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{fl.name}</a>
                        : backend === 'supabase' ? <a href="#" onClick={e => openSupabaseFile(fl, e)}>{fl.name}</a>
                        : fl.name}
                    </td>
                    <td>{fl.date}</td><td>{fl.size}</td>
                    <td style={{ textAlign: 'center' }}>
                      <DeleteButton id={delId} armed={confirmDel === delId} onArm={setConfirmDel}
                        onDelete={() => {
                          setConfirmDel(null)
                          cloud(() => filestore.deleteOppFile(opp, subfolder, fl))
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
      {prompt && <PromptModal title={prompt.title} message={prompt.message} defaultValue={prompt.defaultValue}
        confirmLabel={prompt.kind === 'file' ? 'Add file' : 'Create folder'} onClose={() => setPrompt(null)} onSubmit={savePrompt} />}
      <div className="explorer-bar">
        <FolderIcon cls={stageClass(opp)} size={18} />
        <Link to="/folders">Sales - Opportunities</Link> ›
        <b>{displayOpportunityId(opp.id)}</b>
        <SyncPill sync={(store.spSync || {})[opp.id]} />
        <span style={{ flex: 1 }} />
        {cloudErr && <span className="hint" style={{ color: 'var(--lost-text)' }}>{cloudErr}</span>}
        <button onClick={addSubfolder}>＋ New subfolder</button>
        <span className={`pill ${opp.stage === 'Won' ? 'won' : opp.stage === 'Lost' ? 'lost' : 'Blue'}`}>
          {opp.status === 'Closed' ? opp.stage : 'Open — ' + opp.stage}
        </span>
      </div>
      <h2>{opp.oppName}</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        {opp.sellTo} · EUC: {opp.eucName} ({opp.eucLocation}) · Owner {displayRole(opp.owner)}
      </div>
      <div className="folder-grid">
        {subNames.map(sf => {
          const count = (files[sf] || []).length + (sf === 'Proposal' && !(files.Proposal || []).some(fl => fl.name.endsWith('.xlsx')) ? 1 : 0)
          return (
            <div className="folder-card" key={sf} onClick={() => nav(`/folders/${opp.id}/${encodeURIComponent(sf)}`)}
              onMouseLeave={disarm(`${opp.id}:${sf}`)}>
              <DeleteButton id={`${opp.id}:${sf}`} armed={confirmDel === `${opp.id}:${sf}`} onArm={setConfirmDel}
                onDelete={() => {
                  setConfirmDel(null)
                  if (backend === 'supabase') cloud(() => filestore.removeOppPrefix(opp.id, sf))
                  store.deleteSubfolder(opp.id, sf)
                }}
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
          <Link to={`/proposal/${opp.id}`}>open {displayOpportunityId(opp.id)} Proposal Workbook.xlsx ▸</Link>
        </div>
      )}
    </div>
  )
}
