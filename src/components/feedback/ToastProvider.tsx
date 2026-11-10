import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createId } from '../../lib/ids'
import { cn } from '../../lib/cn'
import { Icon, type IconName } from '../ui/Icon'

type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  title: string
  message?: string
  tone: ToastTone
}

interface ToastContextValue {
  pushToast: (title: string, options?: { message?: string; tone?: ToastTone }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLES: Record<ToastTone, { icon: IconName; className: string; iconClassName: string }> = {
  success: {
    icon: 'check',
    className: 'border-emerald-100 bg-white',
    iconClassName: 'bg-emerald-50 text-emerald-600',
  },
  error: {
    icon: 'alert',
    className: 'border-rose-100 bg-white',
    iconClassName: 'bg-rose-50 text-rose-600',
  },
  info: {
    icon: 'spark',
    className: 'border-sky-100 bg-white',
    iconClassName: 'bg-sky-50 text-sky-600',
  },
  warning: {
    icon: 'alert',
    className: 'border-amber-100 bg-white',
    iconClassName: 'bg-amber-50 text-amber-600',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      currentTimers.forEach((timer) => window.clearTimeout(timer))
      currentTimers.clear()
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (title: string, options?: { message?: string; tone?: ToastTone }) => {
      const id = createId('toast')
      const tone = options?.tone ?? 'info'
      setToasts((current) => [...current.slice(-2), { id, title, message: options?.message, tone }])
      const timer = window.setTimeout(() => dismiss(id), 4500)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((toast) => {
          const tone = TONE_STYLES[toast.tone]
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-3.5 shadow-lg shadow-slate-900/5',
                tone.className,
              )}
            >
              <span className={cn('mt-0.5 rounded-xl p-1.5', tone.iconClassName)}>
                <Icon name={tone.icon} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                {toast.message ? (
                  <p className="mt-0.5 text-xs text-slate-500">{toast.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Fermer la notification"
                onClick={() => dismiss(toast.id)}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast doit être utilisé dans un ToastProvider.')
  }
  return context
}
