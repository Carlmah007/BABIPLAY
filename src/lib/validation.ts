import { InsufficientFundsError, ValidationError } from './errors'
import type { AuditAction, AuditTargetType } from '../types/admin'
import type { AviatorStatus } from '../types/games'
import type { NotificationPriority, NotificationType } from '../types/notifications'
import type { PaymentStatus } from '../types/payments'
import type { AssetSymbol, TradeDirection } from '../types/trading'
import type { Role } from '../types/auth'
import type { LedgerMovementType, MovementDirection, MovementStatus } from '../types/wallet'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ID_PATTERN = /^[A-Za-z0-9:_-]{3,120}$/
const KEY_PATTERN = /^[A-Za-z0-9:_.-]{8,180}$/

export const LEDGER_MOVEMENT_TYPES: readonly LedgerMovementType[] = [
  'initial_balance',
  'game_stake',
  'game_win',
  'game_loss',
  'trading_open',
  'trading_profit',
  'trading_loss',
  'deposit',
  'withdrawal',
  'refund',
  'adjustment',
  'mining_purchase',
  'mining_reward',
]

export const MOVEMENT_DIRECTIONS: readonly MovementDirection[] = ['debit', 'credit', 'neutral']

export const MOVEMENT_STATUSES: readonly MovementStatus[] = ['completed', 'pending', 'cancelled']

export const AVIATOR_STATUSES: readonly AviatorStatus[] = [
  'created',
  'started',
  'running',
  'completed',
  'settled',
  'cancelled',
]

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'pending',
  'processing',
  'confirmed',
  'failed',
  'cancelled',
  'refunded',
]

export const ASSET_SYMBOLS: readonly AssetSymbol[] = ['BTC', 'ETH', 'EURUSD', 'GOLD', 'NASDAQ']

export const TRADE_DIRECTIONS: readonly TradeDirection[] = ['long', 'short']

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'user_suspended',
  'user_reactivated',
  'balance_adjusted',
  'role_changed',
  'payment_setting_changed',
  'transaction_refunded',
  'admin_access_denied',
  'game_settled',
  'payment_deposit',
  'payment_withdrawal_requested',
  'payment_withdrawal_approved',
  'payment_withdrawal_rejected',
  'mining_started',
  'mining_stopped',
  'mining_machine_purchased',
  'mining_withdrawal_blocked',
  'mining_withdrawal',
  'mining_setting_changed',
]

export const AUDIT_TARGET_TYPES: readonly AuditTargetType[] = [
  'user',
  'wallet',
  'payment',
  'setting',
  'system',
  'mining',
]

export const ROLES: readonly Role[] = ['player', 'moderator', 'admin', 'super_admin']

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'game_win',
  'game_loss',
  'game_result',
  'balance_change',
  'deposit',
  'withdrawal',
  'payment_failed',
  'admin',
  'security',
  'account_status',
  'mining_withdrawal',
]

export const NOTIFICATION_PRIORITIES: readonly NotificationPriority[] = ['normal', 'important']

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

export function assertOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (!isOneOf(value, allowed)) {
    throw new ValidationError(`${label} est invalide.`)
  }
  return value
}

export function assertNonEmptyString(
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {},
): string {
  if (typeof value !== 'string') throw new ValidationError(`${label} doit être un texte.`)
  const trimmed = value.trim()
  const min = options.min ?? 1
  const max = options.max ?? 500
  if (trimmed.length < min) {
    throw new ValidationError(`${label} doit contenir au moins ${min} caractères.`)
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${label} ne peut pas dépasser ${max} caractères.`)
  }
  return trimmed
}

export interface AmountOptions {
  label?: string
  min?: number
  max?: number
  allowZero?: boolean
  integer?: boolean
}

/** Valide et normalise un montant saisi par l'utilisateur. */
export function parseAmount(value: unknown, options: AmountOptions = {}): number {
  const label = options.label ?? 'Le montant'
  const integer = options.integer ?? true

  let numeric: number
  if (typeof value === 'number') {
    numeric = value
  } else if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
    if (!normalized) throw new ValidationError(`${label} est requis.`)
    numeric = Number(normalized)
  } else {
    throw new ValidationError(`${label} doit être un nombre.`)
  }

  if (!Number.isFinite(numeric)) {
    throw new ValidationError(`${label} doit être un nombre valide.`)
  }
  if (integer && !Number.isInteger(numeric)) {
    throw new ValidationError(`${label} doit être un nombre entier de jetons.`)
  }

  const minimum = options.allowZero ? 0 : (options.min ?? 1)
  if (numeric < minimum) {
    throw new ValidationError(
      minimum === 0 ? `${label} ne peut pas être négatif.` : `${label} doit être supérieur à 0.`,
    )
  }
  if (options.max !== undefined && numeric > options.max) {
    throw new ValidationError(`${label} ne peut pas dépasser ${options.max}.`)
  }

  return numeric
}

export function parseOptionalAmount(value: unknown, options: AmountOptions = {}): number | null {
  if (value === '' || value === null || value === undefined) return null
  return parseAmount(value, options)
}

export function validateStake(value: unknown, availableBalance: number): number {
  const stake = parseAmount(value, { label: 'La mise', max: 1_000_000 })
  assertSufficientFunds(stake, availableBalance)
  return stake
}

export function assertSufficientFunds(amount: number, availableBalance: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('Le montant doit être un entier positif.')
  }
  if (amount > availableBalance) throw new InsufficientFundsError()
}

export function validateId(value: unknown, label = 'Identifiant'): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ValidationError(`${label} est invalide.`)
  }
  return value
}

export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) {
    throw new ValidationError("La clé d'idempotence est invalide.")
  }
  return value
}

export function validateReference(value: unknown): string {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) {
    throw new ValidationError('La référence de transaction est invalide.')
  }
  return value
}

export function validateLedgerMovementType(value: unknown): LedgerMovementType {
  return assertOneOf(value, LEDGER_MOVEMENT_TYPES, "Le type d'opération")
}

export function validateMovementDirection(value: unknown): MovementDirection {
  return assertOneOf(value, MOVEMENT_DIRECTIONS, "Le sens de l'opération")
}

export function validateMovementStatus(value: unknown): MovementStatus {
  return assertOneOf(value, MOVEMENT_STATUSES, "Le statut de l'opération")
}

export function validateAviatorStatus(value: unknown): AviatorStatus {
  return assertOneOf(value, AVIATOR_STATUSES, 'Le statut de la manche')
}

export function validatePaymentStatus(value: unknown): PaymentStatus {
  return assertOneOf(value, PAYMENT_STATUSES, 'Le statut du paiement')
}

export function validateAssetSymbol(value: unknown): AssetSymbol {
  return assertOneOf(value, ASSET_SYMBOLS, "L'actif")
}

export function validateTradeDirection(value: unknown): TradeDirection {
  return assertOneOf(value, TRADE_DIRECTIONS, 'La direction de la position')
}

export function validateAuditAction(value: unknown): AuditAction {
  return assertOneOf(value, AUDIT_ACTIONS, "L'action d'audit")
}

export function validateAuditTargetType(value: unknown): AuditTargetType {
  return assertOneOf(value, AUDIT_TARGET_TYPES, "Le type de cible d'audit")
}

export function validateRole(value: unknown): Role {
  return assertOneOf(value, ROLES, 'Le rôle')
}

export function validateNotificationType(value: unknown): NotificationType {
  return assertOneOf(value, NOTIFICATION_TYPES, 'Le type de notification')
}

export function validateNotificationPriority(value: unknown): NotificationPriority {
  return assertOneOf(value, NOTIFICATION_PRIORITIES, 'La priorité de notification')
}

export function validateMultiplier(value: unknown, label = 'Le multiplicateur'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 1000) {
    throw new ValidationError(`${label} doit être compris entre 1 et 1000.`)
  }
  return value
}

export function validateCrashMultiplier(value: unknown): number {
  const multiplier = validateMultiplier(value, 'Le multiplicateur de crash')
  if (multiplier < 1.01) {
    throw new ValidationError('Le multiplicateur de crash doit être supérieur à 1.')
  }
  return multiplier
}

export function validateLeverage(value: unknown): number {
  const leverage = parseAmount(value, { label: 'Le levier', min: 1, max: 20 })
  return leverage
}

export function validatePrice(value: unknown, label = 'Le prix'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${label} doit être un nombre strictement positif.`)
  }
  return value
}

export function validateJustification(value: unknown): string {
  return assertNonEmptyString(value, 'La justification', { min: 10, max: 500 })
}

export function normalizeEmail(value: unknown): string {
  return assertNonEmptyString(value, "L'adresse e-mail", { min: 5, max: 254 }).toLowerCase()
}

export function validateEmail(value: unknown): string {
  const email = normalizeEmail(value)
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("L'adresse e-mail n'est pas valide.")
  }
  return email
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('Le mot de passe est requis.')
  if (value.length < 8) {
    throw new ValidationError('Le mot de passe doit contenir au moins 8 caractères.')
  }
  if (value.length > 128) {
    throw new ValidationError('Le mot de passe ne peut pas dépasser 128 caractères.')
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new ValidationError('Le mot de passe doit contenir au moins une lettre et un chiffre.')
  }
  return value
}

export function validateDisplayName(value: unknown): string {
  const name = assertNonEmptyString(value, 'Le nom affiché', { min: 2, max: 40 })
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32) {
      throw new ValidationError('Le nom affiché contient des caractères interdits.')
    }
  }
  return name
}

export function validateWithdrawalDestination(value: unknown): string {
  return assertNonEmptyString(value, 'Le compte bénéficiaire', { min: 4, max: 120 })
}

/** Arrondit un gain/perte en jetons entiers, sans valeur négative. */
export function roundTokens(value: number): number {
  if (!Number.isFinite(value)) throw new ValidationError('Le montant calculé est invalide.')
  return Math.max(0, Math.round(value))
}

/** Vérifie qu'une saisie est un entier dans un intervalle. */
export function validateIntegerInRange(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  return parseAmount(value, { label, min, max, allowZero: min === 0 })
}
