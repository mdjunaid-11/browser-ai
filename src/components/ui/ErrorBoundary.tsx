import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Browser AI crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="card w-full max-w-lg p-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/15 text-rose-300">
            <Icon name="alert" size={24} />
          </div>
          <h1 className="text-lg font-semibold text-[var(--text)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            The interface hit an unexpected error. Your saved conversations are
            stored locally and should still be available after a reload.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--code-bg)] p-3 text-left text-xs text-[var(--text-subtle)]">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <Icon name="refresh" size={16} />
              Reload app
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
