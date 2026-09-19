import React, { createContext, useContext, useState } from 'react'

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
