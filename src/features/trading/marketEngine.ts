import { ValidationError } from '../../lib/errors'
import { sha256Hex } from '../../lib/sha256'
import { DEMO_ASSETS, getAsset } from '../../data/demoAssets'
import {
  createDeterministicRandomSource,
  type RandomSource,
} from '../../services/gameRandomnessService'
import type {
  AssetMarketState,
  AssetSymbol,
  CloseReason,
  MarketEvent,
  MarketQuote,
  MarketRegime,
  MarketState,
  SimulatedAsset,
  TradingPosition,
} from '../../types/trading'

/** Un tick de marché simulé = 5 secondes virtuelles. */
export const MARKET_TICK_MS = 5_000
export const MAX_TICKS_PER_ASSET = 600
const MAX_STEPS_PER_ADVANCE = 240

/** Durées de régime en ticks : entre 30 s et 2 min simulées. */
const MIN_REGIME_TICKS = 6
const MAX_REGIME_TICKS = 24

const REGIME_DRIFT: Record<MarketRegime, number> = {
  uptrend: 1,
  downtrend: -1,
  consolidation: 0.05,
  acceleration: 2.2,
  correction: -1.6,
}

const REGIME_WEIGHTS: ReadonlyArray<{ regime: MarketRegime; weight: number }> = [
  { regime: 'uptrend', weight: 0.26 },
  { regime: 'downtrend', weight: 0.26 },
  { regime: 'consolidation', weight: 0.18 },
  { regime: 'acceleration', weight: 0.14 },
  { regime: 'correction', weight: 0.16 },
]

const REGIME_ORDER: readonly MarketRegime[] = [
  'uptrend',
  'downtrend',
  'consolidation',
  'acceleration',
  'correction',
]

function assertPositivePrice(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${label} doit être un prix strictement positif.`)
  }
  return value
}

function pickRegime(unit: number): MarketRegime {
  let cumulative = 0
  for (const entry of REGIME_WEIGHTS) {
    cumulative += entry.weight
    if (unit < cumulative) return entry.regime
  }
  return REGIME_ORDER[REGIME_ORDER.length - 1]
}

function regimeDurationTicks(unit: number): number {
  return MIN_REGIME_TICKS + Math.floor(unit * (MAX_REGIME_TICKS - MIN_REGIME_TICKS + 1))
}

function normalDraw(source: RandomSource): number {
  let u1 = source.uint32() / 0x1_0000_0000
  const u2 = source.uint32() / 0x1_0000_0000
  if (u1 < Number.EPSILON) u1 = Number.EPSILON
  const magnitude = Math.sqrt(-2 * Math.log(u1))
  return magnitude * Math.cos(2 * Math.PI * u2)
}

function diversifiedSeed(seed: string, symbol: AssetSymbol): string {
  return sha256Hex(`${seed}:${symbol}`)
}

function initialAssetState(asset: SimulatedAsset, seed: string, atIso: string): AssetMarketState {
  const assetSeed = diversifiedSeed(seed, asset.symbol)
  const source = createDeterministicRandomSource(`${assetSeed}:init`)
  const regime = pickRegime(source.uint32() / 0x1_0000_0000)
  const duration = regimeDurationTicks(source.uint32() / 0x1_0000_0000)
  return {
    symbol: asset.symbol,
    seed: assetSeed,
    regime,
    regimeEndsAt: new Date(Date.parse(atIso) + duration * MARKET_TICK_MS).toISOString(),
    lastPrice: asset.basePrice,
    lastUpdatedAt: atIso,
    tickCount: 1,
    ticks: [{ at: atIso, price: asset.basePrice, regime }],
  }
}

/** Crée un marché dont chaque actif possède un seed dérivé distinct. */
export function createMarketState(
  seed: string,
  atIso: string,
  assets: readonly SimulatedAsset[] = DEMO_ASSETS,
): MarketState {
  if (typeof seed !== 'string' || seed.trim().length < 8) {
    throw new ValidationError('Le seed du marché est invalide.')
  }
  if (Number.isNaN(Date.parse(atIso))) {
    throw new ValidationError('La date initiale du marché est invalide.')
  }
  const entries = assets.map(
    (asset) => [asset.symbol, initialAssetState(asset, seed, atIso)] as const,
  )
  return {
    seed,
    assets: Object.fromEntries(entries) as Record<AssetSymbol, AssetMarketState>,
    updatedAt: atIso,
  }
}

function advanceAsset(
  asset: SimulatedAsset,
  state: AssetMarketState,
  nowMs: number,
): AssetMarketState {
  const lastMs = Date.parse(state.lastUpdatedAt)
  if (nowMs <= lastMs) return state

  const steps = Math.min(MAX_STEPS_PER_ADVANCE, Math.floor((nowMs - lastMs) / MARKET_TICK_MS))
  if (steps <= 0) return state

  let price = assertPositivePrice(state.lastPrice, 'Le dernier prix')
  let regime = state.regime
  let regimeEndsAtMs = Date.parse(state.regimeEndsAt)
  let lastUpdatedMs = lastMs
  let tickCount = state.tickCount ?? state.ticks.length
  const ticks = [...state.ticks]

  for (let step = 0; step < steps; step += 1) {
    lastUpdatedMs += MARKET_TICK_MS
    const source = createDeterministicRandomSource(`${state.seed}:${tickCount}`)
    tickCount += 1

    if (lastUpdatedMs >= regimeEndsAtMs) {
      regime = pickRegime(source.uint32() / 0x1_0000_0000)
      const duration = regimeDurationTicks(source.uint32() / 0x1_0000_0000)
      regimeEndsAtMs = lastUpdatedMs + duration * MARKET_TICK_MS
    }

    const drift = asset.trendBias * REGIME_DRIFT[regime]
    const shock = asset.volatility * normalDraw(source)
    price = Math.max(asset.basePrice * 0.2, price * Math.exp(drift + shock))

    ticks.push({
      at: new Date(lastUpdatedMs).toISOString(),
      price,
      regime,
    })
    if (ticks.length > MAX_TICKS_PER_ASSET) ticks.splice(0, ticks.length - MAX_TICKS_PER_ASSET)
  }

  return {
    ...state,
    regime,
    regimeEndsAt: new Date(regimeEndsAtMs).toISOString(),
    lastPrice: price,
    lastUpdatedAt: new Date(lastUpdatedMs).toISOString(),
    tickCount,
    ticks,
  }
}

/** Fait avancer tous les actifs jusqu'à `nowIso`, sans jamais réécrire le passé. */
export function advanceMarket(
  state: MarketState,
  nowIso: string,
  assets: readonly SimulatedAsset[] = DEMO_ASSETS,
): MarketState {
  const nowMs = Date.parse(nowIso)
  if (Number.isNaN(nowMs)) throw new ValidationError('Horodatage de marché invalide.')

  const entries = assets.map((asset) => {
    const assetState = state.assets[asset.symbol]
    const advanced = assetState ? advanceAsset(asset, assetState, nowMs) : initialAssetState(asset, state.seed, nowIso)
    return [asset.symbol, advanced] as const
  })

  return {
    ...state,
    assets: Object.fromEntries(entries) as Record<AssetSymbol, AssetMarketState>,
    updatedAt: nowIso,
  }
}

export function quoteFromState(
  state: AssetMarketState,
  asset: SimulatedAsset = getAsset(state.symbol),
): MarketQuote {
  const price = state.lastPrice
  const halfSpread = (state.lastPrice * (asset.spreadBps / 10_000)) / 2
  const previousTick = state.ticks.length > 1 ? state.ticks[state.ticks.length - 2] : null
  const previousPrice = previousTick?.price ?? price
  return {
    symbol: state.symbol,
    price,
    bid: Math.max(0.0001, price - halfSpread),
    ask: price + halfSpread,
    previousPrice,
    changePercent: previousPrice > 0 ? ((price - previousPrice) / previousPrice) * 100 : 0,
    spreadBps: asset.spreadBps,
    regime: state.regime,
    updatedAt: state.lastUpdatedAt,
    simulated: true,
  }
}

export function getQuotes(
  state: MarketState,
  assets: readonly SimulatedAsset[] = DEMO_ASSETS,
): MarketQuote[] {
  return assets.map((asset) => quoteFromState(state.assets[asset.symbol], asset))
}

interface EventDescriptor {
  kind: MarketEvent['kind']
  label: string
  detail: string
}

const EVENT_BY_REGIME: Record<MarketRegime, EventDescriptor> = {
  uptrend: {
    kind: 'trend',
    label: 'Tendance haussière (simulation)',
    detail: 'Mouvement progressif à la hausse, généré par le moteur fictif BabiPlay.',
  },
  downtrend: {
    kind: 'trend',
    label: 'Tendance baissière (simulation)',
    detail: 'Mouvement progressif à la baisse, généré par le moteur fictif BabiPlay.',
  },
  consolidation: {
    kind: 'stabilization',
    label: 'Stabilisation (simulation)',
    detail: 'Volatilité réduite et prix quasi stable, sans signification économique réelle.',
  },
  acceleration: {
    kind: 'volatility',
    label: 'Forte volatilité (simulation)',
    detail: 'Amplitude accrue des variations, purement fictive.',
  },
  correction: {
    kind: 'correction',
    label: 'Correction (simulation)',
    detail: 'Mouvement correctif simulé, sans lien avec une actualité réelle.',
  },
}

/**
 * Événements de marché éditoriaux, dérivés du régime courant.
 * Ils sont explicitement marqués fictifs et ne modifient aucun prix.
 */
export function getMarketEvents(
  state: MarketState,
  assets: readonly SimulatedAsset[] = DEMO_ASSETS,
): MarketEvent[] {
  return assets.map((asset) => {
    const assetState = state.assets[asset.symbol]
    const descriptor = EVENT_BY_REGIME[assetState.regime]
    return {
      id: `mkt_${asset.symbol}_${Date.parse(assetState.regimeEndsAt)}`,
      symbol: asset.symbol,
      kind: descriptor.kind,
      label: descriptor.label,
      detail: `${descriptor.detail} Session fictive : ${asset.marketSession}.`,
      regime: assetState.regime,
      startsAt: assetState.lastUpdatedAt,
      endsAt: assetState.regimeEndsAt,
      simulated: true,
    }
  })
}

/** Prix d'entrée : achat au ask pour un long, vente au bid pour un short. */
export function entryPriceFor(quote: MarketQuote, direction: TradingPosition['direction']): number {
  return direction === 'long' ? quote.ask : quote.bid
}

/** Prix de sortie symétrique : le spread est payé à l'aller comme au retour. */
export function exitPriceFor(quote: MarketQuote, direction: TradingPosition['direction']): number {
  return direction === 'long' ? quote.bid : quote.ask
}

export interface CloseComputation {
  exitPrice: number
  fee: number
  pnl: number
  payout: number
}

/** Calcule la clôture avec frais traçables et perte plafonnée à la mise. */
export function computeClose(
  position: Pick<TradingPosition, 'direction' | 'stake' | 'entryPrice'>,
  quote: MarketQuote,
  asset: SimulatedAsset,
): CloseComputation {
  const exitPrice = exitPriceFor(quote, position.direction)
  const factor = position.direction === 'long' ? 1 : -1
  const rawPnl = ((exitPrice - position.entryPrice) / position.entryPrice) * position.stake * factor
  const rawFee = (position.stake * asset.feeBps) / 10_000
  // Frais traçables : au moins 1 jeton dès qu'un frais non nul est dû.
  const fee = rawFee > 0 ? Math.max(1, Math.round(rawFee)) : 0
  const payout = Math.max(0, Math.round(position.stake + rawPnl - fee))
  return {
    exitPrice,
    fee,
    pnl: payout - position.stake,
    payout,
  }
}

/** Détecte une clôture automatique à partir du prix serveur courant. */
export function evaluateAutoClose(
  position: Pick<
    TradingPosition,
    'status' | 'direction' | 'stake' | 'entryPrice' | 'stopLossPercent' | 'takeProfitPercent' | 'expiresAt'
  >,
  quote: MarketQuote,
  nowIso: string,
): CloseReason | null {
  if (position.status !== 'open') return null
  if (position.expiresAt && Date.parse(nowIso) >= Date.parse(position.expiresAt)) return 'expired'

  const exitPrice = exitPriceFor(quote, position.direction)
  const factor = position.direction === 'long' ? 1 : -1
  const changePercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100 * factor

  if (position.stopLossPercent !== null && changePercent <= -Math.abs(position.stopLossPercent)) {
    return 'stop_loss'
  }
  if (position.takeProfitPercent !== null && changePercent >= Math.abs(position.takeProfitPercent)) {
    return 'take_profit'
  }
  return null
}
