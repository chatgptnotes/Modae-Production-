import React, { createContext, useContext } from 'react'
import PhoneWorkspaceHeader from './PhoneWorkspaceHeader.jsx'

// Portals retain this context, so full-screen dialogs own accessible controls
// rather than exposing the page behind their focus trap.
export const PhoneWorkspaceChromeContext = createContext(null)
export function PhoneOverlayHeader() {
  const store = useContext(PhoneWorkspaceChromeContext)
  return store ? <PhoneWorkspaceHeader store={store} compact /> : null
}
