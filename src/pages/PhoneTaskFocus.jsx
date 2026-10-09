import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../icons.jsx'

// Keep existing stage panels mounted: hiding a task must not discard form drafts.
// Completion remains owned by each panel's validation and the stage transition.
export default function PhoneTaskFocus({ enabled, stage, children }) {
  const root = useRef(null)
  const title = useRef(null)
  const [groups, setGroups] = useState([])
  const [params, setParams] = useSearchParams()
  const task = params.get('task')
  const selected = groups.findIndex(group => group.id === task)
  const active = selected >= 0 ? selected : 0
  useEffect(() => {
    if (!enabled || !root.current) { setGroups([]); return undefined }
    const node = root.current
    const discover = () => {
      const candidates = [...node.querySelectorAll('[data-phone-task], .ana-card, .workbench-panel, .commercial-decision-panel, .proposal-alert-drawer, .proposal-sheet-editor')]
      const panels = candidates.filter(panel => !candidates.some(parent => parent !== panel && parent.contains(panel)))
      const next = panels.map((panel, index) => ({
        id: `panel-${index + 1}`,
        label: panel.dataset.phoneTask || panel.querySelector('.ana-title, .workbench-section-title, .section-title, .service-panel-kicker, h2, h3')?.textContent?.trim() || `Stage task ${index + 1}`,
        panel,
      }))
      setGroups(previous => previous.length === next.length && previous.every((group, index) => group.panel === next[index].panel && group.label === next[index].label) ? previous : next)
    }
    discover()
    const observer = new MutationObserver(discover)
    observer.observe(node, { childList: true, subtree: true, characterData: true })
    return () => { observer.disconnect(); [...node.querySelectorAll('[data-phone-task-hidden]')].forEach(panel => { panel.hidden = false; delete panel.dataset.phoneTaskHidden }) }
  }, [enabled, stage])
  useEffect(() => {
    groups.forEach((group, index) => {
      const hidden = enabled && groups.length > 1 && index !== active
      group.panel.hidden = hidden
      group.panel.dataset.phoneTaskHidden = String(hidden)
    })
  }, [groups, active, enabled])
  const choose = index => {
    const next = new URLSearchParams(params)
    next.set('task', groups[index].id)
    setParams(next, { replace: true })
    title.current?.focus()
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  return <div className={enabled ? 'phone-task-focus' : ''}>
    {enabled && groups.length > 1 && <nav className="phone-task-navigation" aria-label="Tasks in this workflow stage">
      <p>Task {active + 1} of {groups.length} · {stage}</p>
      <h2 ref={title} tabIndex={-1}>{groups[active]?.label}</h2>
      <label>Choose task<select aria-label="Choose workflow task" value={active} onChange={event => choose(Number(event.target.value))}>{groups.map((group, index) => <option value={index} key={group.id}>{index + 1}. {group.label}</option>)}</select></label>
      <div><button type="button" disabled={active === 0} onClick={() => choose(active - 1)}><Icon name="chevronLeft" size={16} />Previous task</button><button type="button" disabled={active === groups.length - 1} onClick={() => choose(active + 1)}>Next task<Icon name="chevronRight" size={16} /></button></div>
      <small>Switch tasks to review and edit. Use the stage action when ready to continue.</small>
    </nav>}
    <div ref={root}>{children}</div>
  </div>
}
