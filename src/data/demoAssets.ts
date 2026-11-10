import type { SimulatedAsset } from '../types/trading'

/**
 * Paramètres publics des actifs simulés.
 * Chaque actif possède sa propre volatilité, son biais et son spread :
 * ils ne partagent ni la même série ni le même profil de risque.
 */
export const DEMO_ASSETS: readonly SimulatedAsset[] = Object.freeze([
  {
    symbol: 'BTC',
    name: 'Bitcoin (simulé)',
    basePrice: 67_000,
    volatility: 0.0022,
    trendBias: 0.00018,
    spreadBps: 12,
    feeBps: 10,
    decimals: 2,
    marketSession: '24/7',
    simulated: true,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum (simulé)',
    basePrice: 3_500,
    volatility: 0.0026,
    trendBias: 0.00012,
    spreadBps: 14,
    feeBps: 10,
    decimals: 2,
    marketSession: '24/7',
    simulated: true,
  },
  {
    symbol: 'EURUSD',
    name: 'EUR/USD (simulé)',
    basePrice: 1.085,
    volatility: 0.00035,
    trendBias: 0.00002,
    spreadBps: 8,
    feeBps: 5,
    decimals: 4,
    marketSession: '08:00–22:00 UTC (simulé)',
    simulated: true,
  },
  {
    symbol: 'GOLD',
    name: 'Or (simulé)',
    basePrice: 2_350,
    volatility: 0.0009,
    trendBias: 0.00006,
    spreadBps: 10,
    feeBps: 8,
    decimals: 2,
    marketSession: '08:00–22:00 UTC (simulé)',
    simulated: true,
  },
  {
    symbol: 'NASDAQ',
    name: 'NASDAQ (simulé)',
    basePrice: 18_500,
    volatility: 0.0014,
    trendBias: 0.00015,
    spreadBps: 12,
    feeBps: 10,
    decimals: 2,
    marketSession: '14:30–21:00 UTC (simulé)',
    simulated: true,
  },
])

export function getAsset(symbol: SimulatedAsset['symbol']): SimulatedAsset {
  const asset = DEMO_ASSETS.find((candidate) => candidate.symbol === symbol)
  if (!asset) throw new Error(`Actif simulé inconnu : ${symbol}`)
  return asset
}
