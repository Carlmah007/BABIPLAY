import { ConflictError, NotFoundError, PermissionError, ValidationError } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { createId } from '../lib/ids'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  assertSufficientFunds,
  parseAmount,
  validateAssetSymbol,
  validateId,
  validateTradeDirection,
} from '../lib/validation'
import { DEMO_ASSETS, getAsset } from '../data/demoAssets'
import {
  MARKET_TICK_MS,
  advanceMarket,
  computeClose,
  createMarketState,
  entryPriceFor,
  evaluateAutoClose,
  getMarketEvents as eventsForState,
  getQuotes as quotesForState,
} from '../features/trading/marketEngine'
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
  AssetSymbol,
  CloseReason,
  MarketEvent,
  MarketQuote,
  MarketState,
  SimulatedAsset,
  TradeDirection,
  TradingPosition,
} from '../types/trading'

const MARKET_KEY = 'trading:market'
const POSITIONS_KEY = 'trading:positions'
const SEED_HISTORY_KEY = 'trading:seeds'

export const TRADING_RULES = Object.freeze({
  tickMs: MARKET_TICK_MS,
  minStake: 1,
  maxStake: 100_000,
  stopLossPercent: Object.freeze({ min: 0.1, max: 50 }),
  takeProfitPercent: Object.freeze({ min: 0.1, max: 200 }),
  durationMinutes: Object.freeze({ min: 1, max: 1_440 }),
  slippage:
    'Aucun slippage additionnel : le spread bid/ask publié est le seul frottement appliqué.',
  fees:
    'Frais de clôture en points de base du montant engagé, tracés dans la position et le ledger.',
  priceSource:
    'Prix de clôture = dernier prix du moteur serveur à l’horodatage de clôture, jamais une valeur du navigateur.',
  simulated: true,
})

type PositionStore = Record<string, TradingPosition>

export interface TradingServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  random?: RandomSource
  wallet?: WalletService
  settlement?: GameSettlementService
}

export interface OpenPositionInput {
  userId: string
  symbol: AssetSymbol
  direction: TradeDirection
  stake: number
  stopLossPercent?: number | null
  takeProfitPercent?: number | null
  durationMinutes?: number | null
}

export interface ClosePositionResult {
  position: TradingPosition
  settlement: SettlementResult
}

export interface TradingService {
  getAssets: () => readonly SimulatedAsset[]
  getMarket: () => MarketState
  getQuotes: (at?: string) => MarketQuote[]
  getQuote: (symbol: AssetSymbol, at?: string) => MarketQuote
  getMarketEvents: (at?: string) => MarketEvent[]
  openPosition: (input: OpenPositionInput) => TradingPosition
  closePosition: (userId: string, positionId: string, at?: string) => ClosePositionResult
  syncPositions: (userId?: string, at?: string) => ClosePositionResult[]
  getPosition: (positionId: string) => TradingPosition | null
  listPositions: (userId: string, limit?: number) => TradingPosition[]
  listOpenPositions: (userId: string) => TradingPosition[]
  startNewSession: () => MarketState
  getSeedHistory: () => string[]
  subscribe: (listener: () => void) => () => void
}

function isTradingPosition(value: unknown): value is TradingPosition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TradingPosition>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.direction === 'string' &&
    typeof candidate.stake === 'number' &&
    typeof candidate.status === 'string'
  )
}

function loadPositions(adapter: StorageAdapter): PositionStore {
  const stored = adapter.get<unknown>(POSITIONS_KEY)
  if (!stored || typeof stored !== 'object') return {}
  return Object.fromEntries(
    Object.entries(stored as Record<string, unknown>).filter(
      (entry): entry is [string, TradingPosition] => isTradingPosition(entry[1]),
    ),
  )
}

function savePositions(adapter: StorageAdapter, positions: PositionStore): void {
  adapter.set(POSITIONS_KEY, positions)
}

function loadSeedHistory(adapter: StorageAdapter): string[] {
  const stored = adapter.get<unknown>(SEED_HISTORY_KEY)
  return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === 'string') : []
}

function saveSeedHistory(adapter: StorageAdapter, seeds: string[]): void {
  adapter.set(SEED_HISTORY_KEY, seeds.slice(0, 64))
}

function bytesToHex(bytes: Uint8Array): string {
  let output = ''
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0')
  return output
}

function parsePercent(
  value: number | null | undefined,
  label: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${label} doit être un nombre.`)
  }
  if (value < min || value > max) {
    throw new ValidationError(`${label} doit être compris entre ${min} et ${max}.`)
  }
  return value
}

function reasonToOutcome(reason: CloseReason): SettlementOutcome {
  switch (reason) {
    case 'manual':
      return 'manual_close'
    case 'stop_loss':
      return 'stop_loss'
    case 'take_profit':
      return 'take_profit'
    case 'expired':
      return 'expired'
  }
}

/**
 * Moteur de trading simulé.
 *
 * - chaque actif possède un seed dérivé distinct et sa propre série ;
 * - le marché avance par ticks de 5 s et les prix passés ne sont jamais réécrits ;
 * - l'entrée et la sortie utilisent le spread serveur (ask/bid) ;
 * - une position clôturée est réglée une seule fois puis figée.
 */
export function createTradingService(options: TradingServiceOptions = {}): TradingService {
  const adapter = options.storage ?? defaultStorage

  const now = options.now ?? nowIso
  const random = options.random ?? createCryptoRandomSource()
  const wallet =
    options.wallet ?? (options.storage ? createWalletService({ storage: adapter }) : defaultWallet)
  const settlement =
    options.settlement ??
    (options.storage || options.wallet || options.now
      ? createGameSettlementService({ storage: adapter, wallet, now })
      : defaultSettlement)
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const freshSeed = (): string => {
    const history = loadSeedHistory(adapter)
    let seed = bytesToHex(random.bytes(32))
    let attempts = 0
    while (history.includes(seed)) {
      attempts += 1
      if (attempts > 8) {
        throw new ConflictError('Impossible de générer un seed de marché unique.')
      }
      seed = bytesToHex(random.bytes(32))
    }
    saveSeedHistory(adapter, [seed, ...history])
    return seed
  }

  const loadMarket = (): MarketState => {
    const stored = adapter.get<MarketState>(MARKET_KEY)
    if (
      stored &&
      typeof stored === 'object' &&
      stored.assets &&
      typeof stored.assets === 'object' &&
      typeof stored.seed === 'string'
    ) {
      return stored
    }
    const state = createMarketState(freshSeed(), now(), DEMO_ASSETS)
    adapter.set(MARKET_KEY, state)
    return state
  }

  const syncMarket = (atIso: string): MarketState => {
    const advanced = advanceMarket(loadMarket(), atIso, DEMO_ASSETS)
    adapter.set(MARKET_KEY, advanced)
    return advanced
  }

  const getQuoteFrom = (state: MarketState, symbolInput: AssetSymbol): MarketQuote => {
    const symbol = validateAssetSymbol(symbolInput)
    const quotes = quotesForState(state, DEMO_ASSETS)
    const quote = quotes.find((candidate) => candidate.symbol === symbol)
    if (!quote) throw new NotFoundError('Cotation introuvable.')
    return quote
  }

  const savePosition = (position: TradingPosition): void => {
    const positions = loadPositions(adapter)
    positions[position.id] = position
    savePositions(adapter, positions)
  }

  const closeWithQuote = (
    position: TradingPosition,
    quote: MarketQuote,
    reason: CloseReason,
    at: string,
  ): ClosePositionResult => {
    if (position.status !== 'open') {
      throw new ConflictError('Cette position est déjà clôturée et ne peut plus être modifiée.')
    }
    const asset = getAsset(position.symbol)
    // Résultat déterministe : uniquement le prix serveur et le spread publié.
    const computation = computeClose(position, quote, asset)
    const result = settlement.settle({
      game: 'trading',
      roundId: position.id,
      userId: position.userId,
      stake: position.stake,
      payout: computation.payout,
      outcome: reasonToOutcome(reason),
      settledAt: at,
      metadata: {
        symbol: position.symbol,
        direction: position.direction,
        entryPrice: position.entryPrice,
        exitPrice: computation.exitPrice,
        fee: computation.fee,
        feeBps: asset.feeBps,
        spreadBps: asset.spreadBps,
        regime: quote.regime,
        quoteAt: quote.updatedAt,
      },
    })

    const closed: TradingPosition = Object.freeze({
      ...position,
      status: 'closed',
      exitPrice: computation.exitPrice,
      closedAt: at,
      pnl: result.pnl,
      payout: result.payout,
      fee: computation.fee,
      closeReason: reason,
      settledAt: result.settledAt,
    })
    savePosition(closed)
    emit()
    return { position: closed, settlement: result }
  }

  const openPosition = (input: OpenPositionInput): TradingPosition => {
    const userId = validateId(input.userId, 'Identifiant utilisateur')
    const symbol = validateAssetSymbol(input.symbol)
    const direction = validateTradeDirection(input.direction)
    const stake = parseAmount(input.stake, {
      label: 'La mise',
      max: TRADING_RULES.maxStake,
    })
    const stopLossPercent = parsePercent(
      input.stopLossPercent,
      'Le stop-loss',
      TRADING_RULES.stopLossPercent.min,
      TRADING_RULES.stopLossPercent.max,
    )
    const takeProfitPercent = parsePercent(
      input.takeProfitPercent,
      'Le take-profit',
      TRADING_RULES.takeProfitPercent.min,
      TRADING_RULES.takeProfitPercent.max,
    )
    if (stopLossPercent !== null && takeProfitPercent !== null && stopLossPercent >= takeProfitPercent) {
      throw new ValidationError('Le take-profit doit être supérieur au stop-loss.')
    }
    let durationMinutes: number | null = null
    if (input.durationMinutes !== null && input.durationMinutes !== undefined) {
      durationMinutes = parseAmount(input.durationMinutes, {
        label: 'La durée',
        min: TRADING_RULES.durationMinutes.min,
        max: TRADING_RULES.durationMinutes.max,
      })
    }

    const openedAt = now()
    if (Number.isNaN(Date.parse(openedAt))) {
      throw new ValidationError('Horodatage de marché invalide.')
    }
    const state = syncMarket(openedAt)
    const quote = getQuoteFrom(state, symbol)
    const entryPrice = entryPriceFor(quote, direction)
    const positionId = createId('pos')

    wallet.ensureInitialBalance(userId)
    assertSufficientFunds(stake, wallet.getBalance(userId))

    wallet.debit({
      userId,
      type: 'trading_open',
      amount: stake,
      currency: wallet.currency,
      source: 'trading',
      reference: `trading:open:${positionId}`,
      idempotencyKey: `trading:open:${positionId}`,
      metadata: {
        symbol,
        direction,
        entryPrice,
        spreadBps: quote.spreadBps,
        demo: true,
      },
      createdAt: openedAt,
    })

    const position: TradingPosition = Object.freeze({
      id: positionId,
      userId,
      symbol,
      direction,
      stake,
      entryPrice,
      exitPrice: null,
      status: 'open',
      openedAt,
      closedAt: null,
      pnl: null,
      payout: 0,
      fee: 0,
      closeReason: null,
      stopLossPercent,
      takeProfitPercent,
      expiresAt:
        durationMinutes === null
          ? null
          : new Date(Date.parse(openedAt) + durationMinutes * 60_000).toISOString(),
      settledAt: null,
      demo: true,
    })

    savePosition(position)
    emit()
    return position
  }

  const getPosition = (positionIdInput: string): TradingPosition | null => {
    if (typeof positionIdInput !== 'string' || !positionIdInput) return null
    const stored = loadPositions(adapter)[positionIdInput]
    return stored ? Object.freeze({ ...stored }) : null
  }

  const closePosition = (
    userIdInput: string,
    positionIdInput: string,
    atIso?: string,
  ): ClosePositionResult => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const positionId = validateId(positionIdInput, 'Identifiant de position')
    const position = getPosition(positionId)
    if (!position) throw new NotFoundError('Position introuvable.')
    if (position.userId !== userId) {
      throw new PermissionError("Cette position n'appartient pas à ce joueur.")
    }
    if (position.status !== 'open') {
      throw new ConflictError('Cette position est déjà clôturée et ne peut plus être modifiée.')
    }

    const at = atIso ?? now()
    if (Number.isNaN(Date.parse(at))) throw new ValidationError('Horodatage de clôture invalide.')
    const state = syncMarket(at)
    const quote = getQuoteFrom(state, position.symbol)
    const automatic = evaluateAutoClose(position, quote, at)
    return closeWithQuote(position, quote, automatic ?? 'manual', at)
  }

  const syncPositions = (userIdInput?: string, atIso?: string): ClosePositionResult[] => {
    const at = atIso ?? now()
    if (Number.isNaN(Date.parse(at))) throw new ValidationError('Horodatage de marché invalide.')
    const state = syncMarket(at)
    const userId =
      userIdInput === undefined ? null : validateId(userIdInput, 'Identifiant utilisateur')
    const positions = Object.values(loadPositions(adapter)).filter(
      (position) =>
        position.status === 'open' && (userId === null || position.userId === userId),
    )

    const closed: ClosePositionResult[] = []
    for (const position of positions) {
      const quote = getQuoteFrom(state, position.symbol)
      const automatic = evaluateAutoClose(position, quote, at)
      if (!automatic) continue
      closed.push(closeWithQuote(Object.freeze({ ...position }), quote, automatic, at))
    }
    return closed
  }

  const listPositions = (userIdInput: string, limitInput = 50): TradingPosition[] => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const limit = Math.max(1, Math.min(200, Math.floor(limitInput)))
    return Object.values(loadPositions(adapter))
      .filter((position) => position.userId === userId)
      .sort((left, right) => right.openedAt.localeCompare(left.openedAt))
      .slice(0, limit)
      .map((position) => Object.freeze({ ...position }))
  }

  const startNewSession = (): MarketState => {
    if (Object.values(loadPositions(adapter)).some((position) => position.status === 'open')) {
      throw new ConflictError(
        'Impossible de démarrer une nouvelle session avec des positions ouvertes.',
      )
    }
    const state = createMarketState(freshSeed(), now(), DEMO_ASSETS)
    adapter.set(MARKET_KEY, state)
    emit()
    return state
  }

  return {
    getAssets: () => DEMO_ASSETS,
    getMarket: () => syncMarket(now()),
    getQuotes: (at) => quotesForState(syncMarket(at ?? now()), DEMO_ASSETS),
    getQuote: (symbol, at) => getQuoteFrom(syncMarket(at ?? now()), symbol),
    getMarketEvents: (at) => eventsForState(syncMarket(at ?? now()), DEMO_ASSETS),
    openPosition,
    closePosition,
    syncPositions,
    getPosition,
    listPositions,
    listOpenPositions: (userId) =>
      listPositions(userId, 200).filter((position) => position.status === 'open'),
    startNewSession,
    getSeedHistory: () => loadSeedHistory(adapter),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const tradingService = createTradingService()
