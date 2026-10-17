import React, { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LEAD_SOURCES } from '../seed.js'
import { useStore } from '../store.jsx'
import { isLocalDemoSession } from '../authMode.js'
import { opportunityOwnerFor } from '../leadRules.js'
import { isNonSalesUser, canPerform } from '../accessPolicy.js'
import { displayRole } from '../utils.js'
import { isActiveUser } from '../userManagement.js'
import { supabase } from '../supabase.js'
import { workspaceDeploymentHeaders } from '../workspaceDeployment.js'
import PersonalSettings from './PersonalSettings.jsx'
import './nonSalesWorkspace.css'

const empty = () => ({ customerName: '', contactPerson: '', contactEmail: '', contactPhone: '', location: '', region: '', subject: '', body: '', assignedOwner: '', forwardingDepartment: '', source: '' })
async function request(method, body, generation) {
  const { data } = await supabase?.auth.getSession() || {}
  if (!data?.session?.access_token) throw new Error('Sign in to the shared workspace to submit a lead.')
  const response = await fetch('/api/lead-intake', { method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...workspaceDeploymentHeaders(),
    ...(body ? { 'Content-Type': 'application/json', 'x-workspace-generation': generation } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not submit the lead. Please retry.')
  return result
}
function NewLead() {
  const store = useStore()
  const local = !supabase || isLocalDemoSession(store)
  const [draft, setDraft] = useState(empty)
  const [files, setFiles] = useState([])
  const [assignees, setAssignees] = useState([])
  const [generation, setGeneration] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const [reload, setReload] = useState(0)
  const submissionId = useRef(null)
  const fileInput = useRef(null)
  useEffect(() => {
    let active = true
    if (local) {
      setAssignees([...new Map((store.users || []).filter(user => isActiveUser(user) && !isNonSalesUser(user) && canPerform(user, 'opportunities.create', store.config) && !['SUPER','ADMIN','CUST'].includes(user.role)).map(user => [user.role, { id: user.role, name: user.name }])).values()])
      setGeneration('local'); return () => { active = false }
    }
    request('GET').then(data => { if (active) { setAssignees(data.assignees); setGeneration(data.generation); setError('') } })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [reload])
  useEffect(() => {
    const warn = event => { if (Object.values(draft).some(Boolean) || files.length) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draft, files])
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setReceipt('')
    try {
      if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 6 * 1024 * 1024) throw new Error('Attach up to ten files, totalling 6 MB or less.')
      if (!draft.subject.trim() && !draft.body.trim() && !files.length) throw new Error('Enter enquiry details or attach a document.')
      const attachments = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result).replace(/^data:;base64,/, 'data:application/octet-stream;base64,') })
        reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please select it again.`))
        reader.readAsDataURL(file)
      })))
      submissionId.current ||= `LD-${crypto.randomUUID()}`
      let saved
      if (local) {
        const assignedOwner = draft.assignedOwner || opportunityOwnerFor({ location: draft.location, region: draft.region, config: store.config, fallback: 'LJS' })
        saved = { id: submissionId.current }
        store.addLead({ ...draft, ...saved, attachments, assignedOwner, suggestedOwner: assignedOwner, sellTo: draft.customerName, sellToCustomerLocation: draft.location, from: draft.contactEmail, sender: draft.contactPerson || store.auth?.user?.name, submittedBy: store.auth?.user?.id, forwardedBy: store.auth?.user?.name, status: 'New', source: draft.source || 'Internal / Non-sales Enquiry', channel: draft.source || 'Internal', mailbox: true, ts: new Date().toISOString() })
      } else saved = await request('POST', { ...draft, id: submissionId.current, attachments }, generation)
      setReceipt(`Lead ${saved.id} submitted to the sales team.`)
      submissionId.current = null; setDraft(empty()); setFiles([])
      if (fileInput.current) fileInput.current.value = ''
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <section className="page non-sales-intake">
    <h1>New Lead</h1>{local && <p>Local demo — submissions stay on this browser.</p>}<p>Share an enquiry with the sales team. Select a salesperson or leave it to the routing rules.</p>
    {receipt && <p role="status">{receipt}</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="non-sales-fields">
          <label>Lead source<select name="non-sales-source" value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}><option value="">Select source</option>{LEAD_SOURCES.map(source => <option key={source}>{source}</option>)}</select></label>
          <label>Customer name<input name="non-sales-customer-name" maxLength={500} value={draft.customerName} onChange={event => setDraft({ ...draft, customerName: event.target.value })} /></label>
          <label>Assigned salesperson<select name="non-sales-assigned-owner" value={draft.assignedOwner} onChange={event => setDraft({ ...draft, assignedOwner: event.target.value })}><option value="">Use routing rules ({displayRole('LJS')} if unmatched)</option>{assignees.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          {[['contactPerson','Contact person'],['contactEmail','Contact email'],['contactPhone','Contact phone'],['location','Customer location'],['region','Region'],['forwardingDepartment','Your department']].map(([key,label]) => <label key={key}>{label}<input name={`non-sales-${key}`} type={key === 'contactEmail' ? 'email' : 'text'} maxLength={500} value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        </div>
        <label>Subject<input name="non-sales-subject" maxLength={500} value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} /></label>
        <label>Enquiry details<textarea name="non-sales-enquiry-details" rows={8} maxLength={50000} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
        <label>Attachments<input name="non-sales-attachments" ref={fileInput} type="file" multiple onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
        <p>Up to ten files, 6 MB total. {files.map(file => file.name).join(', ')}</p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={generation === null}>{busy ? 'Submitting…' : 'Submit lead'}</button>
        {generation === null && <button type="button" onClick={() => setReload(value => value + 1)}>Reload form access</button>}
      </fieldset>
    </form>
  </section>
}
export default function NonSalesWorkspace() {
  const store = useStore()
  const location = useLocation()
  // Keep the form mounted while appearance settings are open, preserving drafts.
  return <div className="non-sales-workspace">
    <header><strong>WinTrack ModAE</strong><nav aria-label="Main navigation"><NavLink to="/new-lead">New Lead</NavLink><NavLink to="/personal-settings">Personal settings</NavLink><button onClick={() => store.logout()}>Sign out</button></nav></header>
    <div hidden={location.pathname !== "/new-lead"}><NewLead /></div>
    <Routes><Route path="/new-lead" element={null} /><Route path="/personal-settings" element={<PersonalSettings />} /><Route path="*" element={<Navigate to="/new-lead" replace />} /></Routes>
  </div>
}
