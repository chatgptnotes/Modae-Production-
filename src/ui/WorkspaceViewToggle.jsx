import React from 'react'
import { useWorkspaceView } from './WorkspaceViewContext.jsx'

export default function WorkspaceViewToggle() {
  const { scope, setScope } = useWorkspaceView()
  const isGlobal = scope === 'global'

  return (
    <button
      type="button"
      className="workspace-view-switch"
      role="switch"
      aria-checked={isGlobal}
      aria-label="Workspace view"
      aria-valuetext={isGlobal ? 'Global View' : 'My View'}
      onClick={() => setScope(isGlobal ? 'my' : 'global')}
    >
      <span className="workspace-view-switch__label" key={scope}>{isGlobal ? 'Global View' : 'My View'}</span>
      <span className="workspace-view-switch__thumb" aria-hidden="true" />
    </button>
  )
}
