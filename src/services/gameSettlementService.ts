import { ConflictError, ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import { parseAmount, validateId } from '../lib/validation'
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
import type { GameKind } from '../types/games'
import type { LedgerMovement, LedgerSource } from '../types/wallet'

const SETTLEMENTS_KEY = 'games:settlements'
const GAME_KINDS: readonly GameKind[] = ['aviator', 'trading', 'tic_tac_toe']

export type SettlementOutcome =
  | 'cashout'
  | 'crash'
  | 'manual_close'
  | 'stop_loss'
  | 'take_profit'
  | 'expired'
  | 'win'
  | 'loss'
  | 'draw'

const SETTLEMENT_OUTCOMES: readonly SettlementOutcome[] = [
  'cashout',
  'crash',
  'manual_close',
  'stop_loss',
  'take_profit',
  'expired',
  'win',
  'loss',
  'draw',
]

const SOURCE_BY_GAME: Record<GameKind, LedgerSource> = {
  aviator: 'aviator',
  trading: 'trading',
  tic_tac_toe: 'tic_tac_toe',
}

export interface SettlementRequest {
  game: GameKind
  roundId: string
  userId: string
  stake: number
  /** Total rendu au joueur (mise incluse), jamais négatif. */
  payout: number
  outcome: SettlementOutcome
  settledAt?: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface GameSettlement {
  id: string
  game: GameKind
  roundId: string
  userId: string
  stake: number
  payout: number
  pnl: number
  outcome: SettlementOutcome
  source: LedgerSource
  settledAt: string
  ledgerMovementId: string | null
  notificationId: string
  auditId: string
}

export interface SettlementResult extends GameSettlement {
  alreadySettled: boolean
}

export interface GameSettlementServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  wallet?: WalletService
  notifications?: NotificationService
  audit?: AuditService
}

export interface GameSettlementService {
  settle: (request: SettlementRequest) => SettlementResult
  get: (game: GameKind, roundId: string) => GameSettlement | null
  list: (userId?: string) => GameSettlement[]
  subscribe: (listener: () => void) => () => void
}

function assertGameKind(value: unknown): GameKind {
  if (typeof value !== 'string' || !(GAME_KINDS as readonly string[]).includes(value)) {
    throw new ValidationError('Type de jeu invalide pour le règlement.')
  }
  return value as GameKind
}

function assertOutcome(value: unknown): SettlementOutcome {
  if (typeof value !== 'string' || !(SETTLEMENT_OUTCOMES as readonly string[]).includes(value)) {
    throw new ValidationError('Résultat de règlement invalide.')
  }
  return value as SettlementOutcome
}

function settlementKey(game: GameKind, roundId: string): string {
  return `${game}:${roundId}`
}

/**
 * Contrôle d'intégrité côté règlement : le gain Tic-Tac-Toe doit correspondre
 * exactement à la cote convenue à la création de la partie.
 * - victoire : mise × cote ;
 * - match nul : mise remboursée ;
 * - défaite : aucun gain ;
 * - partie gratuite : aucun gain possible.
 */
function assertTicTacToePayoutConsistency(
  game: GameKind,
  stake: number,
  payout: number,
  outcome: SettlementOutcome,
  metadata: SettlementRequest['metadata'],
): void {
  if (game !== 'tic_tac_toe') return
  if (stake === 0) {
    if (payout !== 0) {
      throw new ValidationError('Une partie gratuite ne peut pas verser de gain.')
    }
    return
  }
  const rawMultiplier = metadata?.multiplier
  const multiplier = typeof rawMultiplier === 'number' ? rawMultiplier : Number.NaN
  const expectedPayout =
    outcome === 'win'
      ? Math.round(stake * multiplier)
      : outcome === 'draw'
        ? stake
        : outcome === 'loss'
          ? 0
          : Number.NaN
  if (!Number.isFinite(expectedPayout) || payout !== expectedPayout) {
    throw new ValidationError(
      'Le gain Tic-Tac-Toe ne correspond pas à la cote convenue. Règlement refusé.',
    )
  }
}

function loadSettlements(adapter: StorageAdapter): GameSettlement[] {
  const stored = adapter.get<unknown>(SETTLEMENTS_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter((entry): entry is GameSettlement => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Partial<GameSettlement>
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.game === 'string' &&
      typeof candidate.roundId === 'string' &&
      typeof candidate.userId === 'string' &&
      typeof candidate.stake === 'number' &&
      typeof candidate.payout === 'number' &&
      typeof candidate.pnl === 'number' &&
      typeof candidate.outcome === 'string' &&
      typeof candidate.settledAt === 'string'
    )
  })
}

function saveSettlements(adapter: StorageAdapter, settlements: GameSettlement[]): void {
  adapter.set(SETTLEMENTS_KEY, settlements)
}

function notificationContent(
  request: SettlementRequest,
  pnl: number,
): { type: 'game_win' | 'game_loss' | 'game_result'; title: string; message: string } {
  if (pnl > 0) {
    return {
      type: 'game_win',
      title: `Gain de ${request.payout} jetons`,
      message: `Mise ${request.stake} jetons, gain net +${pnl} jetons (${request.outcome}).`,
    }
  }
  if (pnl < 0) {
    return {
      type: 'game_loss',
      title: `Perte de ${Math.abs(pnl)} jetons`,
      message: `Mise ${request.stake} jetons, résultat ${request.outcome}.`,
    }
  }
  return {
    type: 'game_result',
    title: 'Partie réglée sans gain net',
    message: `Mise ${request.stake} jetons, remboursement ${request.payout} jetons.`,
  }
}

/**
 * Règlement commun à tous les jeux.
 *
 * - une seule écriture de ledger par manche (`game:settle:{jeu}:{manche}`) ;
 * - un règlement déjà enregistré est renvoyé tel quel (`alreadySettled`) ;
 * - aucun résultat ne peut être recalculé avec un autre montant ;
 */
export function createGameSettlementService(
  options: GameSettlementServiceOptions = {},
): GameSettlementService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const wallet =
    options.wallet ?? (options.storage ? createWalletServiceFor(options.storage) : defaultWalletService)
  const notifications =
    options.notifications ??
    (options.storage
      ? createNotificationServiceFor(options.storage)
      : defaultNotificationService)
  const audit =
    options.audit ?? (options.storage ? createAuditServiceFor(options.storage) : defaultAuditService)
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const get = (gameInput: GameKind, roundId: string): GameSettlement | null => {
    const game = assertGameKind(gameInput)
    if (typeof roundId !== 'string' || !roundId) return null
    const stored =
      loadSettlements(adapter).find(
        (settlement) => settlementKey(settlement.game, settlement.roundId) === settlementKey(game, roundId),
      ) ?? null
    return stored ? Object.freeze({ ...stored }) : null
  }

  const settle = (request: SettlementRequest): SettlementResult => {
    const game = assertGameKind(request.game)
    const roundId = validateId(request.roundId, 'Identifiant de manche')
    const userId = validateId(request.userId, 'Identifiant utilisateur')
    const stake = parseAmount(request.stake, {
      label: 'La mise réglée',
      allowZero: true,
      max: 1_000_000,
    })
    const payout = parseAmount(request.payout, {
      label: 'Le gain réglé',
      allowZero: true,
      max: 1_000_000_000,
    })
    const outcome = assertOutcome(request.outcome)
    assertTicTacToePayoutConsistency(game, stake, payout, outcome, request.metadata)
    const settledAt = request.settledAt ?? now()
    if (Number.isNaN(Date.parse(settledAt))) {
      throw new ValidationError('La date de règlement est invalide.')
    }

    const existing = get(game, roundId)
    if (existing) {
      const sameRequest =
        existing.userId === userId &&
        existing.stake === stake &&
        existing.payout === payout &&
        existing.outcome === outcome
      if (!sameRequest) {
        throw new ConflictError(
          'Cette manche a déjà été réglée avec un résultat différent. Le résultat est immuable.',
        )
      }
      return Object.freeze({ ...existing, alreadySettled: true })
    }

    const pnl = payout - stake
    const source = SOURCE_BY_GAME[game]
    const ledgerIdempotencyKey = `game:settle:${game}:${roundId}`
    let ledgerMovement: LedgerMovement | null = null

    if (stake > 0 || payout > 0) {
      const metadata = {
        ...(request.metadata ?? {}),
        game,
        roundId,
        stake,
        payout,
        pnl,
        outcome,
        demo: true,
      }
      if (payout > 0) {
        ledgerMovement = wallet.credit({
          userId,
          type: game === 'trading' ? 'trading_profit' : 'game_win',
          amount: payout,
          currency: wallet.currency,
          source,
          reference: ledgerIdempotencyKey,
          idempotencyKey: ledgerIdempotencyKey,
          metadata,
          createdAt: settledAt,
        })
      } else {
        ledgerMovement = wallet.mark({
          userId,
          type: game === 'trading' ? 'trading_loss' : 'game_loss',
          currency: wallet.currency,
          source,
          reference: ledgerIdempotencyKey,
          idempotencyKey: ledgerIdempotencyKey,
          metadata,
          createdAt: settledAt,
        })
      }
    }

    const content = notificationContent(request, pnl)
    const notification = notifications.add({
      userId,
      type: content.type,
      title: content.title,
      message: content.message,
      priority: request.game === 'tic_tac_toe' && stake === 0 ? 'normal' : 'important',
      createdAt: settledAt,
      metadata: {
        game,
        roundId,
        stake,
        payout,
        pnl,
        outcome,
        demo: true,
      },
    })

    const auditEntry = audit.record({
      actorId: 'system',
      actorRole: 'system',
      action: 'game_settled',
      targetType: 'system',
      targetId: roundId,
      justification: `Règlement automatique et immuable de la manche ${game} (${outcome}).`,
      createdAt: settledAt,
      metadata: {
        game,
        roundId,
        userId,
        stake,
        payout,
        pnl,
        outcome,
        ledgerMovementId: ledgerMovement?.id ?? null,
        demo: true,
      },
    })

    const settlement: GameSettlement = Object.freeze({
      id: createId('stl'),
      game,
      roundId,
      userId,
      stake,
      payout,
      pnl,
      outcome,
      source,
      settledAt,
      ledgerMovementId: ledgerMovement?.id ?? null,
      notificationId: notification.id,
      auditId: auditEntry.id,
    })

    saveSettlements(adapter, [settlement, ...loadSettlements(adapter)])
    emit()
    return Object.freeze({ ...settlement, alreadySettled: false })
  }

  return {
    settle,
    get,
    list: (userId) => {
      const settlements = [...loadSettlements(adapter)]
        .sort((left, right) => right.settledAt.localeCompare(left.settledAt))
        .map((settlement) => Object.freeze({ ...settlement }))
      if (userId === undefined) return settlements
      const validUserId = validateId(userId, 'Identifiant utilisateur')
      return settlements.filter((settlement) => settlement.userId === validUserId)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

// Fabriques locales pour rester alignées sur le même adaptateur de stockage
// lorsqu'un service de jeu est instancié avec un stockage isolé (tests).
function createWalletServiceFor(adapter: StorageAdapter): WalletService {
  return createWalletService({ storage: adapter })
}

function createNotificationServiceFor(adapter: StorageAdapter): NotificationService {
  return createNotificationService({ storage: adapter })
}

function createAuditServiceFor(adapter: StorageAdapter): AuditService {
  return createAuditService({ storage: adapter })
}

export const gameSettlementService = createGameSettlementService()
