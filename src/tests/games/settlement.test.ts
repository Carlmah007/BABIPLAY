import { describe, expect, it } from 'vitest'
import { createWalletService } from '../../services/walletService'
import { createGameSettlementService } from '../../services/gameSettlementService'
import { createNotificationService } from '../../services/notificationService'
import { createAuditService } from '../../services/auditService'
import { MemoryStorageAdapter } from '../../lib/storage'
import { ConflictError, ValidationError } from '../../lib/errors'

const USER = 'demo-player'

function setup() {
  const storage = new MemoryStorageAdapter()
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0, tick++)).toISOString()
  const wallet = createWalletService({ storage, now, initialBalance: 50_000 })
  const settlement = createGameSettlementService({ storage, now, wallet })
  const notifications = createNotificationService({ storage, now })
  const audit = createAuditService({ storage, now })
  wallet.ensureInitialBalance(USER)
  return { storage, wallet, settlement, notifications, audit }
}

function debitStake(
  wallet: ReturnType<typeof createWalletService>,
  roundId: string,
  amount: number,
) {
  return wallet.debit({
    userId: USER,
    type: 'game_stake',
    amount,
    currency: wallet.currency,
    source: 'aviator',
    reference: `aviator:stake:${roundId}`,
    idempotencyKey: `aviator:stake:${roundId}`,
  })
}

describe('règlement commun — gain et perte', () => {
  it('crédite un gain et trace le mouvement de ledger', () => {
    const { wallet, settlement, notifications, audit } = setup()
    const roundId = 'aviator_round_gain_001'
    debitStake(wallet, roundId, 1_000)

    const result = settlement.settle({
      game: 'aviator',
      roundId,
      userId: USER,
      stake: 1_000,
      payout: 2_500,
      outcome: 'cashout',
      settledAt: '2026-01-01T12:02:00.000Z',
    })

    expect(result.alreadySettled).toBe(false)
    expect(result.pnl).toBe(1_500)
    expect(wallet.getBalance(USER)).toBe(50_000 - 1_000 + 2_500)
    const movements = wallet.getMovements(USER)
    expect(movements).toHaveLength(3)
    expect(movements[1].type).toBe('game_stake')
    expect(movements[2].type).toBe('game_win')
    expect(movements[2].amount).toBe(2_500)
    expect(movements[2].metadata.pnl).toBe(1_500)
    expect(notifications.unreadCount(USER)).toBe(1)
    expect(notifications.list(USER)[0].type).toBe('game_win')
    expect(audit.list()).toHaveLength(1)
    expect(audit.list()[0].action).toBe('game_settled')
    expect(audit.list()[0].actorRole).toBe('system')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(settlement.get('aviator', roundId))).toBe(true)
  })

  it('écrit un marqueur neutre pour une perte, sans débiter une seconde fois', () => {
    const { wallet, settlement, notifications } = setup()
    const roundId = 'aviator_round_loss_001'
    debitStake(wallet, roundId, 1_000)
    const balanceAfterStake = wallet.getBalance(USER)

    const result = settlement.settle({
      game: 'aviator',
      roundId,
      userId: USER,
      stake: 1_000,
      payout: 0,
      outcome: 'crash',
    })

    expect(result.pnl).toBe(-1_000)
    expect(wallet.getBalance(USER)).toBe(balanceAfterStake)
    const marker = wallet.getMovements(USER).at(-1)
    expect(marker?.type).toBe('game_loss')
    expect(marker?.direction).toBe('neutral')
    expect(marker?.amount).toBe(0)
    expect(notifications.list(USER)[0].type).toBe('game_loss')
  })

  it('refuse un second règlement avec un autre montant', () => {
    const { wallet, settlement } = setup()
    const roundId = 'aviator_round_immutable_001'
    debitStake(wallet, roundId, 1_000)
    settlement.settle({
      game: 'aviator',
      roundId,
      userId: USER,
      stake: 1_000,
      payout: 1_500,
      outcome: 'cashout',
    })

    expect(() =>
      settlement.settle({
        game: 'aviator',
        roundId,
        userId: USER,
        stake: 1_000,
        payout: 9_999,
        outcome: 'cashout',
      }),
    ).toThrow(ConflictError)
    expect(wallet.getBalance(USER)).toBe(50_500)
  })

  it('est idempotent sur un règlement identique', () => {
    const { wallet, settlement } = setup()
    const roundId = 'aviator_round_idempotent_001'
    debitStake(wallet, roundId, 1_000)
    const request = {
      game: 'aviator' as const,
      roundId,
      userId: USER,
      stake: 1_000,
      payout: 1_500,
      outcome: 'cashout' as const,
      settledAt: '2026-01-01T12:03:00.000Z',
    }
    const first = settlement.settle(request)
    const second = settlement.settle(request)

    expect(second.alreadySettled).toBe(true)
    expect(second.id).toBe(first.id)
    expect(wallet.getMovements(USER)).toHaveLength(3)
    expect(wallet.getBalance(USER)).toBe(50_500)
  })

  it('reste identique après recréation du service', () => {
    const { storage, wallet, settlement } = setup()
    const roundId = 'aviator_round_reload_001'
    debitStake(wallet, roundId, 500)
    settlement.settle({
      game: 'aviator',
      roundId,
      userId: USER,
      stake: 500,
      payout: 800,
      outcome: 'cashout',
      settledAt: '2026-01-01T12:04:00.000Z',
    })

    const reloadedWallet = createWalletService({ storage, initialBalance: 50_000 })
    const reloaded = createGameSettlementService({ storage, wallet: reloadedWallet })
    const stored = reloaded.get('aviator', roundId)
    expect(stored?.payout).toBe(800)
    expect(stored?.pnl).toBe(300)
    expect(reloadedWallet.getBalance(USER)).toBe(50_300)
  })
})

describe('règlement commun — Tic-Tac-Toe gratuit et avec mise', () => {
  it('ne crée aucune écriture de ledger pour une partie gratuite', () => {
    const { wallet, settlement, notifications } = setup()
    const result = settlement.settle({
      game: 'tic_tac_toe',
      roundId: 'ttt_game_free_001',
      userId: USER,
      stake: 0,
      payout: 0,
      outcome: 'win',
    })

    expect(result.ledgerMovementId).toBeNull()
    expect(wallet.getMovements(USER)).toHaveLength(1)
    expect(wallet.getBalance(USER)).toBe(50_000)
    expect(notifications.list(USER)[0].type).toBe('game_result')
  })

  it('crédite une victoire selon la cote convenue', () => {
    const { wallet, settlement, notifications } = setup()
    const roundId = 'ttt_game_paid_win_001'
    wallet.debit({
      userId: USER,
      type: 'game_stake',
      amount: 100,
      currency: wallet.currency,
      source: 'tic_tac_toe',
      reference: `tic_tac_toe:stake:${roundId}`,
      idempotencyKey: `tic_tac_toe:stake:${roundId}`,
    })

    const result = settlement.settle({
      game: 'tic_tac_toe',
      roundId,
      userId: USER,
      stake: 100,
      payout: 300,
      outcome: 'win',
      metadata: { multiplier: 3 },
    })

    expect(result.pnl).toBe(200)
    expect(wallet.getBalance(USER)).toBe(50_200)
    expect(wallet.getMovements(USER).at(-1)?.type).toBe('game_win')
    expect(notifications.list(USER)[0].type).toBe('game_win')
  })

  it('rembourse la mise en cas de match nul', () => {
    const { wallet, settlement } = setup()
    const roundId = 'ttt_game_paid_draw_001'
    wallet.debit({
      userId: USER,
      type: 'game_stake',
      amount: 250,
      currency: wallet.currency,
      source: 'tic_tac_toe',
      reference: `tic_tac_toe:stake:${roundId}`,
      idempotencyKey: `tic_tac_toe:stake:${roundId}`,
    })

    const result = settlement.settle({
      game: 'tic_tac_toe',
      roundId,
      userId: USER,
      stake: 250,
      payout: 250,
      outcome: 'draw',
      metadata: { multiplier: 2 },
    })

    expect(result.pnl).toBe(0)
    expect(wallet.getBalance(USER)).toBe(50_000)
  })

  it('refuse un gain incohérent avec la cote', () => {
    const { settlement } = setup()
    expect(() =>
      settlement.settle({
        game: 'tic_tac_toe',
        roundId: 'ttt_game_paid_cheat_001',
        userId: USER,
        stake: 100,
        payout: 9_999,
        outcome: 'win',
        metadata: { multiplier: 2 },
      }),
    ).toThrow(ValidationError)
  })
})
