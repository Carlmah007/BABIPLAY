import { beforeAll, describe, expect, it } from 'vitest'
import { MemoryStorageAdapter } from '../../lib/storage'
import { createWalletService } from '../../services/walletService'
import { createGameSettlementService } from '../../services/gameSettlementService'
import { createNotificationService } from '../../services/notificationService'
import {
  createDeterministicRandomSource,
  createGameRandomnessService,
} from '../../services/gameRandomnessService'
import { createAviatorService } from '../../services/aviatorService'
import {
  crashPointFromUnit,
  generateAviatorRound,
} from '../../features/aviator/engine'
import { ConflictError } from '../../lib/errors'

const USER = 'demo-player'
let TEST_SEED = ''

beforeAll(() => {
  for (let index = 0; index < 200; index += 1) {
    const candidate = `aviator-test-seed-${index}`
    const storage = new MemoryStorageAdapter()
    const randomness = createGameRandomnessService({
      storage,
      random: createDeterministicRandomSource(candidate),
    })
    const round = randomness.createRound('aviator')
    const crash = crashPointFromUnit(randomness.drawSequence(round.roundId)(0))
    if (crash >= 2) {
      TEST_SEED = candidate
      return
    }
  }
  throw new Error('Aucun seed de test avec un crash ≥ 2 trouvé.')
})

function setup() {
  const storage = new MemoryStorageAdapter()
  let nowMs = Date.parse('2026-01-01T12:00:00.000Z')
  const now = () => new Date(nowMs).toISOString()
  const advance = (ms: number) => {
    nowMs += ms
  }
  const wallet = createWalletService({ storage, now, initialBalance: 50_000 })
  const settlement = createGameSettlementService({ storage, now, wallet })
  const notifications = createNotificationService({ storage, now })
  const randomness = createGameRandomnessService({
    storage,
    now,
    random: createDeterministicRandomSource(TEST_SEED),
  })
  const aviator = createAviatorService({ storage, now, wallet, settlement, randomness })
  return { storage, wallet, settlement, notifications, randomness, aviator, now, advance }
}

describe('Aviator — manche et engagement', () => {
  it('enregistre le résultat avant l’affichage et publie le hash du seed', () => {
    const { aviator, wallet, randomness } = setup()
    const round = aviator.startRound(USER, 1_000)

    expect(round.status).toBe('running')
    expect(round.crashPoint).toBeGreaterThanOrEqual(2)
    expect(round.serverSeedHash).toHaveLength(64)
    expect(round.serverSeedHash).toBe(
      randomness.listRounds().find((entry) => entry.roundId === round.roundId)?.serverSeedHash,
    )
    expect(round).not.toHaveProperty('serverSeed')
    expect(wallet.getBalance(USER)).toBe(49_000)

    const publicRound = aviator.getPublicRound(round.roundId)
    expect(publicRound?.crashPoint).toBeNull()
    expect(publicRound?.crashElapsedMs).toBeNull()

    const atStart = aviator.getServerMultiplier(round.roundId)
    expect(atStart.multiplier).toBe(1)
    expect(atStart.crashed).toBe(false)
    expect(atStart.crashPoint).toBeNull()
  })

  it('varie la durée, la vitesse, l’intervalle et le crash entre manches', () => {
    const { randomness } = setup()
    const rounds = Array.from({ length: 8 }, () =>
      randomness.createRound('aviator'),
    ).map((secret) =>
      generateAviatorRound({
        secret,
        userId: USER,
        stake: 100,
        startedAt: '2026-01-01T12:00:00.000Z',
        draw: randomness.drawSequence(secret.roundId),
      }),
    )

    expect(new Set(rounds.map((round) => round.roundId)).size).toBe(8)
    expect(new Set(rounds.map((round) => round.nonce)).size).toBe(8)
    expect(new Set(rounds.map((round) => round.crashPoint)).size).toBeGreaterThan(1)
    expect(new Set(rounds.map((round) => round.growthRate)).size).toBeGreaterThan(1)
    expect(new Set(rounds.map((round) => round.tickMs)).size).toBeGreaterThan(1)
    expect(new Set(rounds.map((round) => round.nextRoundDelayMs)).size).toBeGreaterThan(1)
  })

  it('ne calcule pas de résultat différent selon le joueur', () => {
    const { randomness } = setup()
    const secret = randomness.createRound('aviator')
    const draw = randomness.drawSequence(secret.roundId)
    const first = generateAviatorRound({
      secret,
      userId: 'player-alpha',
      stake: 100,
      startedAt: '2026-01-01T12:00:00.000Z',
      draw,
    })
    const second = generateAviatorRound({
      secret,
      userId: 'player-beta',
      stake: 100_000,
      startedAt: '2026-01-01T12:00:00.000Z',
      draw,
    })
    expect(first.crashPoint).toBe(second.crashPoint)
    expect(first.crashElapsedMs).toBe(second.crashElapsedMs)
  })

  it('ne réutilise jamais un nonce, même sur de nombreuses manches', () => {
    const { randomness } = setup()
    const rounds = Array.from({ length: 30 }, () => randomness.createRound('aviator'))
    expect(new Set(rounds.map((round) => round.nonce)).size).toBe(30)
    expect(new Set(rounds.map((round) => round.serverSeed)).size).toBe(30)
  })
})

describe('Aviator — retrait et crash', () => {
  it('valide un retrait avant le crash et crédite le gain une seule fois', () => {
    const { aviator, wallet, settlement, advance, now } = setup()
    const round = aviator.startRound(USER, 1_000)
    const elapsed = Math.floor(round.crashElapsedMs * 0.6)
    advance(elapsed)

    const before = aviator.getRound(round.roundId)
    const cashout = aviator.cashout(USER, round.roundId)
    expect(cashout.multiplier).toBeGreaterThan(1)
    expect(cashout.payout).toBe(Math.floor(1_000 * cashout.multiplier))
    expect(cashout.round.status).toBe('settled')
    expect(cashout.round.payout).toBe(cashout.payout)
    expect(wallet.getBalance(USER)).toBe(50_000 - 1_000 + cashout.payout)
    expect(settlement.list(USER)).toHaveLength(1)

    // L'animation ou les lectures intermédiaires ne modifient pas le résultat.
    expect(before?.crashPoint).toBe(cashout.round.crashPoint)
    expect(aviator.getServerMultiplier(round.roundId, now()).multiplier).toBe(
      cashout.multiplier,
    )
    expect(() => aviator.cashout(USER, round.roundId)).toThrow(ConflictError)
    expect(settlement.list(USER)).toHaveLength(1)
  })

  it('refuse un retrait après le crash et règle la manche une seule fois', () => {
    const { aviator, wallet, settlement, notifications, advance } = setup()
    const round = aviator.startRound(USER, 1_000)
    advance(round.crashElapsedMs + 50)

    expect(() => aviator.cashout(USER, round.roundId)).toThrow(ConflictError)
    expect(wallet.getBalance(USER)).toBe(49_000)
    const settled = aviator.getRound(round.roundId)
    expect(settled?.status).toBe('settled')
    expect(settled?.payout).toBe(0)
    expect(settled?.pnl).toBe(-1_000)
    expect(settlement.list(USER)).toHaveLength(1)
    expect(notifications.list(USER)[0].type).toBe('game_loss')
  })

  it('conserve exactement le même résultat après rechargement', () => {
    const { storage, aviator, wallet, advance, now } = setup()
    const round = aviator.startRound(USER, 500)
    advance(Math.floor(round.crashElapsedMs * 0.5))
    const cashout = aviator.cashout(USER, round.roundId)

    const reloadedWallet = createWalletService({ storage, now, initialBalance: 50_000 })
    const reloadedSettlement = createGameSettlementService({
      storage,
      now,
      wallet: reloadedWallet,
    })
    const reloadedRandomness = createGameRandomnessService({
      storage,
      now,
      random: createDeterministicRandomSource('unused-on-reload'),
    })
    const reloaded = createAviatorService({
      storage,
      now,
      wallet: reloadedWallet,
      settlement: reloadedSettlement,
      randomness: reloadedRandomness,
    })

    const stored = reloaded.getRound(round.roundId)
    expect(stored?.crashPoint).toBe(cashout.round.crashPoint)
    expect(stored?.cashoutMultiplier).toBe(cashout.multiplier)
    expect(stored?.payout).toBe(cashout.payout)
    expect(stored?.settledAt).toBe(cashout.round.settledAt)
    expect(reloadedWallet.getBalance(USER)).toBe(wallet.getBalance(USER))
    expect(reloadedSettlement.list(USER)).toHaveLength(1)
  })

  it('révèle le seed et permet de vérifier le crash après règlement', () => {
    const { aviator, advance } = setup()
    const round = aviator.startRound(USER, 100)
    expect(() => aviator.reveal(round.roundId)).toThrow(ConflictError)

    advance(round.crashElapsedMs + 1)
    aviator.refresh(round.roundId)
    const reveal = aviator.reveal(round.roundId)
    expect(reveal.serverSeed).toHaveLength(64)
    expect(reveal.verified).toBe(true)
    expect(aviator.verify(round.roundId)).toBe(true)
  })
})

describe('Aviator — distribution publique', () => {
  it('produit une distribution variée, bornée et sans séquence fixe', () => {
    const { randomness } = setup()
    const round = randomness.createRound('aviator')
    const draw = randomness.drawSequence(round.roundId)
    const points = Array.from({ length: 300 }, (_, index) =>
      crashPointFromUnit(draw(index + 10)),
    )

    for (const point of points) {
      expect(point).toBeGreaterThanOrEqual(1.01)
      expect(point).toBeLessThanOrEqual(500)
      expect(Math.abs(point * 100 - Math.round(point * 100))).toBeLessThan(1e-9)
    }
    expect(new Set(points).size).toBeGreaterThan(50)
    const low = points.filter((point) => point < 2).length
    const high = points.filter((point) => point >= 3).length
    expect(low).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(0)
  })
})
