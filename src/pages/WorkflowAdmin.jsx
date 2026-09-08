import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { DEFAULT_WORKFLOW } from '../seed.js'
import { canSeePage, isAdminRole } from '../utils.js'
import { Icon } from '../icons.jsx'

export default function WorkflowAdmin() {
  const store = useStore()
  const nav = useNavigate()
  const canEdit = isAdminRole(store.role) || store.role === 'LJS'
  const [newLabel, setNewLabel] = useState('')
  const stages = useMemo(() => [...(store.config?.workflow || DEFAULT_WORKFLOW)].sort((a, b) => a.order - b.order), [store.config?.workflow])

  if (!canSeePage(store.role, 'admin')) return <div className="page"><h2>Workflow settings</h2><div className="restricted">Restricted — administrators and LJS only.</div></div>

  const save = next => store.updateConfig({ workflow: next.map((stage, order) => ({ ...stage, order })) })
  const patch = (id, change) => save(stages.map(stage => stage.id === id ? { ...stage, ...change } : stage))
  const move = (index, direction) => {
    const next = [...stages]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    save(next)
  }
  const add = event => {
    event.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    const id = `custom-${Date.now()}`
    save([...stages, { id, milestone: id, label, enabled: true, tab: 'overview' }])
    setNewLabel('')
  }

  return <div className="page workflow-admin-page">
    <div className="workflow-admin-head">
      <div><button className="text-button" onClick={() => nav('/admin')}><Icon name="chevronLeft" size={12} /> Admin configuration</button><h2>Workflow settings</h2><p className="hint">Stages are managed separately from business rules. Changes are audited and existing records keep their stable stage IDs.</p></div>
      {!canEdit && <div className="warn-box">Read-only — sign in as an administrator to edit workflow settings.</div>}
    </div>
    <section className="admin-card workflow-editor-card">
      <div className="workflow-editor-title"><div><h3><Icon name="list" size={14} /> Opportunity workflow</h3><p className="hint">Rename, reorder, or retire a stage. Retired stages remain available in historical records.</p></div><span className="chip grey">{stages.length} stages</span></div>
      <div className="workflow-stage-list">
        {stages.map((stage, index) => <div className={`workflow-stage-row ${stage.enabled === false ? 'retired' : ''}`} key={stage.id}>
          <span className="workflow-stage-order">{String(index + 1).padStart(2, '0')}</span>
          <input aria-label={`Stage ${index + 1} label`} value={stage.label} disabled={!canEdit} onChange={e => patch(stage.id, { label: e.target.value })} />
          <span className="workflow-stage-id">{stage.milestone || stage.id}</span>
          <label className="check-row"><input type="checkbox" checked={stage.enabled !== false} disabled={!canEdit} onChange={e => patch(stage.id, { enabled: e.target.checked })} /> Active</label>
          <span className="workflow-stage-actions"><button title="Move up" disabled={!canEdit || index === 0} onClick={() => move(index, -1)}>↑</button><button title="Move down" disabled={!canEdit || index === stages.length - 1} onClick={() => move(index, 1)}>↓</button></span>
        </div>)}
      </div>
      {canEdit && <form className="admin-actions workflow-add-form" onSubmit={add}><input value={newLabel} placeholder="New stage name" onChange={e => setNewLabel(e.target.value)} /><button className="primary" type="submit"><Icon name="plus" size={11} /> Add stage</button></form>}
      <div className="workflow-protected-note"><Icon name="lock" size={12} /> Core security, approval authority, and costing arithmetic remain protected. Workflow changes cannot erase audit history.</div>
    </section>
  </div>
}
