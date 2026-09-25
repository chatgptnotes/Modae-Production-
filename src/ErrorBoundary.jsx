import React from 'react'
import { isChunkLoadError } from './lazyImport.js'

// A render error anywhere below this with no boundary of its own unmounts
// the whole tree, leaving a blank/stuck screen until the user reloads by
// hand. This catches that and offers a reload instead of silence.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (this.state.error) {
      const chunkFailure = isChunkLoadError(this.state.error)
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, minHeight: '100vh', padding: 24, textAlign: 'center',
          background: '#f3f4f5', color: '#282828', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <h2 style={{ margin: 0 }}>{chunkFailure ? 'A new workspace version is available' : 'Something went wrong'}</h2>
          <p style={{ margin: 0, color: '#616161', maxWidth: 480 }}>
            {chunkFailure
              ? 'The page was updated while this browser was open. Reload once to continue with the latest version.'
              : (this.state.error?.message || 'An unexpected error stopped the page from loading.')}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: '#d82f20', color: '#fff', border: 'none', borderRadius: 4,
            }}
          >
            Reload
          </button>
          {chunkFailure && <a href="/opportunities" style={{ color: '#616161', fontSize: 14 }}>Return to workspace</a>}
        </div>
      )
    }
    return this.props.children
  }
}
