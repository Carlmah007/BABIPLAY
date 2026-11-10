import { describe, expect, it } from 'vitest'
import { createWalletService } from '../../services/walletService'
import { MemoryStorageAdapter } from '../../lib/storage'
import { ConflictError, InsufficientFundsError, ValidationError } from '../../lib/errors'
import type { MovementInput } from '../../types/wallet'

const USER = 'demo-player'

function setup() {
  const storage = new MemoryStorageAdapter()
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0, tick++)).toISOString()
  const service = createWalletService({ storage, now, initialBalance: 50_000 })
  return { storage, service }
}

function baseInput(overrides: Partial<MovementInput> = {}): MovementInput {
  return {
    userId: USER,
    type: 'game_stake',
    direction: 'debit',
    amount: 500,
    currency: 'BABI',
    source: 'aviator',
    reference: 'ref-aviator-001',
    idempotencyKey: 'aviator:stake:001',
    ...overrides,
  }
}

describe('portefeuille — solde initial', () => {
  it('crée un solde de 50 000 jetons', () => {
    const { service } = setup()
    const movement = service.ensureInitialBalance(USER)
    expect(movement.type).toBe('initial_balance')
    expect(movement.amount).toBe(50_000)
    expect(movement.balanceAfter).toBe(50_000)
    expect(service.getBalance(USER)).toBe(50_000)
  })

  it('est idempotent : un seul mouvement initial', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.ensureInitialBalance(USER)
    expect(service.getMovements(USER)).toHaveLength(1)
    expect(service.getBalance(USER)).toBe(50_000)
  })
})

describe('portefeuille — débits et crédits', () => {
  it('débite une mise et met à jour le solde', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    const movement = service.apply(baseInput())
    expect(movement.direction).toBe('debit')
    expect(movement.balanceAfter).toBe(49_500)
    expect(service.getBalance(USER)).toBe(49_500)
  })

  it('crédite un gain', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput())
    const movement = service.credit({
      ...baseInput(),
      type: 'game_win',
      amount: 1_200,
      reference: 'ref-aviator-002',
      idempotencyKey: 'aviator:win:001',
      metadata: { pnl: 700 },
    })
    expect(movement.balanceAfter).toBe(50_700)
    expect(service.getBalance(USER)).toBe(50_700)
  })

  it('refuse une mise supérieure au solde', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    expect(() => service.apply(baseInput({ amount: 50_001 }))).toThrow(InsufficientFundsError)
    expect(service.getBalance(USER)).toBe(50_000)
    expect(service.getMovements(USER)).toHaveLength(1)
  })

  it('empêche un solde négatif', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput({ amount: 50_000 }))
    expect(service.getBalance(USER)).toBe(0)
    expect(() => service.apply(baseInput({ amount: 1, idempotencyKey: 'aviator:stake:002' }))).toThrow(
      InsufficientFundsError,
    )
    expect(service.getBalance(USER)).toBe(0)
  })
})

describe('portefeuille — idempotence', () => {
  it('ne débite pas deux fois avec la même clé', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    const first = service.apply(baseInput())
    const second = service.apply(baseInput())
    expect(second.id).toBe(first.id)
    expect(service.getBalance(USER)).toBe(49_500)
    expect(service.getMovements(USER)).toHaveLength(2)
  })

  it('ne crédite pas deux fois avec la même clé', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    const input = baseInput({
      type: 'game_win',
      direction: 'credit',
      amount: 1_000,
      reference: 'ref-win-001',
      idempotencyKey: 'aviator:win:001',
    })
    const first = service.apply(input)
    const second = service.apply(input)
    expect(second.id).toBe(first.id)
    expect(service.getBalance(USER)).toBe(51_000)
  })

  it('rejette une clé réutilisée avec un autre montant', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput())
    expect(() => service.apply(baseInput({ amount: 700 }))).toThrow(ConflictError)
    expect(service.getBalance(USER)).toBe(49_500)
  })
})

describe('portefeuille — validation', () => {
  it('rejette un type inconnu', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    expect(() =>
      service.apply(baseInput({ type: 'free_money' as MovementInput['type'] })),
    ).toThrow(ValidationError)
  })

  it('rejette un sens incompatible avec le type', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    expect(() => service.apply(baseInput({ type: 'game_win', direction: 'debit' }))).toThrow(
      ValidationError,
    )
  })

  it('rejette un statut non terminé', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    expect(() => service.apply(baseInput({ status: 'pending' }))).toThrow(ValidationError)
  })

  it('rejette un montant nul ou négatif sur un débit', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    expect(() => service.apply(baseInput({ amount: 0 }))).toThrow(ValidationError)
    expect(() => service.apply(baseInput({ amount: -10 }))).toThrow(ValidationError)
  })

  it('accepte un marqueur de perte neutre à zéro', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput())
    const marker = service.mark({
      userId: USER,
      type: 'game_loss',
      currency: 'BABI',
      source: 'aviator',
      reference: 'ref-aviator-loss-001',
      idempotencyKey: 'aviator:loss:001',
      metadata: { pnl: -500, stake: 500 },
    })
    expect(marker.amount).toBe(0)
    expect(marker.direction).toBe('neutral')
    expect(marker.balanceAfter).toBe(49_500)
  })
})

describe('portefeuille — ledger et statistiques', () => {
  it('conserve une chaîne de soldes cohérente', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput())
    service.credit({
      ...baseInput(),
      type: 'game_win',
      amount: 1_200,
      reference: 'ref-win-002',
      idempotencyKey: 'aviator:win:002',
      metadata: { pnl: 700 },
    })
    service.apply(baseInput({ idempotencyKey: 'trading:open:001', source: 'trading', type: 'trading_open', reference: 'ref-trade-001', amount: 1_000 }))

    const movements = service.getMovements(USER)
    let expected = 0
    for (const movement of movements) {
      expected += movement.direction === 'credit' ? movement.amount : movement.direction === 'debit' ? -movement.amount : 0
      expect(movement.balanceAfter).toBe(expected)
      expect(movement.balanceAfter).toBeGreaterThanOrEqual(0)
    }
  })

  it('calcule gains et pertes depuis les métadonnées pnl', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput({ metadata: { pnl: -500 } }))
    service.credit({
      ...baseInput(),
      type: 'game_win',
      amount: 1_200,
      reference: 'ref-win-003',
      idempotencyKey: 'aviator:win:003',
      metadata: { pnl: 700 },
    })
    service.mark({
      userId: USER,
      type: 'game_loss',
      currency: 'BABI',
      source: 'aviator',
      reference: 'ref-loss-003',
      idempotencyKey: 'aviator:loss:003',
      metadata: { pnl: -300 },
    })

    const summary = service.getSummary(USER)
    expect(summary.totalGains).toBe(700)
    expect(summary.totalLosses).toBe(800)
    expect(summary.operationCount).toBe(3)
    expect(summary.availableBalance).toBe(50_700)
  })

  it('expose des mouvements figés (immuables)', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    const movement = service.apply(baseInput())
    expect(Object.isFrozen(movement)).toBe(true)
    expect(Object.isFrozen(movement.metadata)).toBe(true)
  })

  it('persiste le ledger entre deux instances de service', () => {
    const { storage, service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput())

    const second = createWalletService({ storage, initialBalance: 50_000 })
    expect(second.getBalance(USER)).toBe(49_500)
    expect(second.getMovements(USER)).toHaveLength(2)
  })

  it('fournit un historique ordonné', () => {
    const { service } = setup()
    service.ensureInitialBalance(USER)
    service.apply(baseInput())
    service.apply(baseInput({ idempotencyKey: 'aviator:stake:002', reference: 'ref-aviator-002', amount: 250 }))
    const movements = service.getMovements(USER)
    expect(movements.map((movement) => movement.type)).toEqual([
      'initial_balance',
      'game_stake',
      'game_stake',
    ])
    expect(movements[1].createdAt <= movements[2].createdAt).toBe(true)
  })
})
