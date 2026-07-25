import React from 'react'

/**
 * App-wide safety net. Before this existed, ANY uncaught error thrown while a component rendered
 * unmounted the whole React root and left a blank white page — a single bad line in one page took
 * down the entire ERP with no way back. React only lets a class component catch render errors, so
 * this stays a class. It shows a recoverable message (reload / go back) instead of a blank screen,
 * and prints the error + component stack to the console so the real cause is never hidden.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] a component crashed while rendering:', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Something went wrong on this screen</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
            The rest of the app is fine — you can go back or reload. The technical details are in the browser console.
          </p>
          {import.meta.env?.DEV && (
            <pre style={{
              textAlign: 'left', fontSize: 11, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: 10, overflow: 'auto', maxHeight: 160, marginBottom: 16,
            }}>{String(error?.stack || error?.message || error)}</pre>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={() => { this.reset(); if (window.history.length > 1) window.history.back() }}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Go back
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0d9488', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
