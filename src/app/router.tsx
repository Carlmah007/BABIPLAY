import { useMemo, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { createStore, useStore } from '../lib/store'

function readPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

const pathStore = createStore(readPath())

let listening = false

function ensureHashListener(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('hashchange', () => {
    pathStore.setState(readPath())
  })
}

export function navigate(to: string, options?: { replace?: boolean }): void {
  const path = to.startsWith('/') ? to : `/${to}`
  if (readPath() === path) return
  const target = `#${path}`
  if (options?.replace) {
    window.history.replaceState(null, '', target)
    pathStore.setState(path)
  } else {
    window.location.hash = target
  }
}

export function useHashPath(): string {
  ensureHashListener()
  return useStore(pathStore)
}

export function useNavigate() {
  return useMemo(() => navigate, [])
}

export function Link({
  to,
  children,
  className,
  onClick,
  ...rest
}: {
  to: string
  children: ReactNode
  className?: string
  onClick?: () => void
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
