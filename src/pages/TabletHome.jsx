import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { buildTiles, TABLET_TASKS, roleGroup } from '../tiles.js'
import { Icon } from '../icons.jsx'

// Tablet landing: one colorful tile per task the acting role has to do.
// Registry is shared with the desktop Home so the two never drift.
export default function TabletHome() {
  const store = useStore()
  const nav = useNavigate()
  const tiles = buildTiles(store)
  const order = TABLET_TASKS[roleGroup(store.role)] || TABLET_TASKS.sales
  const tasks = order.map(k => tiles.find(t => t.key === k)).filter(Boolean)
  const more = tiles.filter(t => !order.includes(t.key))

  const Tile = ({ t, small }) => (
    <button className={`ttile c-${t.color}`} onClick={() => nav(t.to)}>
      {t.badge > 0 && <span className="ttile-badge" title={t.badgeHint}>{t.badge}</span>}
      <Icon name={t.icon} size={small ? 24 : 34} />
      <span className="ttile-label">{t.label}</span>
      {!small && t.hint && <span className="ttile-hint">{t.hint}</span>}
    </button>
  )

  return (
    <div className="page tablet-home">
      <h2>Good day, {ROLES[store.role]?.name} — your tasks</h2>
      <div className="ttile-grid">
        {tasks.map(t => <Tile key={t.key} t={t} />)}
      </div>
      {more.length > 0 && (
        <>
          <div className="tile-section">More tools</div>
          <div className="ttile-grid small">
            {more.map(t => <Tile key={t.key} t={t} small />)}
          </div>
        </>
      )}
    </div>
  )
}
