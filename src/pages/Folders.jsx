import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import { SUBFOLDERS, displayOpportunityId } from '../seed.js'
import { displayRole } from '../utils.js'
import * as filestore from '../filestore.js'
import { microsoftRequest } from '../microsoftApi.js'
import { matchOpportunityFolder } from '../sharepointFolderMatch.js'
import { Icon } from '../icons.jsx'
import { PromptModal } from '../ui.jsx'
import { useDocumentsNavigation } from '../ui/useDocumentsNavigation.js'

const SharePointFilePreview = React.lazy(() => import('../AttachmentViewer.jsx').then(module => ({ default: module.BlobAttachmentViewer })))

// SharePoint-inspired layered folders; business status remains visible in labels.
function FolderIcon({ cls = 'open', size = 44 }) {
  return (
    <svg className={`folder-icon ${cls}`} width={size} height={size * 0.78}
      viewBox="0 0 44 34" aria-hidden="true" focusable="false">
      <path className="folder-back" d="M2 7a3 3 0 0 1 3-3h10.5a3 3 0 0 1 2.1.9L21 8h18a3 3 0 0 1 3 3v17a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" />
      <path className="folder-front" d="M2 14a3 3 0 0 1 3-3h11.5a4 4 0 0 0 2.4-.8l2.2-1.6A3 3 0 0 1 22.9 8H39a3 3 0 0 1 3 3v17a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" />
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
      title={armed ? title : 'Delete'} aria-label={armed ? `Confirm: ${title}` : title}
      onClick={e => { e.stopPropagation(); armed ? onDelete() : onArm(id) }}>
      {armed ? 'Delete?' : '✕'}
    </button>
  )
}

function FolderSection({ label, count, tone, expanded, onToggle, children }) {
  const id = `documents-group-${label.replaceAll(' ', '-')}`
  return <section className="documents-section" aria-label={`${label} folders`}>
    <h2 className="documents-section-title"><button className="ghost documents-group-toggle" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
      <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={15} />
      {tone && <span className={`documents-dot ${tone}`} />}{label}<span>{count}</span>
    </button></h2>
    <div id={id} hidden={!expanded}>{children}</div>
  </section>
}

function SharePointDocuments({ store, search, statusFilter, sort, layout, collapsed, update, toggleGroup, pageRef }) {
  const [path, setPath] = useState(['Opportunities'])
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [preview, setPreview] = useState(null)
  const [openingFile, setOpeningFile] = useState('')
  useEffect(() => {
    let active = true
    setItems(null); setError('')
    microsoftRequest('status').then(result => {
      if (!result.documents) throw new Error('SharePoint documents are not configured yet.')
      return microsoftRequest('browseDocuments', { path: path.join('/') })
    }).then(result => { if (active) setItems(result.items || []) })
      .catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [path, refresh])
  const openFile = async item => {
    setOpeningFile(item.id)
    setFileError('')
    try {
      const response = await microsoftRequest('browseDocument', { path: path.join('/'), itemId: item.id }, { raw: true })
      setPreview({ filename: item.name, blob: await response.blob() })
    } catch (failure) {
      setFileError(failure.message)
    } finally {
      setOpeningFile('')
    }
  }
  const atRoot = path.length === 1
  const query = search.trim().toLowerCase()
  const folders = (items || []).filter(item => item.folder).map(item => ({ ...item,
    opportunity: atRoot ? matchOpportunityFolder(item.name, store.opportunities || []) : null,
  }))
  const filtered = folders.filter(item => !atRoot || [item.name, item.opportunity?.id, item.opportunity?.sellTo, item.opportunity?.oppName]
    .some(value => String(value || '').toLowerCase().includes(query)))
    .sort((a, b) => sort === 'customer' && atRoot
      ? (a.opportunity?.sellTo || a.name).localeCompare(b.opportunity?.sellTo || b.name) || b.name.localeCompare(a.name)
      : sort === 'ascending' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
  const groups = [
    { label: 'Open', cls: 'open' }, { label: 'WON', cls: 'won' },
    { label: 'Closed', cls: 'lost' }, { label: 'Unlinked', cls: 'preserved' },
  ]
  const sections = groups.map(group => ({ ...group,
    folders: filtered.filter(item => (item.opportunity ? groupFor(item.opportunity) : 'Unlinked') === group.label),
  })).filter(group => group.folders.length && (statusFilter === 'All' || statusFilter === group.label))
  const visibleCount = atRoot ? sections.reduce((sum, group) => sum + group.folders.length, 0) : folders.length + (items || []).filter(item => !item.folder).length
  const card = (item, cls = 'open') => {
    const status = item.opportunity ? groupFor(item.opportunity) : 'Unlinked'
    return <button className="document-folder documents-sharepoint-card" key={item.id} disabled={openingFile === item.id}
      onClick={() => item.folder ? setPath([...path, item.name]) : openFile(item)}
      title={item.opportunity ? `${item.name} · ${item.opportunity.sellTo || ''}` : item.name}>
      <span className="document-folder-main">{item.folder ? <FolderIcon cls={cls} size={58} /> : <Icon name="fileText" size={38} />}
        <span className="document-folder-name"><strong>{atRoot && item.opportunity ? displayOpportunityId(item.opportunity.id) : item.name}</strong>
          <span>{atRoot ? item.opportunity?.sellTo || 'No matching opportunity' : item.folder ? 'SharePoint folder' : 'SharePoint file'}</span></span>
      </span>
      <span className="document-folder-owner">{item.opportunity ? displayRole(item.opportunity.owner) : ''}</span>
      <span className={`document-folder-status ${cls}`}>{atRoot ? status === 'WON' ? 'Won' : status : item.folder ? 'Folder' : 'File'}</span>
      <span className="document-folder-tail"><Icon name="chevronRight" size={15} /></span>
    </button>
  }
  return <div className="page documents-page" ref={pageRef}>
    <h2 className="workspace-page-title workspace-page-title--topbar-duplicate"><Icon name="folder" size={18} /> Documents</h2>
    <nav className="documents-breadcrumb" aria-label="Folder path"><Icon name="cloud" size={17} />
      <span>WINTRACK</span>{path.map((name, index) => <React.Fragment key={`${index}:${name}`}><Icon name="chevronRight" size={14} />
        {index === path.length - 1 ? <span aria-current="page">{name}</span> : <button className="ghost" onClick={() => setPath(path.slice(0, index + 1))}>{name}</button>}
      </React.Fragment>)}
    </nav>
    <header className="documents-heading"><div><h1>{atRoot ? 'Opportunity folders' : path.at(-1)}</h1>
      <p>{atRoot ? 'Copied opportunity documents in SharePoint.' : 'Files in this SharePoint folder.'}</p></div>
      <div className="documents-heading-actions">{!atRoot && <button className="ghost" onClick={() => setPath(path.slice(0, -1))}>Back</button>}
        <button className="ghost" onClick={() => setRefresh(value => value + 1)}>Refresh</button>
      </div>
    </header>
    {atRoot && <div className="documents-sticky-controls"><div className="documents-toolbar">
      <label className="documents-search"><Icon name="search" size={18} /><input type="search" aria-label="Search opportunity folders"
        placeholder="Search by customer or opportunity" value={search} onChange={e => update({ search: e.target.value }, true)} name="folders-search-opportunity-folders" /></label>
      <label className="documents-sort">Sort by<select value={sort} onChange={e => update({ sort: e.target.value }, true)} aria-label="Sort folders" name="folders-sort-folders">
        <option value="id">Opportunity ID: descending</option><option value="ascending">Opportunity ID: ascending</option><option value="customer">Customer name</option>
      </select></label>
      <div className="documents-view" role="group" aria-label="Folder view">
        <button className="ghost" aria-label="Grid view" title="Grid view" aria-pressed={layout === 'grid'} onClick={() => update({ layout: 'grid' })}><Icon name="cards" size={17} /></button>
        <button className="ghost" aria-label="List view" title="List view" aria-pressed={layout === 'list'} onClick={() => update({ layout: 'list' })}><Icon name="list" size={18} /></button>
      </div>
    </div><div className="documents-filterbar"><div className="documents-filters" role="group" aria-label="Filter folders by status">
      {['All', ...groups.map(group => group.label)].map(label => <button className="ghost" key={label} aria-pressed={statusFilter === label}
        onClick={() => update({ statusFilter: label }, true)}>{label === 'WON' ? 'Won' : label} <span>{label === 'All' ? folders.length : folders.filter(item => (item.opportunity ? groupFor(item.opportunity) : 'Unlinked') === label).length}</span></button>)}
    </div><span className="documents-count" role="status">{visibleCount} {visibleCount === 1 ? 'folder' : 'folders'}</span></div></div>}
    {error && <div role="alert" className="documents-empty"><h2>Could not load SharePoint files</h2><p>{error}</p><button onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    {fileError && <p role="alert" className="documents-error">Could not preview this file: {fileError}</p>}
    {openingFile && <p role="status">Opening document preview…</p>}
    {!items && !error && <p role="status">Loading SharePoint files…</p>}
    {items && <div className={`documents-content documents-content--${layout}`}>
      {atRoot ? sections.map(({ label, folders: rows, cls }) => <FolderSection key={label} label={label === 'WON' ? 'Won' : label} count={rows.length} tone={cls}
        expanded={Boolean(query) || !collapsed.includes(label)} onToggle={() => toggleGroup(label)}>
        {layout === 'list' && <div className="documents-list-head" aria-hidden="true"><span>Name / customer</span><span>Owner</span><span>Status</span><span /></div>}
        <div className="documents-folders">{rows.map(item => card(item, cls))}</div>
      </FolderSection>) : <div className="documents-folders">{items.map(item => card(item))}</div>}
      {!visibleCount && <div className="documents-empty"><Icon name="folder" size={36} /><h2>{query && atRoot ? 'No matching folders' : 'No files in this SharePoint folder'}</h2>
        <p>{query && atRoot ? 'Try another customer name or opportunity ID.' : 'The copied folder is empty.'}</p>
        {atRoot && (query || statusFilter !== 'All') && <button onClick={() => update({ search: '', statusFilter: 'All' }, true)}>Clear filters</button>}</div>}
    </div>}
    {preview && <React.Suspense fallback={<p role="status">Preparing document preview…</p>}>
      <SharePointFilePreview blob={preview.blob} filename={preview.filename} onClose={() => setPreview(null)} />
    </React.Suspense>}
  </div>
}

export default function Folders() {
  const store = useStore()
  const { scope } = useWorkspaceView()
  const user = store.auth?.user?.id || store.auth?.user?.email || 'local'
  return <DocumentsBrowser key={`${user}:${scope}`} store={store} scope={scope} user={user} />
}

function DocumentsBrowser({ store, scope, user }) {
  const { oppId, sub } = useParams()
  const { search, statusFilter, sort, layout, collapsed, pageRef, update } = useDocumentsNavigation(user, scope)
  const toggleGroup = label => update({ collapsed: collapsed.includes(label) ? collapsed.filter(item => item !== label) : [...collapsed, label] })
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
  // Cloud deletes run best-effort behind the store update; a failure surfaces
  // in the explorer bar but never blocks the UI.
  const cloud = fn => { fn().catch(e => setCloudErr(`File delete failed: ${e.message}`)) }

  // Cloud-backed files are the source of truth — merge the listing into the
  // local metadata cache so the subfolder views survive a reload.
  useEffect(() => {
    if (!opp || !['sharepoint', 'microsoft', 'supabase'].includes(filestore.activeBackend())) return
    let alive = true
    filestore.listOppFiles(opp).then(map => {
      if (!alive || !map) return
      Object.entries(map).forEach(([sf, rows]) => {
        const have = ((store.files?.[opp.id] || {})[sf] || []).map(f => f.name)
        rows.forEach(r => { if (!have.includes(r.name) || r.backend === 'supabase') store.addFile(opp.id, sf, r) })
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
      const found = await filestore.getOppFile(opp, subfolder, file)
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

  if (!opp) return <SharePointDocuments store={store} search={search} statusFilter={statusFilter} sort={sort} layout={layout} collapsed={collapsed} update={update} toggleGroup={toggleGroup} pageRef={pageRef} />

  const folderPath = <nav className="documents-breadcrumb" aria-label="Folder path">
    <Link to="/folders">Opportunity folders</Link><Icon name="chevronRight" size={14} />
    {subfolder ? <><Link to={`/folders/${opp.id}`}>{displayOpportunityId(opp.id)} · {opp.sellTo}</Link><Icon name="chevronRight" size={14} /><span aria-current="page">{subfolder}</span></>
      : <span aria-current="page">{displayOpportunityId(opp.id)} · {opp.sellTo}</span>}
  </nav>
  const promptDialog = prompt && <PromptModal title={prompt.title} message={prompt.message} defaultValue={prompt.defaultValue}
    confirmLabel={prompt.kind === 'file' ? 'Add file' : 'Create folder'} onClose={() => setPrompt(null)} onSubmit={savePrompt} />

  // Inside a subfolder: file list
  if (subfolder) {
    return (
      <div className="page documents-page documents-detail" ref={pageRef}>
        {promptDialog}
        {folderPath}
        <header className="documents-heading documents-detail-heading">
          <div><h1>{subfolder}</h1><p>{opp.oppName || opp.sellTo}</p></div>
            <>
              <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={onUpload} name="folders-file" />
              <button onClick={() => fileInput.current?.click()} disabled={busy}>
                <Icon name="upload" size={13} /> {busy ? 'Uploading…' : 'Upload'}
              </button>
            </>
        </header>
        {cloudErr && <p role="alert" className="documents-error">{cloudErr}</p>}
        <div className="documents-file-list">
          <table className="sheet documents-file-table">
            <thead><tr><th>Name</th><th>Date modified</th><th>Size</th><th style={{ width: 70 }}><span className="documents-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {subfolder === 'Proposal' && !(files.Proposal || []).some(fl => fl.name.endsWith('.xlsx')) && (
                <tr>
                  <td><Icon name="fileSheet" size={13} /> <Link to={`/proposal/${opp.id}`}>{displayOpportunityId(opp.id)} Proposal Workbook.xlsx</Link> <span className="hint">Cover Letter · Signal List · Rack Layout · Priced BoQ</span></td>
                  <td>{opp.lastUpdated}</td><td>247 KB</td><td></td>
                </tr>
              )}
              {(files[subfolder] || []).map(fl => {
                const isWorkbook = subfolder === 'Proposal' && fl.name.endsWith('.xlsx')
                const href = ['supabase', 'microsoft'].includes(fl.backend) ? '' : fl.webUrl || fl.url || fl.dataUrl
                const delId = `${opp.id}/${subfolder}/${fl.name}`
                return (
                  <tr key={fl.name}
                    onMouseLeave={disarm(delId)}
                    title={isWorkbook ? 'Open the proposal workbook' : href?.startsWith('data:') ? 'Download attachment' : fl.webUrl ? 'Opens in SharePoint' : undefined}>
                    <td>
                      <Icon name={isWorkbook ? 'fileSheet' : 'fileText'} size={13} />{' '}
                      {isWorkbook ? <Link to={`/proposal/${opp.id}`}>{fl.name}</Link>
                        : href ? <a href={href} download={href.startsWith('data:') ? fl.name : undefined} target={href.startsWith('data:') ? undefined : '_blank'} rel="noreferrer" onClick={e => e.stopPropagation()}>{fl.name}</a>
                        : ['supabase', 'microsoft'].includes(fl.backend) || ['supabase', 'mock', 'microsoft'].includes(backend) ? <a href="#" onClick={e => openSupabaseFile(fl, e)}>{fl.name}</a>
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
                <tr><td colSpan={4}><div className="documents-empty"><Icon name="folder" size={36} /><h2>This folder is empty</h2><p>Use Upload to add documents to this folder.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Opportunity folder: subfolders (standard three + any custom) + workbook shortcut
  return (
    <div className="page documents-page documents-detail" ref={pageRef}>
      {promptDialog}
      {folderPath}
      <header className="documents-heading documents-detail-heading">
        <div><h1>{displayOpportunityId(opp.id)}</h1><p>{opp.oppName || opp.sellTo}</p></div>
        <button className="primary documents-create" onClick={addSubfolder}><Icon name="plus" size={17} /> New subfolder</button>
      </header>
      <div className="documents-detail-meta">
        <span>{opp.sellTo}</span><span>Owner: {displayRole(opp.owner)}</span>
        {opp.eucName && <span>EUC: {opp.eucName}{opp.eucLocation ? ` · ${opp.eucLocation}` : ''}</span>}
        <span className={`document-folder-status ${groupFor(opp) === 'WON' ? 'won' : groupFor(opp) === 'Closed' ? 'lost' : 'open'}`}>{groupFor(opp) === 'WON' ? 'Won' : groupFor(opp)}</span>
        <SyncPill sync={(store.spSync || {})[opp.id]} />
      </div>
      {cloudErr && <p role="alert" className="documents-error">{cloudErr}</p>}
      <div className="folder-grid">
        {subNames.map(sf => {
          const count = (files[sf] || []).length + (sf === 'Proposal' && !(files.Proposal || []).some(fl => fl.name.endsWith('.xlsx')) ? 1 : 0)
          return (
            <div className="folder-card" key={sf}
              onMouseLeave={disarm(`${opp.id}:${sf}`)}>
              <DeleteButton id={`${opp.id}:${sf}`} armed={confirmDel === `${opp.id}:${sf}`} onArm={setConfirmDel}
                onDelete={() => {
                  setConfirmDel(null)
                  if (backend === 'supabase') cloud(() => filestore.removeOppPrefix(opp.id, sf))
                  store.deleteSubfolder(opp.id, sf)
                }}
                title={count ? `Permanently delete ${sf} and its ${count} file(s)` : `Delete empty folder ${sf}`} />
              <Link className="documents-subfolder-link" to={`/folders/${opp.id}/${encodeURIComponent(sf)}`}>
                <FolderIcon /><span className="fname">{sf}</span><span className="fmeta">{count} {count === 1 ? 'file' : 'files'}</span>
              </Link>
            </div>
          )
        })}
        <button className="folder-card new-folder ghost" onClick={addSubfolder} title="Create a subfolder">
          <span className="new-folder-plus">＋</span>
          <span className="fname">New subfolder</span>
        </button>
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
