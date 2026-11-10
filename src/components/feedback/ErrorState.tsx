import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Icon } from '../ui/Icon'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  action?: ReactNode
}

export function ErrorState({
  title = 'Une erreur est survenue',
  message,
  onRetry,
  action,
}: ErrorStateProps) {
  return (
    <Card className="border-rose-100 bg-rose-50/40">
      <div className="flex gap-3">
        <span className="mt-0.5 rounded-xl bg-white p-2 text-rose-500 ring-1 ring-rose-100">
          <Icon name="alert" size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{message}</p>
          {onRetry || action ? (
            <div className="mt-4">
              {action ?? (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Réessayer
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
