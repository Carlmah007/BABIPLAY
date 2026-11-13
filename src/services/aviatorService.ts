import { ConflictError, NotFoundError, PermissionError, ValidationError } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  assertSufficientFunds,
  parseAmount,
  validateIntegerInRange,
  validateId,
} from '../lib/validation'
import {
  computeCashout,
  displayMultiplier,
  generateAviatorRound,
  hasCrashed,
  markCashedOut,
  markCrashed,
  multiplierAt,
  verifyCrashPoint,
  AVIATOR_RULES,
} from '../features/aviator/engine'
import {
  createGameRandomnessService,
  gameRandomnessService as defaultRandomness,
  type GameRandomnessService,
  type RandomSource,
} from './gameRandomnessService'
import {
  createGameSettlementService,
  gameSettlementService as defaultSettlement,
  type GameSettlementService,
  type SettlementResult,
} from './gameSettlementService'
import {
  gameBoostService as defaultBoosts,
  type GameBoostService,
} from './gameBoostService'
import {
  createWalletService,
  walletService as defaultWallet,
  type WalletService,
} from './walletService'
import type { AviatorRound } from '../types/games'

const ROUNDS_KEY = 'aviator:rounds'
const ACTIVE_KEY = 'aviator:active'

type RoundStore = Record<string, AviatorRound>
type ActiveStore = Record<string, string>

export interface AviatorServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  random?: RandomSource
  wallet?: WalletService
  settlement?: GameSettlementService
  randomness?: GameRandomnessService
  boosts?: GameBoostService
}

export interface AviatorCashout {
  round: AviatorRound
  settlement: SettlementResult
  multiplier: number
  payout: number
}

export interface AviatorServerMultiplier {
  roundId: string
  multiplier: number
  crashed: boolean
  status: AviatorRound['status']
  /** Révélé uniquement lorsque la manche a crashé. */
  crashPoint: number | null
}

export interface AviatorReveal {
  roundId: string
  serverSeed: string
  serverSeedHash: string
  nonce: string
  crashPoint: number
  verified: boolean
}

export interface AviatorPublicRound
  extends Omit<AviatorRound, 'crashPoint' | 'crashElapsedMs'> {
  /** Masqué tant que la manche est en cours. */
  crashPoint: number | null
  crashElapsedMs: number | null
}

export interface AviatorService {
  startRound: (userId: string, stake: number) => AviatorRound
  getRound: (roundId: string) => AviatorRound | null
  getPublicRound: (roundId: string) => AviatorPublicRound | null
  getActiveRound: (userId: string) => AviatorRound | null
  getServerMultiplier: (roundId: string, at?: string) => AviatorServerMultiplier
  cashout: (userId: string, roundId: string, at?: string) => AviatorCashout
  refresh: (roundId?: string) => AviatorRound[]
  listHistory: (userId: string, limit?: number) => AviatorRound[]
  reveal: (roundId: string) => AviatorReveal
  verify: (roundId: string) => boolean
  subscribe: (listener: () => void) => () => void
}

function loadRounds(adapter: StorageAdapter): RoundStore {
  const stored = adapter.get<unknown>(ROUNDS_KEY)
  if (!stored || typeof stored !== 'object') return {}
  const entries = Object.entries(stored as Record<string, unknown>).filter(
    (entry): entry is [string, AviatorRound] => {
      const candidate = entry[1]
      return Boolean(
        candidate &&
          typeof candidate === 'object' &&
          typeof (candidate as AviatorRound).roundId === 'string' &&
          typeof (candidate as AviatorRound).status === 'string',
      )
    },
  )
  return Object.fromEntries(entries)
}

function saveRounds(adapter: StorageAdapter, rounds: RoundStore): void {
  adapter.set(ROUNDS_KEY, rounds)
}

function loadActive(adapter: StorageAdapter): ActiveStore {
  const stored = adapter.get<unknown>(ACTIVE_KEY)
  if (!stored || typeof stored !== 'object') return {}
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function saveActive(adapter: StorageAdapter, active: ActiveStore): void {
  adapter.set(ACTIVE_KEY, active)
}

function freezeRound(round: AviatorRound): AviatorRound {
  return Object.freeze(round)
}

/**
 * Service de manches Aviator.
 *
 * Le point de crash est fixé à la création, avant tout affichage, à partir
 * de l'engagement `serverSeedHash` + `nonce` du service d'aléa commun.
 * Aucune donnée du joueur n'entre dans le calcul.
 */
export function createAviatorService(options: AviatorServiceOptions = {}): AviatorService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const wallet =
    options.wallet ?? (options.storage ? createWalletService({ storage: adapter }) : defaultWallet)
  const settlement =
    options.settlement ??
    (options.storage || options.wallet || options.now
      ? createGameSettlementService({ storage: adapter, wallet, now })
      : defaultSettlement)
  const randomness =
    options.randomness ??
    (options.storage || options.random || options.now
      ? createGameRandomnessService({ storage: adapter, random: options.random, now })
      : defaultRandomness)
  const boosts = options.boosts ?? defaultBoosts
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const saveRound = (round: AviatorRound): void => {
    const rounds = loadRounds(adapter)
    rounds[round.roundId] = round
    saveRounds(adapter, rounds)
  }

  const getRound = (roundId: string): AviatorRound | null => {
    if (typeof roundId !== 'string' || !roundId) return null
    const stored = loadRounds(adapter)[roundId]
    return stored ? freezeRound({ ...stored }) : null
  }

  const publicRound = (round: AviatorRound): AviatorPublicRound => {
    const revealed = round.status === 'settled' || round.status === 'completed'
    return Object.freeze({
      ...round,
      crashPoint: revealed ? round.crashPoint : null,
      crashElapsedMs: revealed ? round.crashElapsedMs : null,
    })
  }

  const completeCrash = (
    round: AviatorRound,
    detectedAt: string,
  ): { round: AviatorRound; settlement: SettlementResult | null } => {
    if (round.status === 'settled') return { round, settlement: null }
    if (round.status !== 'running' && round.status !== 'started') {
      throw new ConflictError('Cette manche ne peut pas être clôturée par un crash.')
    }

    const crashAt = new Date(
      Date.parse(round.startedAt) + round.crashElapsedMs,
    ).toISOString()
    const crashed = markCrashed(round, crashAt)
    const result = settlement.settle({
      game: 'aviator',
      roundId: round.roundId,
      userId: round.userId,
      stake: round.stake,
      payout: 0,
      outcome: 'crash',
      settledAt: detectedAt,
      metadata: {
        crashPoint: round.crashPoint,
        serverSeedHash: round.serverSeedHash,
        nonce: round.nonce,
        crashElapsedMs: round.crashElapsedMs,
      },
    })
    const finalRound = freezeRound({
      ...crashed,
      status: 'settled',
      settledAt: result.settledAt,
      payout: result.payout,
      pnl: result.pnl,
    })
    saveRound(finalRound)
    emit()
    return { round: finalRound, settlement: result }
  }

  const refreshRound = (round: AviatorRound): AviatorRound => {
    if (round.status !== 'running') return round
    const at = now()
    const elapsedMs = Date.parse(at) - Date.parse(round.startedAt)
    if (elapsedMs >= round.crashElapsedMs) {
      return completeCrash(round, at).round
    }
    return round
  }

  const getActiveRound = (userId: string): AviatorRound | null => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    const roundId = loadActive(adapter)[validUserId]
    if (!roundId) return null
    const round = getRound(roundId)
    return round ? refreshRound(round) : null
  }

  const startRound = (userIdInput: string, stakeInput: number): AviatorRound => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const stake = parseAmount(stakeInput, {
      label: 'La mise',
      max: 1_000_000,
    })

    const active = getActiveRound(userId)
    if (active && active.status !== 'settled' && active.status !== 'cancelled') {
      throw new ConflictError('Une manche est déjà en cours pour ce joueur.')
    }

    wallet.ensureInitialBalance(userId)
    assertSufficientFunds(stake, wallet.getBalance(userId))

    const secret = randomness.createRound('aviator')
    const startedAt = now()
    const generated = generateAviatorRound({
      secret,
      userId,
      stake,
      startedAt,
      draw: randomness.drawSequence(secret.roundId),
    })

    // Boost programmé : la cote est forcée pendant la fenêtre horaire et le
    // gain plafonné. La manche est marquée `boosted` : la vérification
    // provably fair ne s'applique pas à elle (le résultat n'est pas tiré).
    const boost = boosts.activeBoost('aviator', startedAt)
    let boostedRound = generated
    if (boost) {
      const forced = Math.min(
        AVIATOR_RULES.maxMultiplier,
        Math.max(1.01, Math.floor(boost.forcedMultiplier * 100) / 100),
      )
      const growthRate = generated.growthRate
      boostedRound = {
        ...generated,
        crashPoint: forced,
        crashElapsedMs: Math.ceil((Math.log(forced) / growthRate) * 1000),
        boosted: { multiplier: forced, maxWin: boost.maxWin, label: boost.label },
      }
    }

    // Machine d'état explicite : created → started → running.
    saveRound(boostedRound)
    const started = freezeRound({ ...boostedRound, status: 'started' })
    saveRound(started)

    wallet.debit({
      userId,
      type: 'game_stake',
      amount: stake,
      currency: wallet.currency,
      source: 'aviator',
      reference: `aviator:stake:${boostedRound.roundId}`,
      idempotencyKey: `aviator:stake:${boostedRound.roundId}`,
      metadata: {
        roundId: boostedRound.roundId,
        serverSeedHash: boostedRound.serverSeedHash,
        nonce: boostedRound.nonce,
        boosted: boost ? boost.label : null,
        demo: true,
      },
    })

    const running = freezeRound({ ...started, status: 'running' })
    saveRound(running)
    saveActive(adapter, { ...loadActive(adapter), [userId]: running.roundId })
    emit()
    return running
  }

  const getServerMultiplier = (
    roundId: string,
    atIso?: string,
  ): AviatorServerMultiplier => {
    const round = getRound(validateId(roundId, 'Identifiant de manche'))
    if (!round) throw new NotFoundError('Manche Aviator introuvable.')
    const at = atIso ?? now()
    if (Number.isNaN(Date.parse(at))) {
      throw new ValidationError('Horodatage de manche invalide.')
    }

    if (round.status === 'settled' && round.cashoutMultiplier !== null) {
      return {
        roundId: round.roundId,
        multiplier: round.cashoutMultiplier,
        crashed: false,
        status: round.status,
        crashPoint: null,
      }
    }

    const elapsedMs = Math.max(0, Date.parse(at) - Date.parse(round.startedAt))
    const crashed = hasCrashed(round, elapsedMs)
    const multiplier =
      round.status === 'settled' && round.payout === 0
        ? displayMultiplier(round.crashPoint)
        : multiplierAt(round, elapsedMs)
    return {
      roundId: round.roundId,
      multiplier: displayMultiplier(multiplier),
      crashed,
      status: round.status,
      crashPoint: crashed || round.status === 'settled' ? round.crashPoint : null,
    }
  }

  const cashout = (userIdInput: string, roundIdInput: string, atIso?: string): AviatorCashout => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const roundId = validateId(roundIdInput, 'Identifiant de manche')
    const round = getRound(roundId)
    if (!round) throw new NotFoundError('Manche Aviator introuvable.')
    if (round.userId !== userId) {
      throw new PermissionError("Cette manche n'appartient pas à ce joueur.")
    }
    if (loadActive(adapter)[userId] !== roundId) {
      throw new ConflictError("Cette manche n'est pas la manche active du joueur.")
    }
    if (round.status !== 'running') {
      throw new ConflictError('Cette manche est déjà terminée et ne peut plus être modifiée.')
    }

    const at = atIso ?? now()
    if (Number.isNaN(Date.parse(at))) throw new ValidationError('Horodatage de retrait invalide.')
    const elapsedMs = Date.parse(at) - Date.parse(round.startedAt)
    if (elapsedMs >= round.crashElapsedMs) {
      completeCrash(round, at)
      throw new ConflictError('La manche a déjà crashé : le retrait est refusé.')
    }

    const computed = computeCashout(round, elapsedMs)
    // Plafond de gain pendant une manche boostée.
    const cappedPayout = round.boosted
      ? Math.min(computed.payout, round.boosted.maxWin)
      : computed.payout
    const cashedOut = markCashedOut(round, computed.multiplier, at)
    const result = settlement.settle({
      game: 'aviator',
      roundId,
      userId,
      stake: round.stake,
      payout: cappedPayout,
      outcome: 'cashout',
      settledAt: at,
      metadata: {
        multiplier: computed.multiplier,
        serverSeedHash: round.serverSeedHash,
        nonce: round.nonce,
        crashPoint: round.crashPoint,
        boosted: round.boosted ? round.boosted.label : null,
      },
    })
    const finalRound = freezeRound({
      ...cashedOut,
      status: 'settled',
      settledAt: result.settledAt,
      payout: result.payout,
      pnl: result.pnl,
    })
    saveRound(finalRound)
    emit()
    return {
      round: finalRound,
      settlement: result,
      multiplier: computed.multiplier,
      payout: result.payout,
    }
  }

  const refresh = (roundId?: string): AviatorRound[] => {
    const rounds = loadRounds(adapter)
    const targets = roundId
      ? [getRound(validateId(roundId, 'Identifiant de manche'))].filter(
          (round): round is AviatorRound => round !== null,
        )
      : Object.values(rounds)
    return targets.map((round) => refreshRound(freezeRound({ ...round })))
  }

  const listHistory = (userIdInput: string, limitInput = 20): AviatorRound[] => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const limit = validateIntegerInRange(limitInput, 1, 100, 'La limite')
    return Object.values(loadRounds(adapter))
      .filter((round) => round.userId === userId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit)
      .map((round) => freezeRound({ ...round }))
  }

  const reveal = (roundIdInput: string): AviatorReveal => {
    const roundId = validateId(roundIdInput, 'Identifiant de manche')
    const round = getRound(roundId)
    if (!round) throw new NotFoundError('Manche Aviator introuvable.')
    if (round.status !== 'settled') {
      throw new ConflictError('Le seed ne peut être révélé qu’après le règlement.')
    }
    const serverSeed = randomness.reveal(roundId)
    if (!serverSeed) throw new NotFoundError('Engagement de manche introuvable.')
    return {
      roundId,
      serverSeed,
      serverSeedHash: round.serverSeedHash,
      nonce: round.nonce,
      crashPoint: round.crashPoint,
      verified: verify(roundId),
    }
  }

  const verify = (roundIdInput: string): boolean => {
    const roundId = validateId(roundIdInput, 'Identifiant de manche')
    const round = getRound(roundId)
    if (!round || round.status !== 'settled') return false
    if (!randomness.verify(roundId)) return false
    return verifyCrashPoint(round.crashPoint, randomness.drawSequence(roundId))
  }

  return {
    startRound,
    getRound,
    getPublicRound: (roundId) => {
      const round = getRound(roundId)
      if (!round) return null
      return publicRound(refreshRound(round))
    },
    getActiveRound,
    getServerMultiplier,
    cashout,
    refresh,
    listHistory,
    reveal,
    verify,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const aviatorService = createAviatorService()
