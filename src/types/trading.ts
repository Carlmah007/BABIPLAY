/**
 * Contrats du trading simulé.
 *
 * Les prix sont générés par un moteur déterministe par actif (seed dédié),
 * avec plusieurs régimes de volatilité. Aucune cotation réelle.
 */

export type AssetSymbol = 'BTC' | 'ETH' | 'EURUSD' | 'GOLD' | 'NASDAQ'

export type MarketRegime =
  | 'uptrend'
  | 'downtrend'
  | 'consolidation'
  | 'acceleration'
  | 'correction'

export interface SimulatedAsset {
  symbol: AssetSymbol
  name: string
  basePrice: number
  /** Volatilité par tick (écart-type approximatif du rendement). */
  volatility: number
  /** Biais directionnel par tick. */
  trendBias: number
  /** Spread achat/vente en points de base. */
  spreadBps: number
  /** Frais de clôture en points de base du montant engagé. */
  feeBps: number
  decimals: number
  marketSession: string
  simulated: true
}

export interface MarketTick {
  at: string
  price: number
  regime: MarketRegime
}

export interface AssetMarketState {
  symbol: AssetSymbol
  /** Seed propre à l'actif : aucun actif ne partage la même série. */
  seed: string
  regime: MarketRegime
  regimeEndsAt: string
  lastPrice: number
  lastUpdatedAt: string
  /** Compteur total de ticks : garantit des tirages uniques même après purge. */
  tickCount: number
  ticks: MarketTick[]
}

export interface MarketState {
  seed: string
  assets: Record<AssetSymbol, AssetMarketState>
  updatedAt: string
}

export interface MarketQuote {
  symbol: AssetSymbol
  price: number
  bid: number
  ask: number
  previousPrice: number
  changePercent: number
  spreadBps: number
  regime: MarketRegime
  updatedAt: string
  simulated: true
}

export type MarketEventKind =
  | 'trend'
  | 'volatility'
  | 'correction'
  | 'stabilization'
  | 'session'

/** Événement éditorial fictif : jamais présenté comme une actualité réelle. */
export interface MarketEvent {
  id: string
  symbol: AssetSymbol
  kind: MarketEventKind
  label: string
  detail: string
  regime: MarketRegime
  startsAt: string
  endsAt: string
  simulated: true
}

export type TradeDirection = 'long' | 'short'

export type PositionStatus = 'open' | 'closed' | 'cancelled'

export type CloseReason = 'manual' | 'stop_loss' | 'take_profit' | 'expired'

export interface TradingPosition {
  id: string
  userId: string
  symbol: AssetSymbol
  direction: TradeDirection
  stake: number
  entryPrice: number
  exitPrice: number | null
  status: PositionStatus
  openedAt: string
  closedAt: string | null
  pnl: number | null
  payout: number
  fee: number
  closeReason: CloseReason | null
  stopLossPercent: number | null
  takeProfitPercent: number | null
  expiresAt: string | null
  settledAt: string | null
  demo: true
}
