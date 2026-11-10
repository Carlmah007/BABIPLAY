import { useEffect, type ReactNode } from 'react'
import { ToastProvider } from '../components/feedback/ToastProvider'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'
import { authStore } from '../stores/authStore'
import { miningStore } from '../stores/miningStore'
import { paymentStore } from '../stores/paymentStore'
import { walletStore } from '../stores/walletStore'

function StoreBootstrap({ children }: { children: ReactNode }) {
  const session = authStore.useSession()
  const userId = session?.user.id ?? null

  useEffect(() => {
    walletStore.setUser(userId)
    paymentStore.setUser(userId)
    miningStore.setUser(userId)
  }, [userId])

  return <>{children}</>
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <StoreBootstrap>{children}</StoreBootstrap>
      </ToastProvider>
    </ErrorBoundary>
  )
}
