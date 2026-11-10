import { describe, expect, it } from 'vitest'
import { MemoryStorageAdapter } from '../../lib/storage'
import { createWalletService } from '../../services/walletService'
import { createPaymentService, PAYMENT_RULES } from '../../services/paymentService'
import { createNotificationService } from '../../services/notificationService'
import { createAuditService } from '../../services/auditService'
import { ConflictError, PermissionError, ValidationError } from '../../lib/errors'
import type { AppUser, Role } from '../../types/auth'

const PLAYER = makeUser('demo-player', 'player')
const MODERATOR = makeUser('demo-moderator', 'moderator')
const ADMIN = makeUser('demo-manager', 'admin')
const SUPER_ADMIN = makeUser('demo-admin', 'super_admin')

function makeUser(id: string, role: Role): AppUser {
  return {
    id,
    email: `${id}@babiplay.local`,
    displayName: id,
    role,
    status: 'active',
    demo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function setup() {
  const storage = new MemoryStorageAdapter()
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0, tick++)).toISOString()
  const wallet = createWalletService({ storage, now, initialBalance: 50_000 })
  const notifications = createNotificationService({ storage, now })
  const audit = createAuditService({ storage, now })
  const payments = createPaymentService({ storage, now, wallet, notifications, audit })
  wallet.ensureInitialBalance(PLAYER.id)
  return { storage, wallet, notifications, audit, payments }
}

function withdrawInput(amount: number, key: string) {
  return {
    amount,
    destination: 'FR76 3000 6000 0112 3456',
    method: 'bank_transfer' as const,
    conditionsAccepted: true,
    idempotencyKey: key,
  }
}

describe('paiements — dépôts de démonstration', () => {
  it('crédite instantanément, trace la notification et l’audit', () => {
    const { wallet, payments, notifications, audit } = setup()
    const intent = payments.requestDeposit(PLAYER, {
      amount: 1_000,
      idempotencyKey: 'deposit:test:0001',
    })

    expect(intent.status).toBe('confirmed')
    expect(intent.netAmount).toBe(1_000)
    expect(wallet.getBalance(PLAYER.id)).toBe(51_000)
    expect(notifications.list(PLAYER.id)[0].type).toBe('deposit')
    expect(audit.list()[0].action).toBe('payment_deposit')
  })

  it('est idempotent sur la même clé', () => {
    const { wallet, payments } = setup()
    const first = payments.requestDeposit(PLAYER, {
      amount: 1_000,
      idempotencyKey: 'deposit:test:0002',
    })
    const second = payments.requestDeposit(PLAYER, {
      amount: 1_000,
      idempotencyKey: 'deposit:test:0002',
    })
    expect(second.id).toBe(first.id)
    expect(wallet.getBalance(PLAYER.id)).toBe(51_000)
    expect(payments.list(PLAYER.id)).toHaveLength(1)
  })

  it('refuse un dépôt sous le minimum', () => {
    const { payments } = setup()
    expect(() =>
      payments.requestDeposit(PLAYER, {
        amount: PAYMENT_RULES.minDeposit - 1,
        idempotencyKey: 'deposit:test:0003',
      }),
    ).toThrow(ValidationError)
  })
})

describe('paiements — retraits avec réservation et validation', () => {
  it('réserve le montant sans débiter le ledger', () => {
    const { wallet, payments } = setup()
    const intent = payments.requestWithdrawal(PLAYER, withdrawInput(5_000, 'withdraw:test:0001'))

    expect(intent.status).toBe('pending')
    expect(payments.reservedAmount(PLAYER.id)).toBe(5_000)
    expect(payments.availableToWithdraw(PLAYER.id)).toBe(45_000)
    expect(wallet.getBalance(PLAYER.id)).toBe(50_000)
    expect(payments.listPendingWithdrawals()).toHaveLength(1)
  })

  it('débite une seule fois après validation Super Admin', () => {
    const { wallet, payments } = setup()
    const intent = payments.requestWithdrawal(PLAYER, withdrawInput(5_000, 'withdraw:test:0002'))
    const approved = payments.approveWithdrawal(
      SUPER_ADMIN,
      intent.id,
      'Contrôle KYC effectué, compte bénéficiaire vérifié.',
    )

    expect(approved.status).toBe('confirmed')
    expect(wallet.getBalance(PLAYER.id)).toBe(45_000)
    expect(payments.reservedAmount(PLAYER.id)).toBe(0)
    expect(payments.listPendingWithdrawals()).toHaveLength(0)
    expect(wallet.getMovements(PLAYER.id).at(-1)?.type).toBe('withdrawal')

    expect(() =>
      payments.approveWithdrawal(SUPER_ADMIN, intent.id, 'Seconde validation interdite.'),
    ).toThrow(ConflictError)
    expect(wallet.getBalance(PLAYER.id)).toBe(45_000)
  })

  it('refuse la validation par un joueur ou un admin non habilité', () => {
    const { payments } = setup()
    const intent = payments.requestWithdrawal(PLAYER, withdrawInput(1_000, 'withdraw:test:0003'))
    expect(() =>
      payments.approveWithdrawal(PLAYER, intent.id, 'Je valide mon propre retrait.'),
    ).toThrow(PermissionError)
    expect(() =>
      payments.approveWithdrawal(ADMIN, intent.id, 'Validation administrateur sans permission.'),
    ).toThrow(PermissionError)
    expect(() =>
      payments.approveWithdrawal(MODERATOR, intent.id, 'Validation modérateur interdite.'),
    ).toThrow(PermissionError)
  })

  it('interdit au Super Admin de valider son propre retrait', () => {
    const { wallet, payments } = setup()
    wallet.ensureInitialBalance(SUPER_ADMIN.id)
    const intent = payments.requestWithdrawal(
      SUPER_ADMIN,
      withdrawInput(1_000, 'withdraw:test:self1'),
    )
    expect(() =>
      payments.approveWithdrawal(SUPER_ADMIN, intent.id, 'Auto-validation interdite par principe.'),
    ).toThrow(PermissionError)
  })

  it('libère la réservation lors d’un refus', () => {
    const { wallet, payments } = setup()
    const intent = payments.requestWithdrawal(PLAYER, withdrawInput(2_000, 'withdraw:test:0004'))
    const rejected = payments.rejectWithdrawal(
      SUPER_ADMIN,
      intent.id,
      'Compte bénéficiaire non conforme au KYC.',
    )
    expect(rejected.status).toBe('cancelled')
    expect(payments.reservedAmount(PLAYER.id)).toBe(0)
    expect(wallet.getBalance(PLAYER.id)).toBe(50_000)
    expect(payments.availableToWithdraw(PLAYER.id)).toBe(50_000)
  })

  it('permet au joueur d’annuler sa demande en attente', () => {
    const { payments } = setup()
    const intent = payments.requestWithdrawal(PLAYER, withdrawInput(2_000, 'withdraw:test:0005'))
    const cancelled = payments.cancelWithdrawal(PLAYER, intent.id)
    expect(cancelled.status).toBe('cancelled')
    expect(payments.reservedAmount(PLAYER.id)).toBe(0)
  })

  it('refuse une seconde demande simultanée et le dépassement du disponible', () => {
    const { payments } = setup()
    payments.requestWithdrawal(PLAYER, withdrawInput(1_000, 'withdraw:test:0006'))
    expect(() =>
      payments.requestWithdrawal(PLAYER, withdrawInput(1_000, 'withdraw:test:0007')),
    ).toThrow(ConflictError)

    const pending = payments.listPendingWithdrawals()[0]
    expect(pending).toBeTruthy()
    payments.cancelWithdrawal(PLAYER, pending.id)
    expect(() =>
      payments.requestWithdrawal(PLAYER, withdrawInput(60_000, 'withdraw:test:0008')),
    ).toThrow(ValidationError)
  })

  it('exige les conditions de retrait (KYC)', () => {
    const { payments } = setup()
    expect(() =>
      payments.requestWithdrawal(PLAYER, {
        ...withdrawInput(1_000, 'withdraw:test:0009'),
        conditionsAccepted: false,
      }),
    ).toThrow(ValidationError)
  })
})
