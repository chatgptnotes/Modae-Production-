import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Icon } from '../icons.jsx'

// Shared marketing notes board. Client requirement: "everybody can view it
// and update it" — so every role can post, edit ANY note, and delete.
export default function Notes() {
  const store = useStore()
  const [draft, setDraft] = useState('')
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')

  const notes = [...(store.notes || [])].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))

  const post = () => {
    const t = draft.trim()
    if (!t) return
    store.addNote(t)
    setDraft('')
  }

  const startEdit = n => {
    setEditId(n.id)
    setEditText(n.text)
  }

  const saveEdit = () => {
    const t = editText.trim()
    if (t) store.updateNote(editId, t)
    setEditId(null)
    setEditText('')
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditText('')
  }

  const remove = n => {
    if (confirm('Delete this note for everyone?')) store.deleteNote(n.id)
  }

  return (
    <div className="page">
      <h2>Marketing Notes</h2>
      <div className="hint">Shared board — every role can view, post and update any note.</div>

      <div className="note-compose">
        <textarea placeholder="Share an update with the team — site visits, customer signals, reminders…"
          value={draft} onChange={e => setDraft(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button className="primary" onClick={post} disabled={!draft.trim()}>
            <Icon name="note" size={13} /> Post note
          </button>
        </div>
      </div>

      {notes.length === 0 && <div className="hint">No notes yet — post the first one.</div>}

      {notes.map(n => (
        <div key={n.id} className="note-card">
          <div className="note-meta">
            <b>{n.author}</b>
            <span className="pill">{n.role}</span>
            <span>{new Date(n.ts).toLocaleString()}</span>
            {n.edited && (
              <span title={`Edited ${new Date(n.edited).toLocaleString()}${n.editedBy ? ' by ' + n.editedBy : ''}`}>
                edited
              </span>
            )}
          </div>
          {editId === n.id ? (
            <div>
              <textarea style={{ width: '100%', minHeight: 74 }} autoFocus
                value={editText} onChange={e => setEditText(e.target.value)} />
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <button className="primary" onClick={saveEdit} disabled={!editText.trim()}>
                  <Icon name="check" size={12} /> Save
                </button>
                <button onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="note-text">{n.text}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(n)}>Edit</button>
                <button onClick={() => remove(n)}>
                  <Icon name="x" size={11} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
