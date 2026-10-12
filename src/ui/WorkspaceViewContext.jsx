import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { currentFiscalQuarter } from './workspacePeriods.js'

const WorkspaceViewContext = createContext(null)

export function WorkspaceViewProvider({ children, initialScope = 'global' }) {
  const [scope, setScope] = useState(initialScope)
  const [period, setPeriod] = useState('fy')
  const [topPeriod, setTopPeriod] = useState(currentFiscalQuarter)
  const [owner, setOwner] = useState('all')
  useEffect(() => setScope(initialScope), [initialScope])
  const value = useMemo(() => ({ scope, setScope, period, setPeriod, topPeriod, setTopPeriod, owner, setOwner }), [scope, period, topPeriod, owner])
  return <WorkspaceViewContext.Provider value={value}>{children}</WorkspaceViewContext.Provider>
}

export function useWorkspaceView() {
  return useContext(WorkspaceViewContext) || { scope: 'global', setScope: () => {}, period: 'fy', setPeriod: () => {}, topPeriod: currentFiscalQuarter(), setTopPeriod: () => {}, owner: 'all', setOwner: () => {} }
}
