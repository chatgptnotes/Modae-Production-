import React from 'react'

// Pages own their phone layouts and explicit table-editing controls.
export default function MobileContent({ children, hasTitle }) {
  return <div className={`mobile-content${hasTitle ? ' has-mobile-title' : ''}`}>{children}</div>
}
