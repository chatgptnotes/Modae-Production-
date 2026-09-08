import React from 'react'

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
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, minHeight: '100vh', padding: 24, textAlign: 'center',
          background: '#f3f4f5', color: '#282828', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ margin: 0, color: '#616161', maxWidth: 480 }}>
            {this.state.error?.message || 'An unexpected error stopped the page from loading.'}
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
        </div>
      )
    }
    return this.props.children
  }
}
