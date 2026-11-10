import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { notificationStore } from '../stores/notificationStore'
import { formatDateTime } from '../lib/dates'
import { toUserMessage } from '../lib/errors'
import { walletStore } from '../stores/walletStore'

const TONE_BY_TYPE: Record<string, 'brand' | 'success' | 'danger' | 'neutral' | 'warning'> = {
  game_win: 'success',
  game_loss: 'danger',
  game_result: 'neutral',
  balance_change: 'brand',
  deposit: 'success',
  withdrawal: 'warning',
  payment_failed: 'danger',
  admin: 'warning',
  security: 'danger',
  account_status: 'warning',
}

export function NotificationsPage() {
  const items = notificationStore.useItems()
  const unread = notificationStore.useUnreadCount()
  const userId = walletStore.useUserId()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (userId) notificationStore.setUser(userId)
  }, [userId])

  const visible = filter === 'unread' ? items.filter((item) => !item.read) : items

  const handleMarkRead = (id: string) => {
    try {
      notificationStore.markRead(id)
    } catch (caught) {
      setError(toUserMessage(caught))
    }
  }

  const handleMarkAll = () => {
    try {
      notificationStore.markAllRead()
    } catch (caught) {
      setError(toUserMessage(caught))
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="Centre de notifications"
        description="Résultats de parties, mouvements de solde et alertes importantes."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={unread > 0 ? 'brand' : 'neutral'} dot={unread > 0}>
              {unread} non lue(s)
            </Badge>
            <Button size="sm" variant="secondary" onClick={handleMarkAll} disabled={unread === 0}>
              Tout marquer lu
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>
          Toutes
        </Button>
        <Button size="sm" variant={filter === 'unread' ? 'primary' : 'secondary'} onClick={() => setFilter('unread')}>
          Non lues
        </Button>
      </div>

      <Card padded={false}>
        {visible.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="bell"
              title="Aucune notification"
              description="Vos résultats et alertes apparaîtront ici."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((item) => (
              <li key={item.id} className="px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={TONE_BY_TYPE[item.type] ?? 'neutral'}>{item.type}</Badge>
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <div className="shrink-0">
                    {!item.read && (
                      <Button size="sm" variant="ghost" onClick={() => handleMarkRead(item.id)}>
                        Marquer lu
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
    </div>
  )
}
