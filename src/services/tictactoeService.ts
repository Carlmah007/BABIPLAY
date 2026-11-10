import { ConflictError, NotFoundError, PermissionError, ValidationError } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { createId } from '../lib/ids'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  assertSufficientFunds,
  parseAmount,
  validateId,
  validateIntegerInRange,
} from '../lib/validation'
import {
  createTicTacToeGame,
  playAiMove,
  multiplierForLevel,
  playHumanMove,
  settleTicTacToeGame,
  TIC_TAC_TOE_LEVELS,
  TIC_TAC_TOE_STAKE_LIMITS,
} from '../features/tic-tac-toe/engine'
import {
  createCryptoRandomSource,
  type RandomSource,
} from './gameRandomnessService'
import {
  createGameSettlementService,
  gameSettlementService as defaultSettlement,
  type GameSettlementService,
  type SettlementOutcome,
  type SettlementResult,
} from './gameSettlementService'
import {
  createWalletService,
  walletService as defaultWallet,
  type WalletService,
} from './walletService'
import type {
  TicTacToeGame,
  TicTacToeLevel,
  TicTacToeMark,
} from '../types/games'

const GAMES_KEY = 'tic-tac-toe:games'
const ACTIVE_KEY = 'tic-tac-toe:active'
const TWO_POW_32 = 0x1_0000_0000

type GameStore = Record<string, TicTacToeGame>
type ActiveStore = Record<string, string>

export interface TicTacToeServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  random?: RandomSource
  wallet?: WalletService
  settlement?: GameSettlementService
}

export interface CreateTicTacToeInput {
  userId: string
  level: TicTacToeLevel
  /** La règle officielle impose X ; le joueur peut recevoir X ou O. */
  humanMark?: TicTacToeMark
  /** Mise engagée (0 = partie découverte). */
  stake?: number
}

export interface PlayMoveResult {
  game: TicTacToeGame
  settlement: SettlementResult | null
}

export interface TicTacToeService {
  createGame: (input: CreateTicTacToeInput) => TicTacToeGame
  playMove: (userId: string, gameId: string, cell: number) => PlayMoveResult
  finalizeGame: (userId: string, gameId: string) => PlayMoveResult
  getGame: (gameId: string) => TicTacToeGame | null
  getActiveGame: (userId: string) => TicTacToeGame | null
  abandonGame: (userId: string) => void
  listHistory: (userId: string, limit?: number) => TicTacToeGame[]
  subscribe: (listener: () => void) => () => void
}

function isTicTacToeGame(value: unknown): value is TicTacToeGame {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TicTacToeGame>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.level === 'string' &&
    Array.isArray(candidate.board) &&
    typeof candidate.status === 'string'
  )
}

function loadGames(adapter: StorageAdapter): GameStore {
  const stored = adapter.get<unknown>(GAMES_KEY)
  if (!stored || typeof stored !== 'object') return {}
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, TicTacToeGame] => isTicTacToeGame(entry[1]),
    ),
  )
}

function saveGames(adapter: StorageAdapter, games: GameStore): void {
  adapter.set(GAMES_KEY, games)
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

function outcomeFor(game: TicTacToeGame): SettlementOutcome {
  if (game.status === 'draw') return 'draw'
  if (game.status === 'won') {
    return game.result.winner === game.humanMark ? 'win' : 'loss'
  }
  throw new ConflictError('La partie est encore en cours.')
}

/**
 * Service Tic-Tac-Toe.
 *
 * Le niveau est choisi à la création puis conservé tel quel dans la partie.
 * L'IA utilise Minimax et ne varie qu'entre des coups de valeur strictement
 * équivalente, via un aléa sécurisé. Aucun coup n'est volontairement dégradé
 * pour forcer une victoire ou une défaite.
 */
export function createTicTacToeService(
  options: TicTacToeServiceOptions = {},
): TicTacToeService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const random = options.random ?? createCryptoRandomSource()
  const randomUnit = (): number => random.uint32() / TWO_POW_32
  const wallet =
    options.wallet ?? (options.storage ? createWalletService({ storage: adapter }) : defaultWallet)
  const settlement =
    options.settlement ??
    (options.storage || options.wallet || options.now
      ? createGameSettlementService({ storage: adapter, wallet, now })
      : defaultSettlement)
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const saveGame = (game: TicTacToeGame): void => {
    const games = loadGames(adapter)
    games[game.id] = game
    saveGames(adapter, games)
  }

  const getGame = (gameIdInput: string): TicTacToeGame | null => {
    if (typeof gameIdInput !== 'string' || !gameIdInput) return null
    const stored = loadGames(adapter)[gameIdInput]
    return stored ? Object.freeze({ ...stored }) : null
  }

  const settleGame = (game: TicTacToeGame, at: string): PlayMoveResult => {
    if (game.status === 'playing') {
      throw new ConflictError('La partie ne peut pas être réglée avant sa fin.')
    }
    const outcome = outcomeFor(game)
    const stake = game.stake ?? 0
    const multiplier = game.multiplier ?? multiplierForLevel(game.level)
    // Victoire : mise × cote convenue. Match nul : mise remboursée. Défaite : 0.
    const payout =
      outcome === 'win'
        ? Math.round(stake * multiplier)
        : outcome === 'draw'
          ? stake
          : 0
    const result = settlement.settle({
      game: 'tic_tac_toe',
      roundId: game.id,
      userId: game.userId,
      stake,
      payout,
      outcome,
      settledAt: at,
      metadata: {
        level: game.level,
        humanMark: game.humanMark,
        aiMark: game.aiMark,
        multiplier,
        moveCount: game.moveCount,
        result: game.result.status,
      },
    })
    const finalized = Object.freeze({
      ...settleTicTacToeGame(game, result.settledAt),
      payout: result.payout,
      pnl: result.pnl,
    })
    saveGame(finalized)
    emit()
    return { game: finalized, settlement: result }
  }

  const createGame = (input: CreateTicTacToeInput): TicTacToeGame => {
    const userId = validateId(input.userId, 'Identifiant utilisateur')
    if (!TIC_TAC_TOE_LEVELS.includes(input.level)) {
      throw new ValidationError('Niveau de jeu invalide.')
    }
    if (input.humanMark !== undefined && input.humanMark !== 'X' && input.humanMark !== 'O') {
      throw new ValidationError('Marque du joueur invalide.')
    }
    const stake =
      input.stake === undefined
        ? 0
        : parseAmount(input.stake, {
            label: 'La mise',
            allowZero: true,
            max: TIC_TAC_TOE_STAKE_LIMITS.max,
          })
    if (stake > 0 && stake < TIC_TAC_TOE_STAKE_LIMITS.min) {
      throw new ValidationError(
        `La mise minimale est de ${TIC_TAC_TOE_STAKE_LIMITS.min} jetons (ou 0 pour jouer gratuitement).`,
      )
    }
    const multiplier = multiplierForLevel(input.level)

    const activeId = loadActive(adapter)[userId]
    if (activeId) {
      const active = getGame(activeId)
      if (active && active.status === 'playing') {
        throw new ConflictError('Une partie est déjà en cours pour ce joueur.')
      }
    }

    if (stake > 0) {
      wallet.ensureInitialBalance(userId)
      assertSufficientFunds(stake, wallet.getBalance(userId))
    }

    const startedAt = now()
    const humanMark = input.humanMark ?? (randomUnit() < 0.5 ? 'X' : 'O')
    let game = createTicTacToeGame({
      id: createId('ttt'),
      userId,
      level: input.level,
      startedAt,
      humanMark,
      stake,
      multiplier,
    })
    saveGame(game)

    // La mise est débitée une seule fois, à la création de la partie.
    if (stake > 0) {
      wallet.debit({
        userId,
        type: 'game_stake',
        amount: stake,
        currency: wallet.currency,
        source: 'tic_tac_toe',
        reference: `tic_tac_toe:stake:${game.id}`,
        idempotencyKey: `tic_tac_toe:stake:${game.id}`,
        metadata: { game: 'tic_tac_toe', gameId: game.id, stake, demo: true },
      })
    }

    // Si le joueur reçoit O, l'IA (X) commence conformément à la règle officielle.
    if (game.currentTurn === game.aiMark) {
      game = playAiMove(game, startedAt, randomUnit)
      saveGame(game)
    }

    saveActive(adapter, { ...loadActive(adapter), [userId]: game.id })
    emit()
    return game
  }

  const playMove = (userIdInput: string, gameIdInput: string, cellInput: number): PlayMoveResult => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const gameId = validateId(gameIdInput, 'Identifiant de partie')
    const cell = validateIntegerInRange(cellInput, 0, 8, 'La case')
    const game = getGame(gameId)
    if (!game) throw new NotFoundError('Partie introuvable.')
    if (game.userId !== userId) {
      throw new PermissionError("Cette partie n'appartient pas à ce joueur.")
    }
    if (game.status !== 'playing') {
      throw new ConflictError('La partie est terminée et ne peut plus être modifiée.')
    }

    const at = now()
    const next = playHumanMove(game, cell, at, randomUnit)
    saveGame(next)
    if (next.status === 'playing') {
      emit()
      return { game: next, settlement: null }
    }
    return settleGame(next, at)
  }

  const finalizeGame = (userIdInput: string, gameIdInput: string): PlayMoveResult => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const gameId = validateId(gameIdInput, 'Identifiant de partie')
    const game = getGame(gameId)
    if (!game) throw new NotFoundError('Partie introuvable.')
    if (game.userId !== userId) {
      throw new PermissionError("Cette partie n'appartient pas à ce joueur.")
    }
    if (game.status === 'playing') {
      throw new ConflictError('La partie est encore en cours.')
    }
    return settleGame(game, game.settledAt ?? now())
  }

  const getActiveGame = (userIdInput: string): TicTacToeGame | null => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const gameId = loadActive(adapter)[userId]
    return gameId ? getGame(gameId) : null
  }

  /** Abandonne la partie en cours et rembourse la mise éventuellement engagée. */
  const abandonGame = (userIdInput: string): void => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const active = { ...loadActive(adapter) }
    const gameId = active[userId]
    if (!gameId) return
    delete active[userId]
    saveActive(adapter, active)

    const game = getGame(gameId)
    if (!game) return
    const stake = game.stake ?? 0
    if (game.status === 'playing' && stake > 0) {
      wallet.credit({
        userId,
        type: 'refund',
        amount: stake,
        currency: wallet.currency,
        source: 'tic_tac_toe',
        reference: `tic_tac_toe:refund:${game.id}`,
        idempotencyKey: `tic_tac_toe:refund:${game.id}`,
        metadata: { game: 'tic_tac_toe', gameId: game.id, refund: true, demo: true },
      })
    }
    const games = loadGames(adapter)
    delete games[game.id]
    saveGames(adapter, games)
    emit()
  }

  const listHistory = (userIdInput: string, limitInput = 20): TicTacToeGame[] => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const limit = validateIntegerInRange(limitInput, 1, 100, 'La limite')
    return Object.values(loadGames(adapter))
      .filter((game) => game.userId === userId && game.status !== 'playing')
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit)
      .map((game) => Object.freeze({ ...game }))
  }

  return {
    createGame,
    playMove,
    finalizeGame,
    getGame,
    getActiveGame,
    abandonGame,
    listHistory,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const ticTacToeService = createTicTacToeService()
