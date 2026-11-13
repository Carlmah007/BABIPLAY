import { describe, expect, it } from 'vitest'
import { createAuthService } from '../../services/authService'
import { createReferralService } from '../../services/referralService'
import { createRoleEmailService } from '../../services/roleEmailService'
import { MemoryStorageAdapter } from '../../lib/storage'

function makeServices() {
  const storage = new MemoryStorageAdapter()
  const roleEmails = createRoleEmailService({ storage })
  const referrals = createReferralService({ storage, now: () => '2026-01-05T00:00:00.000Z' })
  const auth = createAuthService({ storage, roleEmails, referrals })
  return { storage, roleEmails, referrals, auth }
}

const ADMIN_REGISTER = {
  displayName: 'Admin Principal',
  email: 'chef@babiplay.local',
  password: 'motdepasse1',
}

describe('rôles attribués par e-mail', () => {
  it('attribue automatiquement le rôle listé à l inscription', async () => {
    const { roleEmails, auth } = makeServices()
    roleEmails.set('chef@babiplay.local', 'super_admin')
    roleEmails.set('modo@babiplay.local', 'moderator')
    roleEmails.set('boss@babiplay.local', 'admin')

    const session = await auth.register({
      displayName: 'Chef',
      email: 'chef@babiplay.local',
      password: 'motdepasse1',
    })
    expect(session.user.role).toBe('super_admin')

    const modo = await auth.register({
      displayName: 'Modo',
      email: 'MODO@babiplay.local',
      password: 'motdepasse1',
    })
    expect(modo.user.role).toBe('moderator')
  })

  it('laisse les e-mails inconnus en joueur', async () => {
    const { auth } = makeServices()
    const session = await auth.register({
      displayName: 'Quidam',
      email: 'quidam@exemple.com',
      password: 'motdepasse1',
    })
    expect(session.user.role).toBe('player')
  })

  it('refuse d attribuer le rôle joueur via la table', () => {
    const { roleEmails } = makeServices()
    expect(() => roleEmails.set('x@exemple.com', 'player')).toThrow()
  })
})

describe('liens d affiliation', () => {
  it('génère un code stable et une URL partageable', () => {
    const { referrals, auth } = makeServices()
    const code = referrals.codeFor('usr-123')
    expect(code).toMatch(/^ref-[0-9a-f]{8}$/)
    expect(referrals.codeFor('usr-123')).toBe(code)
    expect(referrals.linkFor(code)).toContain('#/register?ref=')
    expect(auth).toBeDefined()
  })

  it('compte l inscription via le lien du parrain', async () => {
    const { referrals, auth } = makeServices()
    const adminSession = await auth.register(ADMIN_REGISTER)
    const promoted = auth.setAccountRole(adminSession.user.id, 'super_admin')
    const code = referrals.ensureSponsor(promoted)

    const filled = await auth.register({
      displayName: 'Filleul',
      email: 'filleul@exemple.com',
      password: 'motdepasse1',
      referredByCode: code,
    })
    const list = referrals.listFor(adminSession.user.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      userId: filled.user.id,
      email: 'filleul@exemple.com',
    })
  })

  it('ignore un code inconnu et refuse les doublons', async () => {
    const { referrals, auth } = makeServices()
    const adminSession = await auth.register(ADMIN_REGISTER)
    const promoted = auth.setAccountRole(adminSession.user.id, 'super_admin')
    const code = referrals.ensureSponsor(promoted)

    await auth.register({
      displayName: 'Alpha',
      email: 'a@exemple.com',
      password: 'motdepasse1',
      referredByCode: 'ref-inconnu',
    })
    expect(referrals.listAll()).toHaveLength(0)

    await auth.register({
      displayName: 'Beta',
      email: 'b@exemple.com',
      password: 'motdepasse1',
      referredByCode: code,
    })
    await auth.register({
      displayName: 'Gamma',
      email: 'c@exemple.com',
      password: 'motdepasse1',
      referredByCode: code,
    })
    expect(referrals.listAll()).toHaveLength(2)
  })
})
