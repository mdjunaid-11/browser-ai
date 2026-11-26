import { createContext, useContext } from 'react'
import type { ToastMessage } from '../../types'

export interface ToastApi {
  push: (toast: Omit<ToastMessage, 'id'>) => string
  remove: (id: string) => void
  info: (title: string, description?: string) => string
  success: (title: string, description?: string) => string
  warning: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider')
  }
  return context
}
