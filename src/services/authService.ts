import { APP_CONFIG } from '../config/appConfig'
import { PermissionError, ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  normalizeEmail,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '../lib/validation'
import { roleEmailService as defaultRoleEmails, createRoleEmailService } from './roleEmailService'
import { referralService as defaultReferrals, createReferralService } from './referralService'
import type { AccountStatus, AppUser, RegisterInput, Role, Session } from '../types/auth'

const USERS_KEY = 'auth:users'
const PASSWORD_ITERATIONS = 120_000

interface StoredAccount extends AppUser {
  passwordHash: string
  salt: string
}

export interface AuthServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  roleEmails?: typeof defaultRoleEmails
  referrals?: typeof defaultReferrals
}

export interface AuthService {
  listUsers: () => AppUser[]
  getUser: (userId: string) => AppUser | null
  register: (input: RegisterInput) => Promise<Session>
  login: (email: string, password: string) => Promise<Session>
  createDemoSession: (role: Role) => Session
  refreshSession: (session: Session) => Session | null
  setAccountStatus: (userId: string, status: AccountStatus) => AppUser
  setAccountRole: (userId: string, role: Role) => AppUser
  subscribe: (listener: () => void) => () => void
}

const SEED_CREATED_AT = '2026-01-01T00:00:00.000Z'

function seedAccounts(): StoredAccount[] {
  return [
    {
      id: 'demo-player',
      email: 'demo@babiplay.local',
      displayName: 'Joueur Démo',
      role: 'player',
      status: 'active',
      demo: true,
      createdAt: SEED_CREATED_AT,
      passwordHash: '',
      salt: '',
    },
    {
      id: 'demo-moderator',
      email: 'moderateur@babiplay.local',
      displayName: 'Modérateur Démo',
      role: 'moderator',
      status: 'active',
      demo: true,
      createdAt: SEED_CREATED_AT,
      passwordHash: '',
      salt: '',
    },
    {
      id: 'demo-manager',
      email: 'gestionnaire@babiplay.local',
      displayName: 'Admin Démo',
      role: 'admin',
      status: 'active',
      demo: true,
      createdAt: SEED_CREATED_AT,
      passwordHash: '',
      salt: '',
    },
    {
      id: 'demo-admin',
      email: 'admin@babiplay.local',
      displayName: 'Super Admin Démo',
      role: 'super_admin',
      status: 'active',
      demo: true,
      createdAt: SEED_CREATED_AT,
      passwordHash: '',
      salt: '',
    },
  ]
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}

async function derivePasswordHash(password: string, salt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new ValidationError(
      'Le hachage sécurisé est indisponible dans ce contexte. Ouvrez l’application via localhost en HTTPS.',
    )
  }
  const encoder = new TextEncoder()
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(salt),
      iterations: PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  return bytesToBase64(new Uint8Array(bits))
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') return false
  const account = value as Partial<StoredAccount>
  return (
    typeof account.id === 'string' &&
    typeof account.email === 'string' &&
    typeof account.displayName === 'string' &&
    typeof account.role === 'string' &&
    typeof account.status === 'string' &&
    typeof account.demo === 'boolean' &&
    typeof account.createdAt === 'string' &&
    typeof account.passwordHash === 'string' &&
    typeof account.salt === 'string'
  )
}

function toPublicUser(account: StoredAccount): AppUser {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    demo: account.demo,
    createdAt: account.createdAt,
  }
}

export function createAuthService(options: AuthServiceOptions = {}): AuthService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const roleEmails = options.roleEmails ??
    (options.storage ? createRoleEmailService({ storage: adapter }) : defaultRoleEmails)
  const referrals = options.referrals ??
    (options.storage ? createReferralService({ storage: adapter, now }) : defaultReferrals)
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const saveAccounts = (accounts: StoredAccount[]): void => {
    adapter.set(USERS_KEY, accounts)
  }

  const loadAccounts = (): StoredAccount[] => {
    const stored = adapter.get<unknown[]>(USERS_KEY)
    const accounts = Array.isArray(stored) ? stored.filter(isStoredAccount) : []
    let changed = false
    for (const seed of seedAccounts()) {
      if (!accounts.some((account) => account.id === seed.id)) {
        accounts.push(seed)
        changed = true
      }
    }
    if (changed || !Array.isArray(stored)) saveAccounts(accounts)
    return accounts
  }

  const findAccount = (userId: string): StoredAccount | null =>
    loadAccounts().find((account) => account.id === userId) ?? null

  const sessionFor = (account: StoredAccount): Session => ({
    token: createId('sess'),
    userId: account.id,
    createdAt: now(),
    user: toPublicUser(account),
  })

  const createDemoSession = (role: Role): Session => {
    const account = loadAccounts().find((candidate) => candidate.demo && candidate.role === role)
    if (!account) throw new ValidationError('Compte de démonstration introuvable.')
    if (account.status !== 'active') {
      throw new PermissionError('Ce compte de démonstration est suspendu.')
    }
    return sessionFor(account)
  }

  const register = async (input: RegisterInput): Promise<Session> => {
    const displayName = validateDisplayName(input.displayName)
    const email = validateEmail(input.email)
    validatePassword(input.password)

    const accounts = loadAccounts()
    if (accounts.some((account) => account.email === email)) {
      throw new ValidationError('Un compte existe déjà avec cette adresse e-mail.')
    }

    const salt = randomSalt()
    const passwordHash = await derivePasswordHash(input.password, salt)
    // Attribution de rôle par e-mail (table gérée par le Super Admin).
    const assignedRole = roleEmails.roleForEmail(email)
    const account: StoredAccount = {
      id: createId('usr'),
      email,
      displayName,
      role: assignedRole ?? 'player',
      status: 'active',
      demo: false,
      createdAt: now(),
      passwordHash,
      salt,
    }

    saveAccounts([...accounts, account])
    // Pré-enregistre les codes de parrainage des comptes administrateurs.
    for (const candidate of loadAccounts()) {
      if (candidate.role === 'admin' || candidate.role === 'super_admin') {
        try {
          referrals.ensureSponsor(toPublicUser(candidate))
        } catch {
          // Un admin sans code n'empêche jamais l'inscription.
        }
      }
    }
    referrals.recordIfCode(input.referredByCode, toPublicUser(account))
    emit()
    return sessionFor(account)
  }

  const login = async (emailInput: string, password: string): Promise<Session> => {
    const email = normalizeEmail(emailInput)
    const account = loadAccounts().find((candidate) => candidate.email === email)

    // Message générique : ne révèle pas l'existence du compte.
    if (!account || !account.passwordHash || !account.salt) {
      throw new ValidationError('E-mail ou mot de passe incorrect.')
    }

    const candidateHash = await derivePasswordHash(password, account.salt)
    if (candidateHash !== account.passwordHash) {
      throw new ValidationError('E-mail ou mot de passe incorrect.')
    }

    if (account.status !== 'active') {
      throw new PermissionError('Ce compte est suspendu. Contactez un administrateur.')
    }

    return sessionFor(account)
  }

  const refreshSession = (session: Session): Session | null => {
    const account = findAccount(session.userId)
    if (!account || account.status !== 'active') return null
    return { ...session, user: toPublicUser(account) }
  }

  const setAccountStatus = (userId: string, status: AccountStatus): AppUser => {
    if (status !== 'active' && status !== 'suspended') {
      throw new ValidationError('Statut de compte invalide.')
    }
    const accounts = loadAccounts()
    const index = accounts.findIndex((account) => account.id === userId)
    if (index < 0) throw new ValidationError('Utilisateur introuvable.')
    const next = { ...accounts[index], status }
    const copy = [...accounts]
    copy[index] = next
    saveAccounts(copy)
    emit()
    return toPublicUser(next)
  }

  const setAccountRole = (userId: string, role: Role): AppUser => {
    const allowed: readonly Role[] = ['player', 'moderator', 'admin', 'super_admin']
    if (!allowed.includes(role)) throw new ValidationError('Rôle invalide.')
    const accounts = loadAccounts()
    const index = accounts.findIndex((account) => account.id === userId)
    if (index < 0) throw new ValidationError('Utilisateur introuvable.')
    const next = { ...accounts[index], role }
    const copy = [...accounts]
    copy[index] = next
    saveAccounts(copy)
    emit()
    return toPublicUser(next)
  }

  return {
    listUsers: () => loadAccounts().map(toPublicUser),
    getUser: (userId) => {
      const account = findAccount(userId)
      return account ? toPublicUser(account) : null
    },
    register,
    login,
    createDemoSession,
    refreshSession,
    setAccountStatus,
    setAccountRole,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const authService = createAuthService()

export const DEMO_ACCOUNT_HINTS = {
  player: { email: 'demo@babiplay.local', label: 'Joueur Démo' },
  moderator: { email: 'moderateur@babiplay.local', label: 'Modérateur Démo' },
  admin: { email: 'gestionnaire@babiplay.local', label: 'Admin Démo' },
  super_admin: { email: 'admin@babiplay.local', label: 'Super Admin Démo' },
} as const

export const INITIAL_DEMO_BALANCE = APP_CONFIG.demoInitialBalance
