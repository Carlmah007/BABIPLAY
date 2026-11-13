import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAviatorService } from '../../services/aviatorService'
import { createGameBoostService } from '../../services/gameBoostService'
import { createGameSettlementService } from '../../services/gameSettlementService'
import { createGameRandomnessService } from '../../services/gameRandomnessService'
import { createWalletService } from '../../services/walletService'
import { MemoryStorageAdapter } from '../../lib/storage'

// 01:36:30 HEURE LOCALE : la fenêtre du boost (01:37 ± 3 min) est active.
const NOW = new Date(2026, 0, 5, 1, 36, 30).toISOString()

function makeService(now: () => string = () => NOW) {
  const storage = new MemoryStorageAdapter()
  const wallet = createWalletService({ storage, now })
  const settlement = createGameSettlementService({ storage, wallet, now })
  const randomness = createGameRandomnessService({ storage, now })
  const boosts = createGameBoostService({ storage, now })
  const aviator = createAviatorService({ storage, now, wallet, settlement, randomness, boosts })
  return { storage, wallet, settlement, randomness, boosts, aviator }
}

describe('boosts programmés', () => {
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    const realRandom = Math.random
    Math.random = () => 0.5
    cleanup = () => {
      Math.random = realRandom
    }
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('valide l heure au format HH:MM', () => {
    const { boosts } = makeService()
    expect(() =>
      boosts.add({ label: 'x', game: 'aviator', timeOfDay: '25:99', forcedMultiplier: 36, maxWin: 100 }),
    ).toThrow()
    expect(() =>
      boosts.add({ label: 'x', game: 'aviator', timeOfDay: '01:37', forcedMultiplier: 36, maxWin: 100 }),
    ).not.toThrow()
  })

  it('détecte la fenêtre active autour de l heure', () => {
    const { boosts } = makeService()
    boosts.add({
      label: 'Boost 1h37',
      game: 'aviator',
      timeOfDay: '01:37',
      windowMinutes: 3,
      forcedMultiplier: 36,
      maxWin: 50_000,
    })
    expect(boosts.activeBoost('aviator', NOW)).not.toBeNull()
    // À 01:41 (+4 min), la fenêtre de 3 min est passée.
    expect(
      boosts.activeBoost('aviator', new Date(2026, 0, 5, 1, 41, 0).toISOString()),
    ).toBeNull()
  })

  it('force la cote et plafonne le gain pendant la fenêtre', () => {
    const { aviator, wallet, boosts } = makeService()
    const userId = 'player-boost'
    wallet.ensureInitialBalance(userId)
    boosts.add({
      label: 'Boost 1h37',
      game: 'aviator',
      timeOfDay: '01:37',
      windowMinutes: 3,
      forcedMultiplier: 36,
      maxWin: 50_000,
    })

    // Mise de 2 000 → cashout à 36× = 72 000 bruts, plafonné à 50 000.
    const round = aviator.startRound(userId, 2_000)
    expect(round.crashPoint).toBe(36)
    expect(round.boosted?.maxWin).toBe(50_000)

    // On retire juste avant le crash : le multiplicateur serveur vaut ~36,
    // le gain brut 72 000 est plafonné à 50 000.
    const at = new Date(Date.parse(round.startedAt) + round.crashElapsedMs - 10).toISOString()
    const result = aviator.cashout(userId, round.roundId, at)
    expect(result.payout).toBe(50_000)
    expect(result.settlement.pnl).toBe(48_000)
  })

  it('ne plafonne pas une manche normale hors fenêtre', () => {
    const { aviator, wallet } = makeService(() => '2026-01-05T10:00:00.000Z')
    const userId = 'player-normal'
    wallet.ensureInitialBalance(userId)
    const round = aviator.startRound(userId, 100)
    expect(round.boosted).toBeUndefined()
    expect(round.crashPoint).toBeGreaterThan(0)
  })
})
