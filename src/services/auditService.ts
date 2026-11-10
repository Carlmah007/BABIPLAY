import { ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  assertNonEmptyString,
  validateAuditAction,
  validateAuditTargetType,
  validateId,
  validateJustification,
  validateRole,
} from '../lib/validation'
import type { AuditLog } from '../types/admin'
import type { Role } from '../types/auth'

const AUDIT_KEY = 'admin:audit'
const MAX_AUDIT_ENTRIES = 5_000

export type AuditMetadata = Record<string, string | number | boolean | null>

export interface AuditInput {
  actorId: string
  actorRole: Role | 'system'
  action: AuditLog['action']
  targetType: AuditLog['targetType']
  targetId: string
  justification: string
  metadata?: AuditMetadata
  createdAt?: string
}

export interface AuditServiceOptions {
  storage?: StorageAdapter
  now?: () => string
}

export interface AuditService {
  record: (input: AuditInput) => AuditLog
  list: () => AuditLog[]
  listByTarget: (targetType: AuditLog['targetType'], targetId: string) => AuditLog[]
  listByActor: (actorId: string) => AuditLog[]
  subscribe: (listener: () => void) => () => void
}

function loadLogs(adapter: StorageAdapter): AuditLog[] {
  const stored = adapter.get<unknown>(AUDIT_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter((entry): entry is AuditLog => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Partial<AuditLog>
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.actorId === 'string' &&
      typeof candidate.actorRole === 'string' &&
      typeof candidate.action === 'string' &&
      typeof candidate.targetType === 'string' &&
      typeof candidate.targetId === 'string' &&
      typeof candidate.justification === 'string' &&
      typeof candidate.createdAt === 'string'
    )
  })
}

function saveLogs(adapter: StorageAdapter, logs: AuditLog[]): void {
  adapter.set(AUDIT_KEY, logs)
}

function validateActorRole(value: unknown): Role | 'system' {
  if (value === 'system') return 'system'
  return validateRole(value)
}

/**
 * Journal d'audit append-only : l'API n'expose ni modification ni suppression.
 * Chaque entrée est figée pour empêcher toute altération accidentelle.
 */
export function createAuditService(options: AuditServiceOptions = {}): AuditService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const record = (input: AuditInput): AuditLog => {
    const actorId = validateId(input.actorId, "Identifiant de l'acteur")
    const actorRole = validateActorRole(input.actorRole)
    const action = validateAuditAction(input.action)
    const targetType = validateAuditTargetType(input.targetType)
    const targetId = assertNonEmptyString(input.targetId, 'Identifiant de la cible', {
      min: 2,
      max: 150,
    })
    const justification = validateJustification(input.justification)
    const createdAt = input.createdAt ?? now()
    if (Number.isNaN(Date.parse(createdAt))) {
      throw new ValidationError("La date d'audit est invalide.")
    }

    const entry: AuditLog = Object.freeze({
      id: createId('aud'),
      actorId,
      actorRole,
      action,
      targetType,
      targetId,
      justification,
      createdAt,
      metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    })

    const logs = loadLogs(adapter)
    const next = [entry, ...logs].slice(0, MAX_AUDIT_ENTRIES)
    saveLogs(adapter, next)
    emit()
    return entry
  }

  const list = (): AuditLog[] =>
    [...loadLogs(adapter)].sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return {
    record,
    list,
    listByTarget: (targetType, targetId) =>
      list().filter((entry) => entry.targetType === targetType && entry.targetId === targetId),
    listByActor: (actorId) => list().filter((entry) => entry.actorId === actorId),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const auditService = createAuditService()
