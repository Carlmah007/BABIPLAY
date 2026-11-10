import { describe, expect, it } from 'vitest'
import { createAuthService } from '../../services/authService'
import { createWalletService } from '../../services/walletService'
import { MemoryStorageAdapter } from '../../lib/storage'
import { PermissionError, ValidationError } from '../../lib/errors'
import {
  canAccessAdmin,
  canAccessAdminPanel,
  canAdjustBalance,
  canAssignRole,
  canManagePayments,
  canManageUsers,
  canViewLedger,
  hasPermission,
} from '../../lib/permissions'
import type { Role } from '../../types/auth'

function setup() {
  const storage = new MemoryStorageAdapter()
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0, tick++)).toISOString()
  const auth = createAuthService({ storage, now })
  return { storage, auth }
}

function setupAll() {
  const context = setup()
  const wallet = createWalletService({ storage: context.storage, initialBalance: 50_000 })
  return { ...context, wallet }
}

describe('authentification — comptes de démonstration', () => {
  it('crée une session joueur démo', () => {
    const { auth } = setup()
    const session = auth.createDemoSession('player')
    expect(session.user.id).toBe('demo-player')
    expect(session.user.role).toBe('player')
    expect(session.user.demo).toBe(true)
    expect(session.user.status).toBe('active')
    expect(session.token).toMatch(/^sess_/)
  })

  it('crée une session Super Admin démo', () => {
    const { auth } = setup()
    const session = auth.createDemoSession('super_admin')
    expect(session.user.id).toBe('demo-admin')
    expect(session.user.role).toBe('super_admin')
    expect(canAccessAdmin(session.user)).toBe(true)
  })

  it('le joueur démo n’a pas les permissions administratives', () => {
    const { auth } = setup()
    const user = auth.createDemoSession('player').user
    expect(canAccessAdmin(user)).toBe(false)
    expect(canManageUsers(user)).toBe(false)
    expect(canViewLedger(user)).toBe(false)
    expect(canAdjustBalance(user)).toBe(false)
    expect(hasPermission(user, 'users.read')).toBe(false)
    expect(hasPermission(user, 'view_dashboard')).toBe(true)
  })

  it('les permissions suivent le rôle', () => {
    const { auth } = setup()
    const player = auth.createDemoSession('player').user
    const admin = auth.createDemoSession('super_admin').user

    expect(canManageUsers(admin)).toBe(true)
    expect(canViewLedger(admin)).toBe(true)
    expect(canAdjustBalance(admin)).toBe(true)
    expect(canAdjustBalance(player)).toBe(false)
  })

  it('expose un compte modérateur et un compte admin de démonstration', () => {
    const { auth } = setup()
    const moderator = auth.createDemoSession('moderator').user
    const admin = auth.createDemoSession('admin').user

    expect(moderator.role).toBe('moderator')
    expect(admin.role).toBe('admin')
    expect(canAccessAdminPanel(moderator)).toBe(true)
    expect(canAccessAdminPanel(admin)).toBe(true)
    expect(canAccessAdmin(moderator)).toBe(false)
    expect(canAccessAdmin(admin)).toBe(true)
    expect(canManagePayments(moderator)).toBe(false)
    expect(canManagePayments(admin)).toBe(false)
    expect(canManagePayments(auth.createDemoSession('super_admin').user)).toBe(true)
  })

  it('empêche les élévations de privilèges non autorisées', () => {
    const { auth } = setup()
    const moderator = auth.createDemoSession('moderator').user
    const admin = auth.createDemoSession('admin').user
    const superAdmin = auth.createDemoSession('super_admin').user

    expect(canAssignRole(moderator, 'player')).toBe(false)
    expect(canAssignRole(admin, 'player')).toBe(true)
    expect(canAssignRole(admin, 'moderator')).toBe(true)
    expect(canAssignRole(admin, 'admin')).toBe(false)
    expect(canAssignRole(admin, 'super_admin')).toBe(false)
    expect(canAssignRole(superAdmin, 'admin')).toBe(true)
  })
})

describe('authentification — inscription', () => {
  it('inscrit un nouvel utilisateur avec un mot de passe haché', async () => {
    const { auth, storage } = setup()
    const session = await auth.register({
      displayName: 'Alice Test',
      email: 'Alice@Example.com',
      password: 'Secret123',
    })

    expect(session.user.email).toBe('alice@example.com')
    expect(session.user.displayName).toBe('Alice Test')
    expect(session.user.role).toBe('player')
    expect(session.user.demo).toBe(false)
    expect(session.token).toMatch(/^sess_/)

    const stored = storage.get<Array<Record<string, unknown>>>('auth:users') ?? []
    const account = stored.find((candidate) => candidate.email === 'alice@example.com')
    expect(account).toBeTruthy()
    expect(account?.passwordHash).not.toBe('Secret123')
    expect(String(account?.passwordHash)).toHaveLength(44)
    expect(account?.salt).toBeTruthy()
  })

  it('refuse un e-mail déjà utilisé', async () => {
    const { auth } = setup()
    await auth.register({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123',
    })

    await expect(
      auth.register({ displayName: 'Alice 2', email: 'ALICE@example.com', password: 'Autre1234' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuse un mot de passe faible', async () => {
    const { auth } = setup()
    await expect(
      auth.register({ displayName: 'Bob', email: 'bob@example.com', password: 'short' }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      auth.register({ displayName: 'Bob', email: 'bob@example.com', password: 'onlyletters' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuse un e-mail invalide', async () => {
    const { auth } = setup()
    await expect(
      auth.register({ displayName: 'Bob', email: 'invalid', password: 'Secret123' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('authentification — connexion', () => {
  it('connecte avec le bon mot de passe', async () => {
    const { auth } = setup()
    await auth.register({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123',
    })

    const session = await auth.login('alice@example.com', 'Secret123')
    expect(session.user.email).toBe('alice@example.com')
    expect(session.user.role).toBe('player')
  })

  it('refuse un mauvais mot de passe avec un message générique', async () => {
    const { auth } = setup()
    await auth.register({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123',
    })

    await expect(auth.login('alice@example.com', 'Wrong123')).rejects.toThrow(
      'E-mail ou mot de passe incorrect.',
    )
  })

  it('refuse un e-mail inconnu avec le même message', async () => {
    const { auth } = setup()
    await expect(auth.login('ghost@example.com', 'Secret123')).rejects.toThrow(
      'E-mail ou mot de passe incorrect.',
    )
  })

  it('refuse la connexion des comptes démo sans mot de passe', async () => {
    const { auth } = setup()
    await expect(auth.login('demo@babiplay.local', 'Secret123')).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('authentification — suspension et session', () => {
  it('suspend un compte et refuse la connexion', async () => {
    const { auth } = setup()
    await auth.register({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123',
    })
    const account = auth.listUsers().find((user) => user.email === 'alice@example.com')
    expect(account).toBeTruthy()

    const suspended = auth.setAccountStatus(account!.id, 'suspended')
    expect(suspended.status).toBe('suspended')

    await expect(auth.login('alice@example.com', 'Secret123')).rejects.toBeInstanceOf(
      PermissionError,
    )
  })

  it('réactive un compte suspendu', async () => {
    const { auth } = setup()
    const account = auth.listUsers().find((user) => user.id === 'demo-player')!
    auth.setAccountStatus(account.id, 'suspended')
    expect(() => auth.createDemoSession('player')).toThrow(PermissionError)

    auth.setAccountStatus(account.id, 'active')
    expect(auth.createDemoSession('player').user.id).toBe('demo-player')
  })

  it('refreshSession renvoie l’utilisateur à jour', async () => {
    const { auth } = setup()
    const session = await auth.register({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123',
    })

    auth.setAccountRole(session.user.id, 'moderator')
    const refreshed = auth.refreshSession(session)
    expect(refreshed).not.toBeNull()
    expect(refreshed?.user.role).toBe('moderator')
    expect(refreshed?.token).toBe(session.token)
  })

  it('refreshSession renvoie null pour un compte suspendu', () => {
    const { auth } = setup()
    const session = auth.createDemoSession('player')
    auth.setAccountStatus(session.user.id, 'suspended')
    expect(auth.refreshSession(session)).toBeNull()
  })

  it('refreshSession renvoie null pour un utilisateur inconnu', () => {
    const { auth } = setup()
    const session = auth.createDemoSession('player')
    expect(auth.refreshSession({ ...session, userId: 'ghost-user' })).toBeNull()
  })

  it('change le rôle avec une valeur valide uniquement', () => {
    const { auth } = setup()
    const updated = auth.setAccountRole('demo-player', 'admin')
    expect(updated.role).toBe('admin')
    expect(() => auth.setAccountRole('demo-player', 'god' as Role)).toThrow(ValidationError)
    expect(() => auth.setAccountStatus('demo-player', 'frozen' as 'active')).toThrow(
      ValidationError,
    )
  })
})

describe('authentification — isolation des portefeuilles', () => {
  it('sépare le ledger du joueur et de l’admin démo', async () => {
    const { auth, wallet } = setupAll()
    const player = auth.createDemoSession('player').user
    const admin = auth.createDemoSession('super_admin').user

    wallet.ensureInitialBalance(player.id)
    wallet.ensureInitialBalance(admin.id)

    wallet.apply({
      userId: player.id,
      type: 'game_stake',
      direction: 'debit',
      amount: 1_000,
      currency: 'BABI',
      source: 'aviator',
      reference: 'ref-isolation-player',
      idempotencyKey: 'aviator:stake:isolation-player',
    })

    expect(wallet.getBalance(player.id)).toBe(49_000)
    expect(wallet.getBalance(admin.id)).toBe(50_000)
    expect(wallet.getMovements(player.id)).toHaveLength(2)
    expect(wallet.getMovements(admin.id)).toHaveLength(1)
  })

  it('sépare les comptes locaux inscrits', async () => {
    const { auth, wallet } = setupAll()
    const alice = await auth.register({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Secret123',
    })
    const bob = await auth.register({
      displayName: 'Bob',
      email: 'bob@example.com',
      password: 'Secret123',
    })

    expect(alice.user.id).not.toBe(bob.user.id)
    wallet.ensureInitialBalance(alice.user.id)
    wallet.ensureInitialBalance(bob.user.id)

    wallet.credit({
      userId: alice.user.id,
      type: 'game_win',
      amount: 2_000,
      currency: 'BABI',
      source: 'aviator',
      reference: 'ref-alice-win',
      idempotencyKey: 'aviator:win:alice',
      metadata: { pnl: 2_000 },
    })

    expect(wallet.getBalance(alice.user.id)).toBe(52_000)
    expect(wallet.getBalance(bob.user.id)).toBe(50_000)
  })
})
