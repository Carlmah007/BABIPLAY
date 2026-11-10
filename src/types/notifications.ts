export type NotificationType =
  | 'game_win'
  | 'game_loss'
  | 'game_result'
  | 'balance_change'
  | 'deposit'
  | 'withdrawal'
  | 'payment_failed'
  | 'admin'
  | 'security'
  | 'account_status'
  | 'mining_withdrawal'

export type NotificationPriority = 'normal' | 'important'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  priority: NotificationPriority
  createdAt: string
  metadata: Record<string, string | number | boolean | null>
}
