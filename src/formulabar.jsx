import React, { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { evalFormula } from './utils.js'

// Live formula bar, like the real workbook: clicking a cell shows its address
// and underlying formula; typing into the bar and pressing Enter evaluates the
// expression and commits it to editable cells.
const Ctx = createContext(null)
const EMPTY = { ref: 'A1', formula: '', commit: null, kind: 'number' }

export function FormulaBarProvider({ children }) {
  const [sel, setSel] = useState(EMPTY)
  return (
    <Ctx.Provider value={{
      sel,
      select: s => setSel({ ...EMPTY, ...s }),
      update: patch => setSel(prev => ({ ...prev, ...patch })),
      clear: () => setSel(EMPTY),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useFormulaBar = () => useContext(Ctx)

export function FormulaBar() {
  const { sel, update, clear } = useFormulaBar()
  const loc = useLocation()
  const [draft, setDraft] = useState(null)

  // Reset the typed draft only when a DIFFERENT cell is selected — re-clicking
  // the same cell (e.g. into its inline input) keeps what you were typing.
  useEffect(() => { setDraft(null) }, [sel.ref])
  // Leaving the page disarms the commit — Enter must never write to a cell
  // that is no longer on screen.
  useEffect(() => { clear(); setDraft(null) }, [loc.pathname]) // eslint-disable-line

  const shown = draft ?? String(sel.formula ?? '')
  const onKey = e => {
    if (e.key === 'Enter' && sel.commit) {
      if (sel.kind === 'text') {
        // Excel semantics: without a leading '=' the input is literal text —
        // "26-27" or "24/7" in a remark must never turn into arithmetic.
        const isFormula = shown.trim().startsWith('=')
        const res = isFormula ? evalFormula(shown) : null
        sel.commit(res ? String(res.value) : shown)
      } else {
        const res = evalFormula(shown)
        if (res == null) return
        let v = sel.kind === 'pct' && res.usedPct ? res.value * 100 : res.value
        if (sel.kind === 'pct') v = Math.round(v * 1e4) / 1e4 // 8.5%+2.5%+5% → exactly 16
        sel.commit(v)
      }
      // Keep showing what was typed (like Excel keeps the formula) instead of
      // snapping back to the click-time snapshot.
      update({ formula: shown })
      setDraft(null)
      e.target.blur()
    }
    if (e.key === 'Escape') { setDraft(null); e.target.blur() }
  }

  return (
    <div className="formula-bar">
      <span className="cell-ref">{sel.ref}</span>
      <span>fx</span>
      <input
        className="fx-input"
        value={shown}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKey}
        readOnly={!sel.commit}
        placeholder={sel.commit ? 'Type a value or =formula and press Enter' : ''}
        title={sel.commit ? 'Enter commits to the selected cell' : 'Selected cell is read-only'}
        spellCheck={false}
      />
    </div>
  )
}
