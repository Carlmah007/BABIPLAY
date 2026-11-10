export type LedgerMovementType =
  | 'initial_balance'
  | 'game_stake'
  | 'game_win'
  | 'game_loss'
  | 'trading_open'
  | 'trading_profit'
  | 'trading_loss'
  | 'deposit'
  | 'withdrawal'
  | 'refund'
  | 'adjustment'
  | 'mining_purchase'
  | 'mining_reward'

export type MovementDirection = 'debit' | 'credit' | 'neutral'

export type MovementStatus = 'completed' | 'pending' | 'cancelled'

export type LedgerSource =
  | 'system'
  | 'aviator'
  | 'trading'
  | 'tic_tac_toe'
  | 'payments'
  | 'admin'
  | 'mining'

export type MovementMetadata = Record<string, string | number | boolean | null>

export interface LedgerMovement {
  id: string
  userId: string
  type: LedgerMovementType
  direction: MovementDirection
  amount: number
  currency: string
  status: MovementStatus
  source: LedgerSource
  reference: string
  idempotencyKey: string
  balanceAfter: number
  createdAt: string
  metadata: MovementMetadata
}

export interface MovementInput {
  userId: string
  type: LedgerMovementType
  direction: MovementDirection
  amount: number
  currency: string
  source: LedgerSource
  reference: string
  idempotencyKey: string
  metadata?: MovementMetadata
  status?: MovementStatus
  createdAt?: string
}

export interface WalletSummary {
  userId: string
  currency: string
  availableBalance: number
  committedBalance: number
  totalGains: number
  totalLosses: number
  operationCount: number
  lastMovementAt: string | null
}

export interface WalletLedger {
  userId: string
  currency: string
  movements: LedgerMovement[]
}
