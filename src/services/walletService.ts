import { APP_CONFIG } from '../config/appConfig'
import { ConflictError, InsufficientFundsError, ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  parseAmount,
  validateId,
  validateIdempotencyKey,
  validateLedgerMovementType,
  validateMovementDirection,
  validateMovementStatus,
  validateReference,
} from '../lib/validation'
import type {
  LedgerMovement,
  LedgerSource,
  MovementDirection,
  MovementInput,
  MovementStatus,
  WalletLedger,
  WalletSummary,
} from '../types/wallet'

const SOURCES: readonly LedgerSource[] = [
  'system',
  'aviator',
  'trading',
  'tic_tac_toe',
  'payments',
  'admin',
  'mining',
]

const DIRECTION_BY_TYPE: Record<string, readonly MovementDirection[]> = {
  initial_balance: ['credit'],
  game_stake: ['debit'],
  game_win: ['credit'],
  game_loss: ['neutral'],
  trading_open: ['debit'],
  trading_profit: ['credit'],
  trading_loss: ['credit', 'neutral'],
  deposit: ['credit'],
  withdrawal: ['debit'],
  refund: ['credit'],
  adjustment: ['credit', 'debit'],
  mining_purchase: ['debit'],
  mining_reward: ['credit'],
}

export interface WalletServiceOptions {
  storage?: StorageAdapter
  currency?: string
  initialBalance?: number
  now?: () => string
}

export interface WalletService {
  readonly currency: string
  ensureInitialBalance: (userId: string) => LedgerMovement
  getMovements: (userId: string) => LedgerMovement[]
  getLedger: (userId: string) => WalletLedger
  getBalance: (userId: string) => number
  getSummary: (userId: string, committedBalance?: number) => WalletSummary
  apply: (input: MovementInput) => LedgerMovement
  debit: (input: Omit<MovementInput, 'direction'>) => LedgerMovement
  credit: (input: Omit<MovementInput, 'direction'>) => LedgerMovement
  mark: (input: Omit<MovementInput, 'direction' | 'amount'>) => LedgerMovement
  subscribe: (listener: () => void) => () => void
}

function movementKey(userId: string): string {
  return `wallet:${userId}:ledger`
}

function readNumericMetadata(
  metadata: LedgerMovement['metadata'],
  key: string,
): number | null {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Service central du portefeuille.
 * Le solde est toujours dérivé du dernier mouvement du ledger ; il n'existe
 * aucun champ "balance" mutable séparé.
 */
export function createWalletService(options: WalletServiceOptions = {}): WalletService {
  const adapter = options.storage ?? defaultStorage
  const currency = options.currency ?? APP_CONFIG.currency
  const initialBalance = options.initialBalance ?? APP_CONFIG.demoInitialBalance
  const now = options.now ?? nowIso
  const listeners = new Set<() => void>()

  const emit = () => {
    listeners.forEach((listener) => listener())
  }

  const load = (userId: string): LedgerMovement[] => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    const stored = adapter.get<LedgerMovement[]>(movementKey(validUserId))
    if (!Array.isArray(stored)) return []
    return stored
  }

  const save = (userId: string, movements: LedgerMovement[]): void => {
    adapter.set(movementKey(userId), movements)
  }

  const apply = (input: MovementInput): LedgerMovement => {
    const userId = validateId(input.userId, 'Identifiant utilisateur')
    const type = validateLedgerMovementType(input.type)
    const direction = validateMovementDirection(input.direction)
    const status: MovementStatus = validateMovementStatus(input.status ?? 'completed')
    const source = input.source
    const reference = validateReference(input.reference)
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey)
    const createdAt = input.createdAt ?? now()

    if (!SOURCES.includes(source)) {
      throw new ValidationError("La source de l'opération est invalide.")
    }
    if (status !== 'completed') {
      throw new ValidationError('Seules les opérations terminées peuvent être inscrites au ledger.')
    }
    if (Number.isNaN(Date.parse(createdAt))) {
      throw new ValidationError("La date de l'opération est invalide.")
    }

    const allowedDirections = DIRECTION_BY_TYPE[type]
    if (!allowedDirections.includes(direction)) {
      throw new ValidationError(
        `Le sens « ${direction} » est incompatible avec le type d'opération « ${type} ».`,
      )
    }

    if (direction === 'neutral') {
      const amount = parseAmount(input.amount, {
        label: 'Le montant',
        allowZero: true,
        max: 1_000_000_000,
      })
      if (amount !== 0) {
        throw new ValidationError('Une opération neutre doit avoir un montant nul.')
      }
    } else {
      parseAmount(input.amount, { label: 'Le montant', max: 1_000_000_000 })
    }

    const movements = load(userId)
    const duplicate = movements.find((movement) => movement.idempotencyKey === idempotencyKey)
    if (duplicate) {
      const sameOperation =
        duplicate.userId === userId &&
        duplicate.type === type &&
        duplicate.direction === direction &&
        duplicate.amount === input.amount &&
        duplicate.reference === reference
      if (!sameOperation) {
        throw new ConflictError(
          "Cette clé d'idempotence a déjà été utilisée pour une autre opération.",
        )
      }
      return duplicate
    }

    const currentBalance = movements.length
      ? movements[movements.length - 1].balanceAfter
      : 0

    if (direction === 'debit' && input.amount > currentBalance) {
      throw new InsufficientFundsError()
    }

    const balanceAfter =
      direction === 'credit'
        ? currentBalance + input.amount
        : direction === 'debit'
          ? currentBalance - input.amount
          : currentBalance

    if (balanceAfter < 0) {
      throw new ValidationError('Le solde ne peut jamais devenir négatif.')
    }

    const movement: LedgerMovement = Object.freeze({
      id: createId('mv'),
      userId,
      type,
      direction,
      amount: input.amount,
      currency,
      status,
      source,
      reference,
      idempotencyKey,
      balanceAfter,
      createdAt,
      metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    })

    const next = [...movements, movement]
    save(userId, next)
    emit()
    return movement
  }

  const ensureInitialBalance = (userId: string): LedgerMovement => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    const existing = load(validUserId)
    if (existing.length > 0) return existing[0]

    return apply({
      userId: validUserId,
      type: 'initial_balance',
      direction: 'credit',
      amount: initialBalance,
      currency,
      source: 'system',
      reference: `init-${validUserId}`,
      idempotencyKey: `wallet:initial:${validUserId}`,
      metadata: { demo: true, initial: true },
    })
  }

  const getMovements = (userId: string): LedgerMovement[] => load(userId)

  const getLedger = (userId: string): WalletLedger => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    return {
      userId: validUserId,
      currency,
      movements: load(validUserId),
    }
  }

  const getBalance = (userId: string): number => {
    const movements = load(userId)
    return movements.length ? movements[movements.length - 1].balanceAfter : 0
  }

  const getSummary = (userId: string, committedBalance = 0): WalletSummary => {
    const movements = load(userId)
    const availableBalance = movements.length
      ? movements[movements.length - 1].balanceAfter
      : 0

    let totalGains = 0
    let totalLosses = 0
    let operationCount = 0

    for (const movement of movements) {
      if (movement.type === 'initial_balance') continue
      operationCount += 1
      const pnl = readNumericMetadata(movement.metadata, 'pnl')
      if (pnl !== null && pnl > 0) totalGains += pnl
      if (pnl !== null && pnl < 0) totalLosses += Math.abs(pnl)
    }

    return {
      userId,
      currency,
      availableBalance,
      committedBalance,
      totalGains,
      totalLosses,
      operationCount,
      lastMovementAt: movements.length ? movements[movements.length - 1].createdAt : null,
    }
  }

  return {
    currency,
    ensureInitialBalance,
    getMovements,
    getLedger,
    getBalance,
    getSummary,
    apply,
    debit: (input) => apply({ ...input, direction: 'debit' }),
    credit: (input) => apply({ ...input, direction: 'credit' }),
    mark: (input) =>
      apply({
        ...input,
        direction: 'neutral',
        amount: 0,
      }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const walletService = createWalletService()
