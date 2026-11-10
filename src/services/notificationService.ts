import { PermissionError, ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  assertNonEmptyString,
  validateId,
  validateNotificationPriority,
  validateNotificationType,
} from '../lib/validation'
import type {
  AppNotification,
  NotificationPriority,
  NotificationType,
} from '../types/notifications'

const NOTIFICATIONS_KEY = 'notifications:items'
const MAX_NOTIFICATIONS_PER_USER = 500

export type NotificationMetadata = Record<string, string | number | boolean | null>

export interface NotificationInput {
  /** Identifiant optionnel : permet à un appelant de rester idempotent. */
  id?: string
  userId: string
  type: NotificationType
  title: string
  message: string
  priority?: NotificationPriority
  createdAt?: string
  metadata?: NotificationMetadata
}

export interface NotificationServiceOptions {
  storage?: StorageAdapter
  now?: () => string
}

export interface NotificationService {
  add: (input: NotificationInput) => AppNotification
  get: (notificationId: string) => AppNotification | null
  list: (userId: string) => AppNotification[]
  unread: (userId: string) => AppNotification[]
  unreadCount: (userId: string) => number
  markRead: (notificationId: string, userId: string) => AppNotification
  markAllRead: (userId: string) => number
  subscribe: (listener: () => void) => () => void
}

function loadNotifications(adapter: StorageAdapter): AppNotification[] {
  const stored = adapter.get<unknown>(NOTIFICATIONS_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter((entry): entry is AppNotification => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Partial<AppNotification>
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.userId === 'string' &&
      typeof candidate.type === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.message === 'string' &&
      typeof candidate.read === 'boolean' &&
      typeof candidate.priority === 'string' &&
      typeof candidate.createdAt === 'string'
    )
  })
}

function saveNotifications(adapter: StorageAdapter, notifications: AppNotification[]): void {
  adapter.set(NOTIFICATIONS_KEY, notifications)
}

/** Centre de notifications local, limité aux données de démonstration. */
export function createNotificationService(
  options: NotificationServiceOptions = {},
): NotificationService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const add = (input: NotificationInput): AppNotification => {
    const userId = validateId(input.userId, 'Identifiant utilisateur')
    const type = validateNotificationType(input.type)
    const priority = validateNotificationPriority(input.priority ?? 'normal')
    const title = assertNonEmptyString(input.title, 'Le titre', { min: 2, max: 120 })
    const message = assertNonEmptyString(input.message, 'Le message', { min: 2, max: 500 })
    const createdAt = input.createdAt ?? now()
    if (Number.isNaN(Date.parse(createdAt))) {
      throw new ValidationError('La date de notification est invalide.')
    }

    const notifications = loadNotifications(adapter)
    const id = input.id !== undefined ? validateId(input.id, 'Identifiant de notification') : createId('ntf')
    const existing = notifications.find((notification) => notification.id === id)
    if (existing) {
      if (existing.userId !== userId) {
        throw new ValidationError('Cet identifiant de notification est déjà utilisé.')
      }
      return existing
    }

    const notification: AppNotification = Object.freeze({
      id,
      userId,
      type,
      title,
      message,
      read: false,
      priority,
      createdAt,
      metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    })

    const next = [notification, ...notifications]
    const perUserCounts = new Map<string, number>()
    const trimmed = next.filter((entry) => {
      const count = perUserCounts.get(entry.userId) ?? 0
      if (count >= MAX_NOTIFICATIONS_PER_USER) return false
      perUserCounts.set(entry.userId, count + 1)
      return true
    })

    saveNotifications(adapter, trimmed)
    emit()
    return notification
  }

  const get = (notificationId: string): AppNotification | null => {
    if (typeof notificationId !== 'string' || !notificationId) return null
    return loadNotifications(adapter).find((entry) => entry.id === notificationId) ?? null
  }

  const list = (userId: string): AppNotification[] => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    return loadNotifications(adapter)
      .filter((notification) => notification.userId === validUserId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  const unread = (userId: string): AppNotification[] =>
    list(userId).filter((notification) => !notification.read)

  const unreadCount = (userId: string): number => unread(userId).length

  const markRead = (notificationId: string, userId: string): AppNotification => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    const notifications = loadNotifications(adapter)
    const index = notifications.findIndex((entry) => entry.id === notificationId)
    if (index < 0) throw new ValidationError('Notification introuvable.')
    if (notifications[index].userId !== validUserId) {
      throw new PermissionError("Cette notification n'appartient pas à ce compte.")
    }
    if (notifications[index].read) return notifications[index]
    const updated: AppNotification = Object.freeze({ ...notifications[index], read: true })
    const next = [...notifications]
    next[index] = updated
    saveNotifications(adapter, next)
    emit()
    return updated
  }

  const markAllRead = (userId: string): number => {
    const validUserId = validateId(userId, 'Identifiant utilisateur')
    const notifications = loadNotifications(adapter)
    let changed = 0
    const next = notifications.map((notification) => {
      if (notification.userId !== validUserId || notification.read) return notification
      changed += 1
      return Object.freeze({ ...notification, read: true })
    })
    if (changed > 0) {
      saveNotifications(adapter, next)
      emit()
    }
    return changed
  }

  return {
    add,
    get,
    list,
    unread,
    unreadCount,
    markRead,
    markAllRead,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const notificationService = createNotificationService()
