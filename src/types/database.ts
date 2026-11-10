import type { AccountStatus, Role } from './auth'
import type { AuditAction, AuditTargetType } from './admin'
import type { NotificationPriority, NotificationType } from './notifications'
import type {
  LedgerMovementType,
  LedgerSource,
  MovementDirection,
  MovementStatus,
} from './wallet'

/**
 * Types générés à la main, alignés sur `supabase/migrations/…_init.sql`.
 * À régénérer avec `supabase gen types typescript` une fois le projet connecté.
 */

export type Json = Record<string, string | number | boolean | null>

export type ProfileRow = {
  id: string
  email: string
  display_name: string
  role: Role
  status: AccountStatus
  created_at: string
  updated_at: string
}

export type LedgerMovementRow = {
  id: string
  user_id: string
  type: LedgerMovementType
  direction: MovementDirection
  amount: number
  currency: string
  status: MovementStatus
  source: LedgerSource
  reference: string
  idempotency_key: string
  balance_after: number
  created_at: string
  metadata: Json
}

export type AuditLogRow = {
  id: string
  actor_id: string | null
  actor_role: Role | 'system'
  action: AuditAction
  target_type: AuditTargetType
  target_id: string
  justification: string
  created_at: string
  metadata: Json
}

export type NotificationRow = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  priority: NotificationPriority
  created_at: string
  metadata: Json
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Partial<ProfileRow>
        Update: Partial<ProfileRow>
        Relationships: []
      }
      ledger_movements: {
        Row: LedgerMovementRow
        Insert: Omit<LedgerMovementRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
        Relationships: []
      }
      audit_logs: {
        Row: AuditLogRow
        Insert: Omit<AuditLogRow, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
        Relationships: []
      }
      notifications: {
        Row: NotificationRow
        Insert: Omit<NotificationRow, 'id' | 'created_at' | 'read'> & {
          id?: string
          created_at?: string
          read?: boolean
        }
        Update: { read?: boolean }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      current_balance: { Args: { p_user_id: string }; Returns: number }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
