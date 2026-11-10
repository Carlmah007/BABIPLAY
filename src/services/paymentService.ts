import { ConflictError, PermissionError, ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { hasPermission } from '../lib/permissions'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  parseAmount,
  roundTokens,
  validateId,
  validateIdempotencyKey,
  validateWithdrawalDestination,
} from '../lib/validation'
import {
  auditService as defaultAuditService,
  createAuditService,
  type AuditService,
} from './auditService'
import {
  createNotificationService,
  notificationService as defaultNotificationService,
  type NotificationService,
} from './notificationService'
import {
  createWalletService,
  walletService as defaultWalletService,
  type WalletService,
} from './walletService'
import type { AppUser } from '../types/auth'
import type {
  DepositRequest,
  PaymentIntent,
  WithdrawalMethod,
  WithdrawalQuote,
  WithdrawalRequest,
} from '../types/payments'

const PAYMENTS_KEY = 'payments:intents'

/**
 * Règles de retrait de démonstration, alignées sur les pratiques des
 * opérateurs (Betclic / 1xBet) : seuil minimum, frais affichés, vérification
 * du compte, validation par un opérateur habilité, une seule demande en attente.
 *
 * Aucun prestataire de paiement réel n'est appelé : les montants restent des
 * jetons virtuels et le ledger local est la seule source de vérité.
 */
export const PAYMENT_RULES = Object.freeze({
  minDeposit: 500,
  maxDeposit: 1_000_000,
  minWithdrawal: 500,
  maxWithdrawal: 100_000,
  /** Frais de retrait : 0 % en démonstration, toujours affichés avant validation. */
  withdrawalFeeRate: 0,
  provider: 'demo-sandbox',
  processing:
    'Les retraits passent en attente puis sont validés par un Super Admin habilité (payments.manage).',
  methods: Object.freeze(['mobile_money', 'bank_transfer', 'crypto'] as WithdrawalMethod[]),
})

export interface PaymentServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  wallet?: WalletService
  notifications?: NotificationService
  audit?: AuditService
}

export interface PaymentService {
  requestDeposit: (actor: AppUser, input: DepositRequest) => PaymentIntent
  requestWithdrawal: (actor: AppUser, input: WithdrawalRequest) => PaymentIntent
  approveWithdrawal: (actor: AppUser, intentId: string, justification: string) => PaymentIntent
  rejectWithdrawal: (actor: AppUser, intentId: string, justification: string) => PaymentIntent
  cancelWithdrawal: (actor: AppUser, intentId: string) => PaymentIntent
  getQuote: (userId: string, amount: number) => WithdrawalQuote
  reservedAmount: (userId: string) => number
  availableToWithdraw: (userId: string) => number
  list: (userId?: string) => PaymentIntent[]
  listPendingWithdrawals: () => PaymentIntent[]
  get: (intentId: string) => PaymentIntent | null
  subscribe: (listener: () => void) => () => void
}

const PAYMENT_STATUSES = ['pending', 'processing', 'confirmed', 'failed', 'cancelled', 'refunded'] as const

function isPaymentIntent(value: unknown): value is PaymentIntent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PaymentIntent>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.userId === 'string' &&
    (candidate.kind === 'deposit' || candidate.kind === 'withdrawal') &&
    typeof candidate.amount === 'number' &&
    typeof candidate.status === 'string' &&
    (PAYMENT_STATUSES as readonly string[]).includes(candidate.status)
  )
}

function loadIntents(adapter: StorageAdapter): PaymentIntent[] {
  const stored = adapter.get<unknown>(PAYMENTS_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter(isPaymentIntent)
}

function saveIntents(adapter: StorageAdapter, intents: PaymentIntent[]): void {
  adapter.set(PAYMENTS_KEY, intents)
}

function assertActiveUser(actor: AppUser | null): AppUser {
  if (!actor || actor.status !== 'active') {
    throw new PermissionError('Compte inactif ou introuvable.')
  }
  return actor
}

function assertReviewer(actor: AppUser): void {
  if (!hasPermission(actor, 'payments.manage')) {
    throw new PermissionError("Vous n'avez pas la permission de gérer les paiements.")
  }
}

export function createPaymentService(options: PaymentServiceOptions = {}): PaymentService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const wallet =
    options.wallet ?? (options.storage ? createWalletService({ storage: adapter }) : defaultWalletService)
  const notifications =
    options.notifications ??
    (options.storage
      ? createNotificationService({ storage: adapter })
      : defaultNotificationService)
  const audit =
    options.audit ?? (options.storage ? createAuditService({ storage: adapter }) : defaultAuditService)
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const get = (intentIdInput: string): PaymentIntent | null => {
    const intentId = validateId(intentIdInput, "Identifiant d'opération")
    const stored = loadIntents(adapter).find((intent) => intent.id === intentId) ?? null
    return stored ? Object.freeze({ ...stored }) : null
  }

  const list = (userId?: string): PaymentIntent[] => {
    const intents = [...loadIntents(adapter)]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((intent) => Object.freeze({ ...intent }))
    if (userId === undefined) return intents
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    return intents.filter((intent) => intent.userId === validUserId)
  }

  const reservedAmount = (userIdInput: string): number => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    return loadIntents(adapter)
      .filter(
        (intent) =>
          intent.userId === userId &&
          intent.kind === 'withdrawal' &&
          (intent.status === 'pending' || intent.status === 'processing'),
      )
      .reduce((total, intent) => total + intent.amount, 0)
  }

  const availableToWithdraw = (userIdInput: string): number => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    return Math.max(0, wallet.getBalance(userId) - reservedAmount(userId))
  }

  const hasPendingWithdrawal = (userId: string): boolean =>
    loadIntents(adapter).some(
      (intent) =>
        intent.userId === userId &&
        intent.kind === 'withdrawal' &&
        (intent.status === 'pending' || intent.status === 'processing'),
    )

  const getQuote = (userIdInput: string, amountInput: number): WithdrawalQuote => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    let amount = 0
    try {
      amount = parseAmount(amountInput, {
        label: 'Le retrait',
        allowZero: true,
        max: PAYMENT_RULES.maxWithdrawal,
      })
    } catch {
      amount = 0
    }
    const fee = roundTokens(amount * PAYMENT_RULES.withdrawalFeeRate)
    const netAmount = Math.max(0, amount - fee)
    const available = availableToWithdraw(userId)
    const reserved = reservedAmount(userId)

    let reason: string | null = null
    if (hasPendingWithdrawal(userId)) {
      reason = 'Une demande de retrait est déjà en attente de validation.'
    } else if (amount < PAYMENT_RULES.minWithdrawal) {
      reason = `Le retrait minimum est de ${PAYMENT_RULES.minWithdrawal} jetons.`
    } else if (amount > available) {
      reason = 'Le montant dépasse le solde disponible (hors retraits en attente).'
    }

    return Object.freeze({
      amount,
      fee,
      netAmount,
      available,
      reserved,
      minimum: PAYMENT_RULES.minWithdrawal,
      canRequest: reason === null,
      reason,
    })
  }

  const findByIdempotencyKey = (
    userId: string,
    kind: PaymentIntent['kind'],
    idempotencyKey: string,
  ): PaymentIntent | null =>
    loadIntents(adapter).find(
      (intent) =>
        intent.userId === userId &&
        intent.kind === kind &&
        intent.idempotencyKey === idempotencyKey,
    ) ?? null

  const requestDeposit = (actorInput: AppUser, input: DepositRequest): PaymentIntent => {
    const actor = assertActiveUser(actorInput)
    const amount = parseAmount(input.amount, {
      label: 'Le dépôt',
      min: PAYMENT_RULES.minDeposit,
      max: PAYMENT_RULES.maxDeposit,
    })
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey)

    const existing = findByIdempotencyKey(actor.id, 'deposit', idempotencyKey)
    if (existing) {
      if (existing.amount !== amount) {
        throw new ConflictError("Cette clé d'idempotence a déjà servi pour un autre dépôt.")
      }
      return Object.freeze({ ...existing })
    }

    const at = now()
    const intentId = createId('pay')
    wallet.ensureInitialBalance(actor.id)
    wallet.credit({
      userId: actor.id,
      type: 'deposit',
      amount,
      currency: wallet.currency,
      source: 'payments',
      reference: `payment:deposit:${intentId}`,
      idempotencyKey: `payment:deposit:${intentId}`,
      metadata: {
        intentId,
        method: input.method ?? 'mobile_money',
        provider: PAYMENT_RULES.provider,
        demo: true,
      },
      createdAt: at,
    })

    const intent: PaymentIntent = Object.freeze({
      id: intentId,
      userId: actor.id,
      kind: 'deposit',
      amount,
      currency: wallet.currency,
      status: 'confirmed',
      reference: `payment:deposit:${intentId}`,
      idempotencyKey,
      provider: PAYMENT_RULES.provider,
      method: input.method ?? 'mobile_money',
      destination: null,
      fee: 0,
      netAmount: amount,
      createdAt: at,
      updatedAt: at,
      reviewedBy: null,
      reviewedAt: null,
      failureReason: null,
      demo: true,
    })

    saveIntents(adapter, [intent, ...loadIntents(adapter)])

    notifications.add({
      userId: actor.id,
      type: 'deposit',
      title: `Dépôt de ${amount} jetons confirmé`,
      message: `Dépôt de démonstration crédité via ${PAYMENT_RULES.provider}. Aucun argent réel.`,
      priority: 'important',
      createdAt: at,
      metadata: { intentId, amount, provider: PAYMENT_RULES.provider, demo: true },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'payment_deposit',
      targetType: 'payment',
      targetId: intentId,
      justification: 'Dépôt de démonstration crédité instantanément (aucun prestataire réel).',
      createdAt: at,
      metadata: { amount, provider: PAYMENT_RULES.provider, demo: true },
    })

    emit()
    return Object.freeze({ ...intent })
  }

  const requestWithdrawal = (actorInput: AppUser, input: WithdrawalRequest): PaymentIntent => {
    const actor = assertActiveUser(actorInput)
    const amount = parseAmount(input.amount, {
      label: 'Le retrait',
      min: PAYMENT_RULES.minWithdrawal,
      max: PAYMENT_RULES.maxWithdrawal,
    })
    const destination = validateWithdrawalDestination(input.destination)
    if (!PAYMENT_RULES.methods.includes(input.method)) {
      throw new ValidationError('Moyen de retrait invalide.')
    }
    if (!input.conditionsAccepted) {
      throw new ValidationError(
        'Vous devez accepter les conditions de retrait et confirmer la vérification du compte.',
      )
    }
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey)

    const existing = findByIdempotencyKey(actor.id, 'withdrawal', idempotencyKey)
    if (existing) {
      if (existing.amount !== amount || existing.destination !== destination) {
        throw new ConflictError("Cette clé d'idempotence a déjà servi pour un autre retrait.")
      }
      return Object.freeze({ ...existing })
    }
    if (hasPendingWithdrawal(actor.id)) {
      throw new ConflictError('Une demande de retrait est déjà en attente de validation.')
    }
    const available = availableToWithdraw(actor.id)
    if (amount > available) {
      throw new ValidationError(
        `Solde disponible insuffisant : ${available} jetons (hors retraits en attente).`,
      )
    }

    const at = now()
    const intentId = createId('pay')
    const fee = roundTokens(amount * PAYMENT_RULES.withdrawalFeeRate)
    const netAmount = Math.max(0, amount - fee)
    const intent: PaymentIntent = Object.freeze({
      id: intentId,
      userId: actor.id,
      kind: 'withdrawal',
      amount,
      currency: wallet.currency,
      status: 'pending',
      reference: `payment:withdrawal:${intentId}`,
      idempotencyKey,
      provider: PAYMENT_RULES.provider,
      method: input.method,
      destination,
      fee,
      netAmount,
      createdAt: at,
      updatedAt: at,
      reviewedBy: null,
      reviewedAt: null,
      failureReason: null,
      demo: true,
    })

    saveIntents(adapter, [intent, ...loadIntents(adapter)])

    notifications.add({
      userId: actor.id,
      type: 'withdrawal',
      title: `Retrait de ${amount} jetons en attente`,
      message: `Demande enregistrée vers ${destination}. Validation par un opérateur habilité.`,
      priority: 'important',
      createdAt: at,
      metadata: { intentId, amount, fee, netAmount, method: input.method, demo: true },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'payment_withdrawal_requested',
      targetType: 'payment',
      targetId: intentId,
      justification: `Demande de retrait de ${amount} jetons (${input.method}).`,
      createdAt: at,
      metadata: {
        amount,
        fee,
        netAmount,
        method: input.method,
        destination,
        demo: true,
      },
    })

    emit()
    return Object.freeze({ ...intent })
  }

  const updateStatus = (
    actor: AppUser,
    intentIdInput: string,
    status: PaymentIntent['status'],
    failureReason: string | null = null,
  ): PaymentIntent => {
    const intentId = validateId(intentIdInput, "Identifiant d'opération")
    const at = now()
    const intents = loadIntents(adapter)
    const index = intents.findIndex((intent) => intent.id === intentId)
    if (index < 0) throw new ValidationError('Opération de paiement introuvable.')
    const intent = intents[index]
    if (intent.kind !== 'withdrawal') {
      throw new ValidationError("Seuls les retraits peuvent être validés ou refusés.")
    }
    if (intent.status !== 'pending' && intent.status !== 'processing') {
      throw new ConflictError('Cette demande a déjà été traitée.')
    }

    const updated: PaymentIntent = Object.freeze({
      ...intent,
      status,
      updatedAt: at,
      reviewedBy: actor.id,
      reviewedAt: at,
      failureReason,
    })
    const copy = [...intents]
    copy[index] = updated
    saveIntents(adapter, copy)
    return Object.freeze({ ...updated })
  }

  const approveWithdrawal = (
    actorInput: AppUser,
    intentId: string,
    justificationInput: string,
  ): PaymentIntent => {
    const actor = assertActiveUser(actorInput)
    assertReviewer(actor)
    const justification = justificationInput.trim()
    if (justification.length < 10) {
      throw new ValidationError('Une justification de 10 caractères minimum est requise.')
    }
    const intent = get(intentId)
    if (!intent) throw new ValidationError('Opération de paiement introuvable.')
    if (intent.userId === actor.id) {
      throw new PermissionError(
        'Séparation des duties : vous ne pouvez pas valider votre propre retrait.',
      )
    }
    if (wallet.getBalance(intent.userId) < intent.amount) {
      throw new ConflictError('Solde insuffisant pour honorer ce retrait. Refusez la demande.')
    }

    const at = now()
    wallet.debit({
      userId: intent.userId,
      type: 'withdrawal',
      amount: intent.amount,
      currency: wallet.currency,
      source: 'payments',
      reference: intent.reference,
      idempotencyKey: `payment:withdrawal:debit:${intent.id}`,
      metadata: {
        intentId: intent.id,
        method: intent.method,
        destination: intent.destination,
        fee: intent.fee,
        netAmount: intent.netAmount,
        provider: intent.provider,
        demo: true,
      },
      createdAt: at,
    })

    const updated = updateStatus(actor, intent.id, 'confirmed')

    notifications.add({
      userId: intent.userId,
      type: 'withdrawal',
      title: `Retrait de ${intent.amount} jetons validé`,
      message: `Validation effectuée. Net versé : ${intent.netAmount} jetons (frais ${intent.fee}).`,
      priority: 'important',
      createdAt: at,
      metadata: { intentId: intent.id, amount: intent.amount, netAmount: intent.netAmount, demo: true },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'payment_withdrawal_approved',
      targetType: 'payment',
      targetId: intent.id,
      justification,
      createdAt: at,
      metadata: {
        amount: intent.amount,
        fee: intent.fee,
        netAmount: intent.netAmount,
        userId: intent.userId,
        demo: true,
      },
    })

    emit()
    return updated
  }

  const rejectWithdrawal = (
    actorInput: AppUser,
    intentId: string,
    justificationInput: string,
  ): PaymentIntent => {
    const actor = assertActiveUser(actorInput)
    assertReviewer(actor)
    const justification = justificationInput.trim()
    if (justification.length < 10) {
      throw new ValidationError('Une justification de 10 caractères minimum est requise.')
    }
    const intent = get(intentId)
    if (!intent) throw new ValidationError('Opération de paiement introuvable.')

    const updated = updateStatus(actor, intent.id, 'cancelled', justification)
    const at = now()

    notifications.add({
      userId: intent.userId,
      type: 'payment_failed',
      title: `Retrait de ${intent.amount} jetons refusé`,
      message: `Motif : ${justification}. Les jetons restent disponibles sur votre portefeuille.`,
      priority: 'important',
      createdAt: at,
      metadata: { intentId: intent.id, amount: intent.amount, demo: true },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'payment_withdrawal_rejected',
      targetType: 'payment',
      targetId: intent.id,
      justification,
      createdAt: at,
      metadata: { amount: intent.amount, userId: intent.userId, demo: true },
    })

    emit()
    return updated
  }

  const cancelWithdrawal = (actorInput: AppUser, intentId: string): PaymentIntent => {
    const actor = assertActiveUser(actorInput)
    const intent = get(intentId)
    if (!intent) throw new ValidationError('Opération de paiement introuvable.')
    if (intent.userId !== actor.id) {
      throw new PermissionError("Cette demande ne vous appartient pas.")
    }
    if (intent.kind !== 'withdrawal') {
      throw new ValidationError('Seul un retrait peut être annulé.')
    }
    if (intent.status !== 'pending' && intent.status !== 'processing') {
      throw new ConflictError('Cette demande a déjà été traitée.')
    }
    const at = now()
    const intents = loadIntents(adapter)
    const index = intents.findIndex((candidate) => candidate.id === intent.id)
    const updated: PaymentIntent = Object.freeze({
      ...intents[index],
      status: 'cancelled',
      updatedAt: at,
      failureReason: 'Annulé par le joueur.',
    })
    const copy = [...intents]
    copy[index] = updated
    saveIntents(adapter, copy)

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'payment_withdrawal_rejected',
      targetType: 'payment',
      targetId: intent.id,
      justification: 'Retrait annulé par le joueur avant validation.',
      createdAt: at,
      metadata: { amount: intent.amount, userId: actor.id, demo: true },
    })

    emit()
    return Object.freeze({ ...updated })
  }

  return {
    requestDeposit,
    requestWithdrawal,
    approveWithdrawal,
    rejectWithdrawal,
    cancelWithdrawal,
    getQuote,
    reservedAmount,
    availableToWithdraw,
    list,
    listPendingWithdrawals: () =>
      list().filter(
        (intent) =>
          intent.kind === 'withdrawal' &&
          (intent.status === 'pending' || intent.status === 'processing'),
      ),
    get,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const paymentService = createPaymentService()
