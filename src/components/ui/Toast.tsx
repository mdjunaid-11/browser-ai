import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ToastKind, ToastMessage } from '../../types'
import { cn } from '../../utils/cn'
import { Icon } from './Icon'
import { ToastContext, type ToastApi } from './toastContext'

const kindStyles: Record<ToastKind, string> = {
  info: 'border-sky-400/25 bg-sky-500/10',
  success: 'border-emerald-400/25 bg-emerald-500/10',
  warning: 'border-amber-400/25 bg-amber-500/10',
  error: 'border-rose-400/25 bg-rose-500/10',
}

const kindIconStyles: Record<ToastKind, string> = {
  info: 'text-[var(--info)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--danger)]',
}

const kindIcons: Record<ToastKind, 'info' | 'check-circle' | 'alert' | 'x-circle'> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert',
  error: 'x-circle',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef(new Map<string, number>())
  const counter = useRef(0)

  const remove = useCallback((id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const push = useCallback(
    (toast: Omit<ToastMessage, 'id'>): string => {
      counter.current += 1
      const id = `toast-${Date.now()}-${counter.current}`
      const duration = toast.duration ?? (toast.kind === 'error' ? 8000 : 5500)
      setToasts((previous) => {
        const next = [...previous, { ...toast, id }]
        return next.slice(-4)
      })
      if (duration > 0) {
        const timer = window.setTimeout(() => remove(id), duration)
        timers.current.set(id, timer)
      }
      return id
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      push,
      remove,
      info: (title, description) => push({ kind: 'info', title, description }),
      success: (title, description) =>
        push({ kind: 'success', title, description }),
      warning: (title, description) =>
        push({ kind: 'warning', title, description }),
      error: (title, description) => push({ kind: 'error', title, description }),
    }),
    [push, remove],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-[var(--surface-2)]/95 px-4 py-3 shadow-2xl backdrop-blur-xl animate-toast-in',
              kindStyles[toast.kind],
            )}
          >
            <Icon
              name={kindIcons[toast.kind]}
              size={19}
              className={cn('mt-0.5 shrink-0', kindIconStyles[toast.kind])}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">
                {toast.title}
              </p>
              {toast.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-icon -mr-1 -mt-0.5 h-7 w-7 shrink-0"
              onClick={() => remove(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
