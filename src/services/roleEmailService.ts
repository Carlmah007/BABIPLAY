import { ValidationError } from '../lib/errors'
import { normalizeEmail } from '../lib/validation'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import type { Role } from '../types/auth'

const ROLE_EMAILS_KEY = 'role:emails'

export interface RoleEmailEntry {
  email: string
  role: Role
  createdAt: string
}

export interface RoleEmailService {
  list: () => RoleEmailEntry[]
  set: (email: string, role: Role) => RoleEmailEntry
  remove: (email: string) => void
  /** Renvoie le rôle attribué à cet email, ou null s'il n'est pas listé. */
  roleForEmail: (email: string) => Role | null
  subscribe: (listener: () => void) => () => void
}

const ASSIGNABLE: readonly Role[] = ['moderator', 'admin', 'super_admin']

/**
 * Attribution de rôle par adresse e-mail.
 *
 * À l'inscription, si l'e-mail figure dans cette table, le compte reçoit
 * directement le rôle correspondant au lieu de « player ». La table est
 * gérée par le Super Admin (permission roles.manage).
 *
 * Limite : en mode Supabase, les rôles viennent de la table `profiles`
 * (côté serveur). Cette table ne s'applique qu'au mode local de
 * démonstration et devra être rejouée via un trigger SQL côté Supabase.
 */
export function createRoleEmailService(options: {
  storage?: StorageAdapter
} = {}): RoleEmailService {
  const adapter = options.storage ?? defaultStorage
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const load = (): RoleEmailEntry[] => {
    const stored = adapter.get<RoleEmailEntry[]>(ROLE_EMAILS_KEY)
    if (!Array.isArray(stored)) return []
    return stored.filter(
      (entry) => entry && typeof entry.email === 'string' && typeof entry.role === 'string',
    )
  }

  const save = (entries: RoleEmailEntry[]): void => {
    adapter.set(ROLE_EMAILS_KEY, entries)
    emit()
  }

  return {
    list: () => load(),

    set: (emailInput, role) => {
      if (!ASSIGNABLE.includes(role)) {
        throw new ValidationError(
          'Seuls les rôles modérateur, admin et super admin peuvent être attribués par e-mail.',
        )
      }
      const email = normalizeEmail(emailInput)
      if (!email || !email.includes('@')) {
        throw new ValidationError('Adresse e-mail invalide.')
      }
      const entries = load()
      const existing = entries.find((entry) => entry.email === email)
      if (existing) {
        existing.role = role
        save(entries)
        return existing
      }
      const entry: RoleEmailEntry = { email, role, createdAt: new Date().toISOString() }
      save([...entries, entry])
      return entry
    },

    remove: (emailInput) => {
      const email = normalizeEmail(emailInput)
      save(load().filter((entry) => entry.email !== email))
    },

    roleForEmail: (emailInput) => {
      const email = normalizeEmail(emailInput)
      const entry = load().find((candidate) => candidate.email === email)
      return entry?.role ?? null
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const roleEmailService = createRoleEmailService()
