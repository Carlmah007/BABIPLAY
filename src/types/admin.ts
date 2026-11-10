import type { Role } from './auth'

export type AuditAction =
  | 'user_suspended'
  | 'user_reactivated'
  | 'balance_adjusted'
  | 'role_changed'
  | 'payment_setting_changed'
  | 'transaction_refunded'
  | 'admin_access_denied'
  | 'game_settled'
  | 'payment_deposit'
  | 'payment_withdrawal_requested'
  | 'payment_withdrawal_approved'
  | 'payment_withdrawal_rejected'
  | 'mining_started'
  | 'mining_stopped'
  | 'mining_machine_purchased'
  | 'mining_withdrawal_blocked'
  | 'mining_withdrawal'
  | 'mining_setting_changed'

export type AuditTargetType = 'user' | 'wallet' | 'payment' | 'setting' | 'system' | 'mining'

export interface AuditLog {
  id: string
  actorId: string
  /** `system` pour les règlements automatiques de jeu. */
  actorRole: Role | 'system'
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  justification: string
  createdAt: string
  metadata: Record<string, string | number | boolean | null>
}

export interface AdminStats {
  totalUsers: number
  activeUsers: number
  suspendedUsers: number
  totalMovements: number
  totalVolume: number
  openPositions: number
  unresolvedPayments: number
}
