import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CampusFlow ErrorBoundary Caught]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-main, #f8fafc)', padding: 20 }}>
          <div className="card" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: 32, borderRadius: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--error, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-main, #1e293b)' }}>Something went wrong</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted, #64748b)', marginBottom: 24, lineHeight: 1.5 }}>
              An unexpected error occurred while rendering this page. You can reload the page to restore your session.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <div style={{ textAlign: 'left', background: 'var(--bg-card, #f1f5f9)', padding: 12, borderRadius: 8, fontSize: 12, fontFamily: 'monospace', color: 'var(--error, #dc2626)', marginBottom: 20, overflowX: 'auto', maxHeight: 120 }}>
                {this.state.error.toString()}
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 auto' }}
            >
              <RefreshCw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
