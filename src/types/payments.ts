export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export type PaymentKind = 'deposit' | 'withdrawal'

/**
 * Moyens de retrait proposés en démonstration.
 * Aucun appel à un prestataire réel n'est effectué : seuls les soldes virtuels
 * et le ledger local sont mouvementés.
 */
export type WithdrawalMethod = 'mobile_money' | 'bank_transfer' | 'crypto'

export const WITHDRAWAL_METHOD_LABELS: Readonly<Record<WithdrawalMethod, string>> = Object.freeze({
  mobile_money: 'Mobile money',
  bank_transfer: 'Virement bancaire',
  crypto: 'Crypto (USDT)',
})

export interface PaymentIntent {
  id: string
  userId: string
  kind: PaymentKind
  amount: number
  currency: string
  status: PaymentStatus
  reference: string
  idempotencyKey: string
  provider: string
  method: WithdrawalMethod | null
  destination: string | null
  /** Frais prélevés sur le retrait (0 en démonstration). */
  fee: number
  /** Montant net versé au bénéficiaire après frais. */
  netAmount: number
  createdAt: string
  updatedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  failureReason: string | null
  demo: true
}

export interface DepositRequest {
  amount: number
  idempotencyKey: string
  method?: WithdrawalMethod
}

export interface WithdrawalRequest {
  amount: number
  destination: string
  idempotencyKey: string
  method: WithdrawalMethod
  /** Confirmation explicite des conditions (KYC et règles de retrait). */
  conditionsAccepted: boolean
}

export interface WithdrawalQuote {
  amount: number
  fee: number
  netAmount: number
  available: number
  reserved: number
  minimum: number
  canRequest: boolean
  reason: string | null
}

export interface PaymentResult {
  intent: PaymentIntent
  redirectUrl: string | null
}
