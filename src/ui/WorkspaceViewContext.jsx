import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const WorkspaceViewContext = createContext(null)

export function WorkspaceViewProvider({ children, initialScope = 'global' }) {
  const [scope, setScope] = useState(initialScope)
  const [period, setPeriod] = useState('fy')
  const [topPeriod, setTopPeriod] = useState('fy')
  const [owner, setOwner] = useState('all')
  useEffect(() => setScope(initialScope), [initialScope])
  const value = useMemo(() => ({ scope, setScope, period, setPeriod, topPeriod, setTopPeriod, owner, setOwner }), [scope, period, topPeriod, owner])
  return <WorkspaceViewContext.Provider value={value}>{children}</WorkspaceViewContext.Provider>
}

export function useWorkspaceView() {
  return useContext(WorkspaceViewContext) || { scope: 'global', setScope: () => {}, period: 'fy', setPeriod: () => {}, topPeriod: 'fy', setTopPeriod: () => {}, owner: 'all', setOwner: () => {} }
}
