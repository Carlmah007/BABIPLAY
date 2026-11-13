import { ValidationError } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { sha256Hex } from '../lib/sha256'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import type { AppUser } from '../types/auth'

const CODES_KEY = 'referral:codes'
const RECORDS_KEY = 'referral:records'

/** Code d'affiliation : « ref- » + 8 caractères hex dérivés de l'identifiant. */
export type ReferralCode = string

export interface ReferralRecord {
  id: string
  /** L'admin parrain. */
  adminId: string
  adminEmail: string
  /** Le joueur filleul. */
  userId: string
  email: string
  displayName: string
  createdAt: string
}

export interface ReferralService {
  /** Code stable pour un compte (dérivé de son identifiant). */
  codeFor: (userId: string) => ReferralCode
  /** URL complète à partager, à partir du code. */
  linkFor: (code: ReferralCode) => string
  /** Enregistre une inscription si le code correspond à un parrain connu. */
  recordIfCode: (code: string | undefined, referredUser: AppUser) => ReferralRecord | null
  listFor: (adminId: string) => ReferralRecord[]
  listAll: () => ReferralRecord[]
  /** Enregistre le code d'un parrain (admin/super_admin). */
  ensureSponsor: (user: AppUser) => ReferralCode
  subscribe: (listener: () => void) => () => void
}

interface CodeMap {
  [code: string]: { adminId: string; adminEmail: string }
}

export function createReferralService(options: {
  storage?: StorageAdapter
  now?: () => string
  origin?: string
} = {}): ReferralService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const loadCodes = (): CodeMap => {
    const stored = adapter.get<CodeMap>(CODES_KEY)
    if (!stored || typeof stored !== 'object') return {}
    return stored
  }

  const loadRecords = (): ReferralRecord[] => {
    const stored = adapter.get<ReferralRecord[]>(RECORDS_KEY)
    if (!Array.isArray(stored)) return []
    return stored.filter((record) => record && typeof record.adminId === 'string')
  }

  const codeFor = (userId: string): ReferralCode => {
    if (typeof userId !== 'string' || !userId) {
      throw new ValidationError('Identifiant invalide.')
    }
    return `ref-${sha256Hex(userId).slice(0, 8)}`
  }

  const ensureSponsor = (user: AppUser): ReferralCode => {
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      throw new ValidationError("Seuls les admins et super admins peuvent parrainer.")
    }
    const codes = loadCodes()
    const code = codeFor(user.id)
    if (!codes[code]) {
      codes[code] = { adminId: user.id, adminEmail: user.email }
      adapter.set(CODES_KEY, codes)
      emit()
    }
    return code
  }

  const linkFor = (code: ReferralCode): string => {
    const origin =
      options.origin ??
      (typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://babiplay.vercel.app/')
    return `${origin}#/${`register?ref=${encodeURIComponent(code)}`}`
  }

  const recordIfCode = (code: string | undefined, referredUser: AppUser): ReferralRecord | null => {
    if (!code || typeof code !== 'string') return null
    const codes = loadCodes()
    const sponsor = codes[code]
    if (!sponsor) return null
    if (sponsor.adminId === referredUser.id) return null

    const records = loadRecords()
    if (records.some((record) => record.userId === referredUser.id)) return null

    const record: ReferralRecord = {
      id: `parr-${sha256Hex(`${sponsor.adminId}:${referredUser.id}`).slice(0, 10)}`,
      adminId: sponsor.adminId,
      adminEmail: sponsor.adminEmail,
      userId: referredUser.id,
      email: referredUser.email,
      displayName: referredUser.displayName,
      createdAt: now(),
    }
    adapter.set(RECORDS_KEY, [...records, record])
    emit()
    return record
  }

  return {
    codeFor,
    linkFor,
    recordIfCode,
    ensureSponsor,
    listFor: (adminId) => loadRecords().filter((record) => record.adminId === adminId),
    listAll: () => loadRecords(),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const referralService = createReferralService()
