import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { CLOSE_REASONS } from '../seed.js'
import { Icon } from '../icons.jsx'

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

// Stage keywords, checked in order — first match wins. Multi-word phrases
// first so "firm bid" is not shadowed by the bare "bid"/"lead" words.
const STAGE_WORDS = [
  ['firm bid', 'Firm Bid'],
  ['negotiation', 'Negotiate'],
  ['negotiate', 'Negotiate'],
  ['budgetary', 'Budgetary'],
  ['won', 'Won'],
  ['lost', 'Lost'],
  ['rfq', 'RFQ'],
  ['rfi', 'RFI'],
  ['lead', 'Lead'],
]

// Intent/filler words ignored when fuzzy-matching customer names.
const STOP = new Set([
  'the', 'and', 'for', 'with', 'update', 'updated', 'stage', 'status', 'probability',
  'high', 'medium', 'low', 'set', 'mark', 'move', 'new', 'lead', 'won', 'lost',
  'firm', 'bid', 'rfq', 'rfi', 'budgetary', 'negotiate', 'negotiation', 'opportunity',
  'opp', 'customer', 'remarks', 'remark', 'note', 'add', 'please', 'this', 'that',
  'has', 'have', 'was', 'are', 'been', 'they', 'their', 'project', 'order',
])

// 1. Target: 7+ digit id fragments beat everything; else best word-overlap
// score across sellTo / eucName / oppName. Deterministic — no AI involved.
function findOpp(transcript, opps) {
  const frags = transcript.match(/\d{7,}/g) || []
  for (const frag of frags) {
    const hit = opps.find(o => o.id.includes(frag))
    if (hit) return { opp: hit, how: `opp id fragment "${frag}"` }
  }
  const words = transcript.toLowerCase().match(/[a-z0-9]+/g) || []
  const useful = [...new Set(words.filter(w => w.length >= 3 && !STOP.has(w)))]
  let best = null
  let bestScore = 0
  for (const o of opps) {
    const hay = `${o.sellTo || ''} ${o.eucName || ''} ${o.oppName || ''}`.toLowerCase()
    let score = 0
    for (const w of useful) if (hay.includes(w)) score += w.length
    if (score > bestScore) { bestScore = score; best = o }
  }
  return best ? { opp: best, how: 'customer / opportunity name match' } : null
}

// 2 + 3. Deterministic intent parse over the final transcript.
function parseTranscript(raw, opps) {
  const t = raw.trim()

  const lead = t.match(/^\s*(?:new lead|create(?:\s+a)?(?:\s+new)?\s+lead)\b[\s,:.-]*(.*)$/i)
  if (lead) return { kind: 'newLead', oppName: lead[1].trim() }

  const found = findOpp(t, opps)
  if (!found) return { kind: 'nomatch', transcript: t }

  const low = t.toLowerCase()
  const patch = {}
  for (const [word, stage] of STAGE_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(low)) {
      if (found.opp.stage !== stage) patch.stage = stage
      if (stage === 'Won' || stage === 'Lost') {
        if (found.opp.status !== 'Closed') patch.status = 'Closed'
        // Default reason — the confirmation card asks the user to pick.
        patch.closedReason = found.opp.closedReason || 'Relationship'
      }
      break
    }
  }

  const pm = low.match(/\b(high|medium|low)\s+probability\b/)
    || low.match(/\bprobability\s+(?:is\s+|to\s+|of\s+)?(high|medium|low)\b/)
  if (pm) {
    const p = pm[1][0].toUpperCase() + pm[1].slice(1)
    if (found.opp.prob !== p) patch.prob = p
  }

  const remarks = (found.opp.remarks ? found.opp.remarks + ' | ' : '') + t
  return { kind: 'update', opp: found.opp, how: found.how, patch, remarks, transcript: t }
}

const FIELD_LABELS = { stage: 'Stage', status: 'Status', closedReason: 'Closed reason', prob: 'Probability' }

const EXAMPLES = [
  '"2608222 moved to firm bid, high probability"',
  '"BHEL Bhopal AGMS won"',
  '"Mark the APGENCO air gap opportunity lost"',
  '"2607215 customer asked for a revised delivery schedule" — appended to remarks',
  '"New lead vibration monitoring for NTPC Ramagundam" — opens the intake form pre-filled',
]

export default function VoiceUpdate() {
  const store = useStore()
  const nav = useNavigate()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(null)
  const [applied, setApplied] = useState(null)
  const recRef = useRef(null)
  const finalRef = useRef('')

  const handleParse = text => {
    const res = parseTranscript(text, store.opportunities)
    if (res.kind === 'newLead') {
      nav('/new', { state: { prefill: { oppName: res.oppName } } })
      return
    }
    setPending(res)
  }

  const start = () => {
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.continuous = true
    rec.interimResults = true
    finalRef.current = ''
    rec.onresult = e => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalRef.current += r[0].transcript + ' '
        else live += r[0].transcript
      }
      setInterim((finalRef.current + live).trim())
    }
    rec.onend = () => {
      setListening(false)
      const text = finalRef.current.trim()
      if (text) handleParse(text)
    }
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setInterim('')
    setPending(null)
    setApplied(null)
    setListening(true)
    rec.start()
  }

  const stop = () => recRef.current && recRef.current.stop()

  const apply = () => {
    const { opp, patch, remarks } = pending
    store.updateOpportunity(opp.id, { ...patch, remarks })
    setApplied({ opp, patch, transcript: pending.transcript })
    setPending(null)
  }

  const reset = () => {
    setPending(null)
    setApplied(null)
    setInterim('')
    setTyped('')
  }

  const changes = pending && pending.kind === 'update'
    ? Object.keys(pending.patch).map(k => ({
      key: k, label: FIELD_LABELS[k] || k,
      from: pending.opp[k] || '—', to: pending.patch[k],
    }))
    : []

  return (
    <div className="page">
      <h2>Voice Update</h2>
      <div className="hint">
        Speak an update — a deterministic parser matches the opportunity and proposes
        field changes. Nothing is applied until you confirm.
      </div>

      <div className="voice-wrap">
        {SR ? (
          <>
            <button className={`voice-mic ${listening ? 'listening' : ''}`}
              title={listening ? 'Stop listening' : 'Start listening'}
              onClick={() => (listening ? stop() : start())}>
              <Icon name="mic" size={44} />
            </button>
            <div className="hint" style={{ textAlign: 'center' }}>
              {listening ? 'Listening — tap to stop and parse' : 'Tap the mic and speak your update'}
            </div>
            {(listening || interim) && (
              <div className="voice-transcript">{interim || '…'}</div>
            )}
          </>
        ) : (
          <>
            <div className="warnbox">
              Speech recognition is not available in this browser — type the update
              instead. The same parser runs on the text.
            </div>
            <textarea style={{ width: '100%', minHeight: 74 }}
              placeholder='e.g. "2608222 moved to firm bid, high probability"'
              value={typed} onChange={e => setTyped(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button className="primary" disabled={!typed.trim()}
                onClick={() => { setApplied(null); handleParse(typed.trim()) }}>
                Parse update
              </button>
            </div>
          </>
        )}

        {pending && pending.kind === 'nomatch' && (
          <div className="errbox">
            Could not match an opportunity in &ldquo;{pending.transcript}&rdquo; — say a 7-digit
            opp id or the customer name, or start with &ldquo;new lead&rdquo; to create one.
            <div style={{ marginTop: 6 }}>
              <button onClick={reset}>Try again</button>
            </div>
          </div>
        )}

        {pending && pending.kind === 'update' && (
          <div className="form-card" style={{ marginTop: 14 }}>
            <div className="section-title">Confirm update</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <b className="oppid-link">{pending.opp.id}</b> — {pending.opp.sellTo}
              <div className="hint">{pending.opp.oppName}</div>
              <div className="hint">Matched by {pending.how}</div>
            </div>
            {changes.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                {changes.map(c => (
                  <div key={c.key} style={{ padding: '3px 0' }}>
                    <b>{c.label}:</b> {c.from} <Icon name="arrowRight" size={11} />{' '}
                    {c.key === 'closedReason' ? (
                      <select value={pending.patch.closedReason}
                        onChange={e => setPending({
                          ...pending,
                          patch: { ...pending.patch, closedReason: e.target.value },
                        })}>
                        {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    ) : c.to}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <b>Append to remarks:</b> <span className="hint">&ldquo;{pending.transcript}&rdquo;</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={apply}>
                <Icon name="check" size={12} /> Apply update
              </button>
              <button onClick={reset}>Discard</button>
            </div>
          </div>
        )}

        {applied && (
          <div className="okbox">
            Recorded on <b>{applied.opp.id}</b> — {applied.opp.sellTo}:{' '}
            {Object.keys(applied.patch).length > 0
              ? Object.keys(applied.patch).map(k => `${FIELD_LABELS[k] || k} set to ${applied.patch[k]}`).join(', ') + '; '
              : ''}
            remarks updated with &ldquo;{applied.transcript}&rdquo;.
            <div style={{ marginTop: 6 }}>
              <button onClick={reset}>Another update</button>
            </div>
          </div>
        )}

        <div className="section-title" style={{ marginTop: 20 }}>Try saying</div>
        <ul className="hint" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          {EXAMPLES.map(x => <li key={x}>{x}</li>)}
        </ul>
      </div>
    </div>
  )
}
