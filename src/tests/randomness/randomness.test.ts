import { describe, expect, it } from 'vitest'
import {
  createDeterministicRandomSource,
  createGameRandomnessService,
  deriveUnit,
} from '../../services/gameRandomnessService'
import { MemoryStorageAdapter } from '../../lib/storage'
import { sha256Hex } from '../../lib/sha256'
import { ConflictError } from '../../lib/errors'

function setup(seed = 'randomness-test') {
  const storage = new MemoryStorageAdapter()
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0, tick++)).toISOString()
  const service = createGameRandomnessService({
    storage,
    random: createDeterministicRandomSource(seed),
    now,
  })
  return { storage, service }
}

describe('aléa commun — engagements et unicité', () => {
  it('génère des identifiants et nonces uniques', () => {
    const { service } = setup()
    const rounds = Array.from({ length: 40 }, (_, index) =>
      service.createRound(index % 2 === 0 ? 'aviator' : 'trading'),
    )
    expect(new Set(rounds.map((round) => round.roundId)).size).toBe(40)
    expect(new Set(rounds.map((round) => round.nonce)).size).toBe(40)
    expect(new Set(rounds.map((round) => round.serverSeed)).size).toBe(40)
  })

  it('publie le hash du seed sans exposer le seed', () => {
    const { service } = setup()
    const round = service.createRound('aviator')
    const commitment = service.listRounds()[0]
    expect(commitment.serverSeedHash).toBe(sha256Hex(round.serverSeed))
    expect(commitment.serverSeedHash).toHaveLength(64)
    expect(Object.keys(commitment)).not.toContain('serverSeed')
    expect(service.verify(round.roundId)).toBe(true)
  })

  it('refuse de réutiliser un identifiant de manche', () => {
    const { service } = setup()
    const round = service.createRound('aviator')
    expect(() => service.createRound('aviator', { roundId: round.roundId })).toThrow(
      ConflictError,
    )
  })

  it('produit des tirages reproductibles à partir des données d’audit', () => {
    const { service } = setup()
    const round = service.createRound('aviator')
    const draw = service.drawSequence(round.roundId)
    const values = Array.from({ length: 20 }, (_, index) => draw(index))
    const replay = Array.from({ length: 20 }, (_, index) =>
      deriveUnit(round.serverSeed, round.nonce, index),
    )
    expect(values).toEqual(replay)
    expect(new Set(values).size).toBeGreaterThan(19)
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('sépare les générateurs de jeux différents', () => {
    const { service } = setup()
    const aviator = service.createRound('aviator')
    const trading = service.createRound('trading')
    expect(aviator.serverSeed).not.toBe(trading.serverSeed)
    expect(aviator.nonce).not.toBe(trading.nonce)
    const first = service.drawSequence(aviator.roundId)(0)
    const second = service.drawSequence(trading.roundId)(0)
    expect(first).not.toBe(second)
  })

  it('ne produit pas la même séquence avec deux seeds distincts', () => {
    const first = setup('generator-a')
    const second = setup('generator-b')
    const firstRound = first.service.createRound('aviator')
    const secondRound = second.service.createRound('aviator')
    const firstValues = Array.from({ length: 12 }, (_, index) =>
      first.service.drawSequence(firstRound.roundId)(index),
    )
    const secondValues = Array.from({ length: 12 }, (_, index) =>
      second.service.drawSequence(secondRound.roundId)(index),
    )
    expect(firstValues).not.toEqual(secondValues)
  })
})
