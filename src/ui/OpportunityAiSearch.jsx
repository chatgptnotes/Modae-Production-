import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'
import { Portal } from '../ui.jsx'
import { runTaskResult } from '../ai.js'
import { requiredSearchClarification, validateSearchResult } from '../opportunitySearch.js'

export default function OpportunityAiSearch({ value, onChange, identity, context, onApply }) {
  const root = useRef(null)
  const input = useRef(null)
  const popup = useRef(null)
  const suppressFocusOpen = useRef(false)
  const focusInput = () => { suppressFocusOpen.current = true; input.current?.focus(); queueMicrotask(() => { suppressFocusOpen.current = false }) }
  const ticket = useRef(0)
  const latest = useRef({ identity, value })
  latest.current = { identity, value }
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle', answers: [] })
  const [answer, setAnswer] = useState('')
  const [position, setPosition] = useState(null)
  useEffect(() => { ticket.current++; setOpen(false); setState({ status: 'idle', answers: [] }) }, [identity])
  useEffect(() => () => { ticket.current++ }, [])
  useLayoutEffect(() => {
    if (!open) return
    const rect = root.current?.getBoundingClientRect()
    if (rect) {
      const width = Math.min(460, Math.max(280, rect.width), window.innerWidth - 16)
      const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 300))
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top, width, maxHeight: window.innerHeight - top - 8 })
    }
  }, [open, value, state.status])
  useEffect(() => {
    if (!open) return
    const outside = event => { if (!root.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false) }
    const escape = event => { if (event.key === 'Escape') { ticket.current++; setOpen(false); setState({ status: 'idle', answers: [] }); focusInput() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const run = async (answers = []) => {
    const query = value.trim()
    if (!query || query.length > 1500) return
    const id = ++ticket.current
    const origin = identity
    const payload = { query, answers, ...context }
    setAnswer('')
    const clarification = requiredSearchClarification(payload)
    if (clarification) { setState({ ...clarification, answers }); return }
    setState({ status: 'loading', answers })
    const result = await runTaskResult('opportunity.search', payload)
    if (ticket.current !== id || latest.current.identity !== origin || latest.current.value.trim() !== query) return
    if (result.error || !result.data) {
      setState({ status: 'error', answers, message: result.errorCode?.startsWith('AI_AUTH') ? 'AI search needs a signed-in online session. Ordinary search is still available.' : result.error || 'AI search is unavailable. Try again or use ordinary search.' }); return
    }
    try {
      const parsed = validateSearchResult(result.data.data)
      if (parsed.status === 'ready') { onApply(parsed, query); setOpen(false); setState({ status: 'idle', answers: [] }); focusInput() }
      else setState({ ...parsed, answers })
    } catch (error) { setState({ status: 'error', message: error.message, answers }) }
  }
  const clarify = text => {
    if (!text.trim()) return
    if (state.answers.length >= 5) { setState({status:'error',message:'Please rephrase the search with the date and owner you want.',answers:[]}); return }
    run([...state.answers, { question: state.question, answer: text.trim() }])
  }
  return <div className="opportunity-ai-search" ref={root}>
    <label className="tracker-search" aria-label="Search all opportunities">
      <Icon name="search" size={14} />
      <input ref={input} type="search" name="opportunity-search" placeholder="Search opportunities or ask AI…" value={value} maxLength={1500}
        aria-controls={open ? 'opportunity-ai-search-menu' : undefined} aria-expanded={open && !!value.trim()}
        onFocus={() => { if (!suppressFocusOpen.current) setOpen(true) }} onChange={event => { ticket.current++; onChange(event.target.value); setOpen(true); setState({ status: 'idle', answers: [] }) }}
        onKeyDown={event => { if (event.key === 'ArrowDown' && value.trim()) { event.preventDefault(); setOpen(true); requestAnimationFrame(() => popup.current?.querySelector('button')?.focus()) } }} />
    </label>
    {open && value.trim() && position && <Portal><div ref={popup} id="opportunity-ai-search-menu" className="filter-pop opportunity-ai-pop" style={{position:'fixed',...position}} role="region" aria-label="Search with AI">
      {state.status === 'loading' ? <p role="status">Interpreting your search…</p> : state.status === 'clarify' ? <>
        <strong>{state.question}</strong>
        <div className="opportunity-ai-choices">{state.choices.map(choice => <button key={choice} type="button" onClick={() => clarify(choice)}>{choice}</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); clarify(answer) }}><input type="text" name="opportunity-search-clarification" aria-label="Search clarification" placeholder="Or type your answer" value={answer} maxLength={300} onChange={event=>setAnswer(event.target.value)} /><button type="submit" disabled={!answer.trim()}>Continue</button></form>
      </> : <>
        {state.message && <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p>}
        <button type="button" className="opportunity-ai-action" onClick={() => run(state.answers)}><span aria-hidden="true">✦</span> {state.status === 'error' ? 'Retry AI search' : 'Search with AI'}</button>
        <small>Turn this sentence into filters for the records you can access.</small>
      </>}
      <button type="button" className="opportunity-ai-dismiss" onClick={() => { ticket.current++; setOpen(false); setState({status:'idle',answers:[]}); focusInput() }}>Close</button>
    </div></Portal>}
  </div>
}
