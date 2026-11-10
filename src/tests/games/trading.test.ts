import { describe, expect, it } from 'vitest'
import { MemoryStorageAdapter } from '../../lib/storage'
import { createWalletService } from '../../services/walletService'
import { createGameSettlementService } from '../../services/gameSettlementService'
import { createDeterministicRandomSource } from '../../services/gameRandomnessService'
import { createTradingService, TRADING_RULES } from '../../services/tradingService'
import { exitPriceFor } from '../../features/trading/marketEngine'
import { ConflictError } from '../../lib/errors'

const USER = 'demo-player'

function setup() {
  const storage = new MemoryStorageAdapter()
  let nowMs = Date.parse('2026-01-01T12:00:00.000Z')
  const now = () => new Date(nowMs).toISOString()
  const advance = (ms: number) => {
    nowMs += ms
  }
  const wallet = createWalletService({ storage, now, initialBalance: 50_000 })
  const settlement = createGameSettlementService({ storage, now, wallet })
  const trading = createTradingService({
    storage,
    now,
    wallet,
    settlement,
    random: createDeterministicRandomSource('trading-test-seed'),
  })
  return { storage, wallet, settlement, trading, now, advance }
}

describe('Trading — marché simulé', () => {
  it('donne à chaque actif un seed et une série distincts', () => {
    const { trading, advance } = setup()
    const initial = trading.getQuotes()
    expect(initial).toHaveLength(5)
    const seeds = Object.values(trading.getMarket().assets).map((asset) => asset.seed)
    expect(new Set(seeds).size).toBe(5)

    advance(50_000)
    const later = trading.getQuotes()
    const changes = later.map((quote) => (quote.price - quote.previousPrice) / quote.previousPrice)
    expect(new Set(changes.map((change) => change.toFixed(8))).size).toBeGreaterThan(1)

    const series = Object.values(trading.getMarket().assets).map((asset) =>
      asset.ticks.map((tick) => tick.price.toFixed(4)).join('|'),
    )
    expect(new Set(series).size).toBe(5)
    for (const asset of Object.values(trading.getMarket().assets)) {
      expect(asset.ticks.length).toBeGreaterThan(1)
    }
  })

  it('applique un spread et des frais publics', () => {
    const { trading } = setup()
    const quote = trading.getQuote('BTC')
    expect(quote.ask).toBeGreaterThan(quote.price)
    expect(quote.bid).toBeLessThan(quote.price)
    expect(quote.spreadBps).toBe(12)
    expect(TRADING_RULES.slippage).toContain('spread')
    expect(TRADING_RULES.fees).toContain('Frais')
  })

  it('expose des événements de marché explicitement fictifs', () => {
    const { trading } = setup()
    const events = trading.getMarketEvents()
    expect(events).toHaveLength(5)
    expect(new Set(events.map((event) => event.id)).size).toBe(5)
    for (const event of events) {
      expect(event.simulated).toBe(true)
      expect(event.detail).toContain('fictive')
      expect(Date.parse(event.endsAt)).toBeGreaterThan(Date.parse(event.startsAt))
    }
  })

  it('conserve le même marché après rechargement', () => {
    const { storage, trading, advance, now } = setup()
    trading.getQuotes()
    advance(35_000)
    const market = trading.getMarket()

    const reloaded = createTradingService({
      storage,
      now,
      random: createDeterministicRandomSource('should-not-be-used'),
    })
    const reloadedMarket = reloaded.getMarket()
    expect(reloadedMarket.seed).toBe(market.seed)
    expect(reloadedMarket.assets.BTC.lastPrice).toBe(market.assets.BTC.lastPrice)
    expect(reloadedMarket.assets.BTC.ticks.map((tick) => tick.price)).toEqual(
      market.assets.BTC.ticks.map((tick) => tick.price),
    )
  })

  it('ne réutilise pas le même seed pour une nouvelle session', () => {
    const { trading } = setup()
    const first = trading.getMarket().seed
    const second = trading.startNewSession().seed
    expect(second).not.toBe(first)
    expect(trading.getSeedHistory()).toEqual(expect.arrayContaining([first, second]))
  })
})

describe('Trading — positions', () => {
  it('ouvre une position longue au prix serveur et la clôture une seule fois', () => {
    const { trading, wallet, settlement, advance } = setup()
    const entryQuote = trading.getQuote('BTC')
    const position = trading.openPosition({
      userId: USER,
      symbol: 'BTC',
      direction: 'long',
      stake: 1_000,
      stopLossPercent: 10,
      takeProfitPercent: 20,
    })

    expect(position.status).toBe('open')
    expect(position.entryPrice).toBe(entryQuote.ask)
    expect(wallet.getBalance(USER)).toBe(49_000)
    expect(position.fee).toBe(0)

    advance(60_000)
    const closeQuote = trading.getQuote('BTC')
    const result = trading.closePosition(USER, position.id)
    expect(result.position.status).toBe('closed')
    expect(result.position.exitPrice).toBe(exitPriceFor(closeQuote, 'long'))
    expect(result.position.pnl).toBe(result.settlement.pnl)
    expect(result.position.fee).toBeGreaterThanOrEqual(1)
    expect(result.settlement.outcome).toBe('manual_close')
    expect(wallet.getBalance(USER)).toBe(49_000 + result.position.payout)
    expect(settlement.list(USER)).toHaveLength(1)

    const lastMovement = wallet.getMovements(USER).at(-1)
    expect(lastMovement?.type).toBe('trading_profit')
    expect(lastMovement?.metadata.fee).toBe(result.position.fee)

    expect(() => trading.closePosition(USER, position.id)).toThrow(ConflictError)
    expect(settlement.list(USER)).toHaveLength(1)
  })

  it('gère une position courte avec le prix bid/ask opposé', () => {
    const { trading, advance } = setup()
    const entryQuote = trading.getQuote('ETH')
    const position = trading.openPosition({
      userId: USER,
      symbol: 'ETH',
      direction: 'short',
      stake: 500,
    })
    expect(position.entryPrice).toBe(entryQuote.bid)

    advance(30_000)
    const closeQuote = trading.getQuote('ETH')
    const result = trading.closePosition(USER, position.id)
    expect(result.position.exitPrice).toBe(exitPriceFor(closeQuote, 'short'))
    expect(result.position.status).toBe('closed')
  })

  it('clôt automatiquement sur stop-loss avec le prix serveur', () => {
    const { trading } = setup()
    const position = trading.openPosition({
      userId: USER,
      symbol: 'BTC',
      direction: 'long',
      stake: 1_000,
      stopLossPercent: 0.1,
    })
    const closed = trading.syncPositions(USER)
    expect(closed).toHaveLength(1)
    expect(closed[0].position.id).toBe(position.id)
    expect(closed[0].position.closeReason).toBe('stop_loss')
    expect(closed[0].settlement.outcome).toBe('stop_loss')
    expect(closed[0].position.status).toBe('closed')
  })

  it('clôt automatiquement à expiration', () => {
    const { trading, advance } = setup()
    const position = trading.openPosition({
      userId: USER,
      symbol: 'GOLD',
      direction: 'long',
      stake: 300,
      durationMinutes: 1,
    })
    advance(61_000)
    const closed = trading.syncPositions(USER)
    expect(closed).toHaveLength(1)
    expect(closed[0].position.id).toBe(position.id)
    expect(closed[0].position.closeReason).toBe('expired')
    expect(closed[0].position.expiresAt).toBe(position.expiresAt)
  })

  it('garde le prix d’entrée et le résultat après rechargement', () => {
    const { storage, trading, wallet, advance, now } = setup()
    const position = trading.openPosition({
      userId: USER,
      symbol: 'NASDAQ',
      direction: 'long',
      stake: 800,
    })
    advance(45_000)
    const closed = trading.closePosition(USER, position.id)

    const reloadedWallet = createWalletService({ storage, now, initialBalance: 50_000 })
    const reloadedSettlement = createGameSettlementService({
      storage,
      now,
      wallet: reloadedWallet,
    })
    const reloaded = createTradingService({
      storage,
      now,
      wallet: reloadedWallet,
      settlement: reloadedSettlement,
      random: createDeterministicRandomSource('unused'),
    })

    const stored = reloaded.getPosition(position.id)
    expect(stored?.entryPrice).toBe(position.entryPrice)
    expect(stored?.exitPrice).toBe(closed.position.exitPrice)
    expect(stored?.pnl).toBe(closed.position.pnl)
    expect(stored?.fee).toBe(closed.position.fee)
    expect(reloadedWallet.getBalance(USER)).toBe(wallet.getBalance(USER))
    expect(reloadedSettlement.list(USER)).toHaveLength(1)
    expect(() => reloaded.closePosition(USER, position.id)).toThrow(ConflictError)
  })
})
