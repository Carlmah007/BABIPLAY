import { ConflictError, PermissionError, ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { hasPermission } from '../lib/permissions'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import {
  parseAmount,
  validateId,
  validateIdempotencyKey,
} from '../lib/validation'
import {
  auditService as defaultAuditService,
  createAuditService,
  type AuditService,
} from './auditService'
import {
  createNotificationService,
  notificationService as defaultNotificationService,
  type NotificationService,
} from './notificationService'
import {
  createWalletService,
  walletService as defaultWalletService,
  type WalletService,
} from './walletService'
import type { AppUser } from '../types/auth'
import type {
  MiningAdminOverview,
  MiningDatabase,
  MiningEvent,
  MiningEventType,
  MiningIncident,
  MiningMachine,
  MiningMachineModel,
  MiningMachineView,
  MiningSettings,
  MiningSettingsInput,
  MiningSnapshot,
  MiningUserState,
  MiningWithdrawal,
  MiningWithdrawalQuote,
} from '../types/mining'

const MINING_KEY = 'mining:database'
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const RUN_BEFORE_MAINTENANCE_MS = 6 * HOUR_MS
const MAINTENANCE_DURATION_MS = 10 * 60_000
const MAX_MACHINES_PER_USER = 6
const MAX_DAILY_DAYS = 30
const MAX_EVENTS = 5_000

/**
 * Catalogue virtuel. Les rendements sont volontairement simples : ils servent
 * uniquement à la simulation et ne représentent aucun revenu réel.
 */
export const MINING_MACHINE_MODELS: readonly MiningMachineModel[] = Object.freeze([
  Object.freeze({
    id: 'rtx-3060',
    name: 'NVIDIA RTX 3060',
    shortName: 'RTX 3060',
    tier: 'starter',
    power: 24,
    dailyYield: 3_000,
    dailyCost: 500,
    price: 2_500,
    starter: true,
    description: 'Pour débuter : 2 500 jetons investis, 5 000 gagnés en 2 jours.',
  }),
  Object.freeze({
    id: 'rtx-4070-ti',
    name: 'NVIDIA RTX 4070 Ti',
    shortName: 'RTX 4070 Ti',
    tier: 'advanced',
    power: 48,
    dailyYield: 12_000,
    dailyCost: 2_000,
    price: 10_000,
    starter: false,
    description: '10 000 jetons investis, 20 000 gagnés en 2 jours.',
  }),
  Object.freeze({
    id: 'rtx-4080-super',
    name: 'NVIDIA RTX 4080 Super',
    shortName: 'RTX 4080',
    tier: 'pro',
    power: 72,
    dailyYield: 21_000,
    dailyCost: 3_500,
    price: 15_000,
    starter: false,
    description: '15 000 jetons investis, 35 000 gagnés en 2 jours.',
  }),
  Object.freeze({
    id: 'rtx-4090',
    name: 'NVIDIA RTX 4090',
    shortName: 'RTX 4090',
    tier: 'elite',
    power: 96,
    dailyYield: 30_000,
    dailyCost: 5_000,
    price: 20_000,
    starter: false,
    description: '20 000 jetons investis, 50 000 gagnés en 2 jours.',
  }),
])

export const DEFAULT_CYCLE_HOURS = 12
export const DEFAULT_MIN_WITHDRAWAL = 10
export const DEFAULT_ANOMALY_THRESHOLD = 50_000

export interface MiningServiceOptions {
  storage?: StorageAdapter
  now?: () => string
  wallet?: WalletService
  notifications?: NotificationService
  audit?: AuditService
}

export interface MiningService {
  readonly models: readonly MiningMachineModel[]
  getSettings: () => MiningSettings
  updateSettings: (actor: AppUser, input: MiningSettingsInput) => MiningSettings
  getSnapshot: (userId: string) => MiningSnapshot
  getQuote: (userId: string) => MiningWithdrawalQuote
  startMining: (actor: AppUser) => MiningSnapshot
  stopMining: (actor: AppUser) => MiningSnapshot
  setMachineRunning: (actor: AppUser, machineId: string, running: boolean) => MiningSnapshot
  purchaseMachine: (actor: AppUser, modelId: string) => MiningSnapshot
  withdraw: (actor: AppUser, idempotencyKey?: string) => MiningWithdrawal
  listAllWithdrawals: (actor: AppUser) => MiningWithdrawal[]
  listIncidents: (actor: AppUser) => MiningIncident[]
  getAdminOverview: (actor: AppUser) => MiningAdminOverview
  subscribe: (listener: () => void) => () => void
}

function modelById(modelId: string): MiningMachineModel {
  const model = MINING_MACHINE_MODELS.find((candidate) => candidate.id === modelId)
  if (!model) throw new ValidationError('Modèle de machine inconnu.')
  return model
}

function defaultSettings(updatedAt: string): MiningSettings {
  return {
    cycleHours: DEFAULT_CYCLE_HOURS,
    minWithdrawal: DEFAULT_MIN_WITHDRAWAL,
    anomalyThreshold: DEFAULT_ANOMALY_THRESHOLD,
    updatedAt,
    updatedBy: 'system',
  }
}

function emptyDatabase(now: string): MiningDatabase {
  return {
    version: 1,
    settings: defaultSettings(now),
    users: {},
    withdrawals: [],
    events: [],
  }
}

function isDatabase(value: unknown): value is MiningDatabase {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MiningDatabase>
  return (
    candidate.version === 1 &&
    Boolean(candidate.settings) &&
    typeof candidate.settings?.cycleHours === 'number' &&
    typeof candidate.settings?.minWithdrawal === 'number' &&
    typeof candidate.users === 'object' &&
    candidate.users !== null &&
    Array.isArray(candidate.withdrawals) &&
    Array.isArray(candidate.events)
  )
}

function loadDatabase(adapter: StorageAdapter, now: string): MiningDatabase {
  const stored = adapter.get<unknown>(MINING_KEY)
  if (!isDatabase(stored)) return emptyDatabase(now)

  const settings = stored.settings
  const sanitized: MiningSettings = {
    cycleHours:
      Number.isInteger(settings.cycleHours) && settings.cycleHours >= 1 && settings.cycleHours <= 168
        ? settings.cycleHours
        : DEFAULT_CYCLE_HOURS,
    minWithdrawal:
      Number.isInteger(settings.minWithdrawal) &&
      settings.minWithdrawal >= 1 &&
      settings.minWithdrawal <= 1_000_000
        ? settings.minWithdrawal
        : DEFAULT_MIN_WITHDRAWAL,
    anomalyThreshold:
      Number.isFinite(settings.anomalyThreshold) && settings.anomalyThreshold > 0
        ? settings.anomalyThreshold
        : DEFAULT_ANOMALY_THRESHOLD,
    updatedAt: typeof settings.updatedAt === 'string' ? settings.updatedAt : now,
    updatedBy: typeof settings.updatedBy === 'string' ? settings.updatedBy : 'system',
  }

  return {
    version: 1,
    settings: sanitized,
    users: stored.users,
    withdrawals: stored.withdrawals,
    events: stored.events,
  }
}

function saveDatabase(adapter: StorageAdapter, database: MiningDatabase): void {
  adapter.set(MINING_KEY, database)
}

function assertActiveUser(actor: AppUser | null): AppUser {
  if (!actor || actor.status !== 'active') {
    throw new PermissionError('Compte inactif ou introuvable.')
  }
  return actor
}

function dateKey(value: number | string): string {
  return new Date(value).toISOString().slice(0, 10)
}

function addToDaily(
  state: MiningUserState,
  date: string,
  mined: number,
  electricity: number,
  purchases: number,
): void {
  let bucket = state.daily.find((entry) => entry.date === date)
  if (!bucket) {
    bucket = { date, mined: 0, electricity: 0, purchases: 0 }
    state.daily.push(bucket)
  }
  bucket.mined += mined
  bucket.electricity += electricity
  bucket.purchases += purchases
}

function pruneDaily(state: MiningUserState): void {
  state.daily.sort((left, right) => right.date.localeCompare(left.date))
  if (state.daily.length > MAX_DAILY_DAYS) state.daily.length = MAX_DAILY_DAYS
}

function appendEvent(
  database: MiningDatabase,
  input: {
    userId: string
    type: MiningEventType
    title: string
    detail: string
    createdAt: string
    amount?: number | null
    metadata?: MiningEvent['metadata']
  },
): MiningEvent {
  const event: MiningEvent = {
    id: createId('mev'),
    userId: input.userId,
    type: input.type,
    title: input.title,
    detail: input.detail,
    amount: input.amount ?? null,
    createdAt: input.createdAt,
    metadata: { ...(input.metadata ?? {}) },
  }
  database.events = [event, ...database.events].slice(0, MAX_EVENTS)
  return event
}

function createOwnedMachine(
  userId: string,
  model: MiningMachineModel,
  purchasedAt: string,
): MiningMachine {
  return {
    id: createId('mm'),
    userId,
    modelId: model.id,
    status: 'idle',
    purchasedAt,
    runningSince: null,
    lastAccruedAt: null,
    maintenanceUntil: null,
    totalMined: 0,
  }
}

function ensureUserState(
  database: MiningDatabase,
  userId: string,
  at: string,
): { state: MiningUserState; created: boolean } {
  const existing = database.users[userId]
  if (existing) return { state: existing, created: false }

  const starter = MINING_MACHINE_MODELS.find((model) => model.starter) ?? MINING_MACHINE_MODELS[0]
  const machine = createOwnedMachine(userId, starter, at)
  const state: MiningUserState = {
    userId,
    machines: [machine],
    pendingGross: 0,
    pendingCost: 0,
    totalMined: 0,
    totalElectricity: 0,
    totalPurchases: 0,
    lastWithdrawalAt: null,
    nextWithdrawalAt: null,
    startedAt: null,
    daily: [],
    seeded: true,
  }
  database.users[userId] = state

  appendEvent(database, {
    userId,
    type: 'machine_installed',
    title: 'Machine de démarrage offerte',
    detail: `Votre première ${starter.name} est incluse. Démarrez le minage pour commencer.`,
    createdAt: at,
    metadata: { machineId: machine.id, modelId: starter.id, offerte: true },
  })

  return { state, created: true }
}

/** Accrédite les gains et l'électricité virtuelle sur un intervalle donné. */
function accrueInterval(
  state: MiningUserState,
  machine: MiningMachine,
  model: MiningMachineModel,
  fromMs: number,
  toMs: number,
): void {
  if (toMs <= fromMs) return
  let cursor = fromMs
  let guard = 0

  while (cursor < toMs && guard < 120) {
    const cursorDate = new Date(cursor)
    const nextMidnight = Date.UTC(
      cursorDate.getUTCFullYear(),
      cursorDate.getUTCMonth(),
      cursorDate.getUTCDate() + 1,
    )
    const segmentEnd = Math.min(toMs, nextMidnight)
    const elapsed = segmentEnd - cursor
    const gross = (model.dailyYield * elapsed) / DAY_MS
    const cost = (model.dailyCost * elapsed) / DAY_MS

    state.pendingGross += gross
    state.pendingCost += cost
    state.totalMined += gross
    state.totalElectricity += cost
    machine.totalMined += gross
    addToDaily(state, dateKey(cursor), gross, cost, 0)

    cursor = segmentEnd
    guard += 1
  }
}

/**
 * Recalcule l'état réel du simulateur à partir de l'horloge du service.
 * C'est cette fonction qui fait autorité, jamais l'horloge affichée côté UI.
 */
function syncUserState(database: MiningDatabase, state: MiningUserState, at: string): boolean {
  const atMs = Date.parse(at)
  let changed = false

  for (const machine of state.machines) {
    const model = MINING_MACHINE_MODELS.find((candidate) => candidate.id === machine.modelId)
    if (!model) continue
    let guard = 0

    while (guard < 500) {
      guard += 1

      if (machine.status === 'running') {
        const lastMs = machine.lastAccruedAt ? Date.parse(machine.lastAccruedAt) : Number.NaN
        if (!Number.isFinite(lastMs)) {
          machine.lastAccruedAt = at
          changed = true
          break
        }
        if (lastMs >= atMs) break

        const runningSinceMs = machine.runningSince
          ? Date.parse(machine.runningSince)
          : lastMs
        const maintenanceAt = runningSinceMs + RUN_BEFORE_MAINTENANCE_MS

        if (Number.isFinite(maintenanceAt) && maintenanceAt > lastMs && maintenanceAt <= atMs) {
          accrueInterval(state, machine, model, lastMs, maintenanceAt)
          machine.status = 'maintenance'
          machine.maintenanceUntil = new Date(
            maintenanceAt + MAINTENANCE_DURATION_MS,
          ).toISOString()
          machine.lastAccruedAt = new Date(maintenanceAt).toISOString()
          appendEvent(database, {
            userId: state.userId,
            type: 'maintenance_started',
            title: 'Maintenance en cours',
            detail: `${model.shortName} refroidit quelques minutes. Les gains reprennent automatiquement.`,
            createdAt: new Date(maintenanceAt).toISOString(),
            metadata: { machineId: machine.id, modelId: model.id },
          })
          changed = true
          continue
        }

        accrueInterval(state, machine, model, lastMs, atMs)
        machine.lastAccruedAt = at
        changed = true
        break
      }

      if (machine.status === 'maintenance') {
        const untilMs = machine.maintenanceUntil
          ? Date.parse(machine.maintenanceUntil)
          : Number.NaN
        if (!Number.isFinite(untilMs) || atMs < untilMs) break

        machine.status = 'running'
        machine.runningSince = new Date(untilMs).toISOString()
        machine.lastAccruedAt = new Date(untilMs).toISOString()
        machine.maintenanceUntil = null
        appendEvent(database, {
          userId: state.userId,
          type: 'maintenance_ended',
          title: 'Maintenance terminée',
          detail: `${model.shortName} est de nouveau opérationnelle.`,
          createdAt: new Date(untilMs).toISOString(),
          metadata: { machineId: machine.id, modelId: model.id },
        })
        changed = true
        continue
      }

      break
    }
  }

  if (changed) pruneDaily(state)
  return changed
}

function pendingBalance(state: MiningUserState): number {
  return Math.max(0, state.pendingGross - state.pendingCost)
}

function buildSnapshot(
  database: MiningDatabase,
  state: MiningUserState,
  atMs: number,
): MiningSnapshot {
  const settings = database.settings
  const today = dateKey(atMs)
  const todayStat = state.daily.find((entry) => entry.date === today)
  const activeMachines = state.machines.filter((machine) => machine.status === 'running').length
  const maintenanceMachines = state.machines.filter(
    (machine) => machine.status === 'maintenance',
  ).length

  let estimatedDailyRevenue = 0
  let estimatedDailyCost = 0
  const machines: MiningMachineView[] = state.machines.map((machine) => {
    const model = modelById(machine.modelId)
    if (machine.status === 'running') {
      estimatedDailyRevenue += model.dailyYield
      estimatedDailyCost += model.dailyCost
    }
    return {
      ...machine,
      model,
      estimatedDailyNet: model.dailyYield - model.dailyCost,
    }
  })

  const pending = pendingBalance(state)
  const withdrawableAmount = Math.floor(pending)
  const nextWithdrawalAt = state.nextWithdrawalAt
  const remainingMs = nextWithdrawalAt
    ? Math.max(0, Date.parse(nextWithdrawalAt) - atMs)
    : 0
  const withdrawals = database.withdrawals
    .filter((withdrawal) => withdrawal.userId === state.userId)
    .slice()
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
  const totalWithdrawn = withdrawals.reduce((total, withdrawal) => total + withdrawal.amount, 0)
  const events = database.events
    .filter((event) => event.userId === state.userId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  const hasEnough = withdrawableAmount >= settings.minWithdrawal
  const isDelayed = remainingMs > 0
  const canWithdraw = hasEnough && !isDelayed
  const withdrawReason = !hasEnough ? 'no_gain' : isDelayed ? 'delay' : null
  const withdrawMessage = !hasEnough
    ? `Il faut au moins ${settings.minWithdrawal} jetons pour retirer.`
    : isDelayed
      ? 'Le prochain retrait est encore verrouillé par le cycle serveur.'
      : null

  const todayRevenue = todayStat?.mined ?? 0
  const todayExpenses = (todayStat?.electricity ?? 0) + (todayStat?.purchases ?? 0)

  return {
    userId: state.userId,
    machines,
    settings,
    status:
      activeMachines > 0 ? 'mining' : maintenanceMachines > 0 ? 'maintenance' : 'off',
    activeMachines,
    totalMachines: state.machines.length,
    maintenanceMachines,
    pendingGross: state.pendingGross,
    pendingCost: state.pendingCost,
    pendingBalance: pending,
    withdrawableAmount,
    estimatedDailyRevenue,
    estimatedDailyCost,
    estimatedDailyNet: Math.max(0, estimatedDailyRevenue - estimatedDailyCost),
    todayRevenue,
    todayExpenses,
    todayNet: todayRevenue - todayExpenses,
    totalMined: state.totalMined,
    totalElectricity: state.totalElectricity,
    totalPurchases: state.totalPurchases,
    totalWithdrawn,
    netProfit: state.totalMined - state.totalElectricity - state.totalPurchases,
    lastWithdrawalAt: state.lastWithdrawalAt,
    nextWithdrawalAt,
    remainingMs,
    canWithdraw,
    withdrawReason,
    withdrawMessage,
    withdrawals,
    events,
    daily: state.daily.slice().sort((left, right) => right.date.localeCompare(left.date)),
  }
}

function buildIncidents(database: MiningDatabase): MiningIncident[] {
  const incidents: MiningIncident[] = []

  for (const event of database.events) {
    if (event.type !== 'withdrawal_blocked') continue
    incidents.push({
      id: event.id,
      userId: event.userId,
      createdAt: event.createdAt,
      title: event.title,
      detail: event.detail,
      severity: 'warning',
      amount: event.amount,
    })
  }

  for (const withdrawal of database.withdrawals) {
    if (withdrawal.amount < database.settings.anomalyThreshold) continue
    incidents.push({
      id: `incident-${withdrawal.id}`,
      userId: withdrawal.userId,
      createdAt: withdrawal.requestedAt,
      title: 'Retrait inhabituellement élevé',
      detail: `Un retrait GPU de ${withdrawal.amount} jetons dépasse le seuil de surveillance.`,
      severity: 'critical',
      amount: withdrawal.amount,
    })
  }

  return incidents.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function createMiningService(options: MiningServiceOptions = {}): MiningService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const wallet =
    options.wallet ?? (options.storage ? createWalletService({ storage: adapter }) : defaultWalletService)
  const notifications =
    options.notifications ??
    (options.storage
      ? createNotificationService({ storage: adapter })
      : defaultNotificationService)
  const audit =
    options.audit ?? (options.storage ? createAuditService({ storage: adapter }) : defaultAuditService)
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const getDb = (): MiningDatabase => loadDatabase(adapter, now())

  const persist = (database: MiningDatabase): void => {
    saveDatabase(adapter, database)
  }

  const getSettings = (): MiningSettings => ({ ...getDb().settings })

  const getSnapshot = (userIdInput: string): MiningSnapshot => {
    const userId = validateId(userIdInput, 'Identifiant utilisateur')
    const at = now()
    const atMs = Date.parse(at)
    const database = getDb()
    const { state, created } = ensureUserState(database, userId, at)
    const changed = syncUserState(database, state, at) || created
    if (changed) persist(database)
    return buildSnapshot(database, state, atMs)
  }

  const getQuote = (userIdInput: string): MiningWithdrawalQuote => {
    const snapshot = getSnapshot(userIdInput)
    return {
      pending: snapshot.pendingBalance,
      amount: snapshot.withdrawableAmount,
      canWithdraw: snapshot.canWithdraw,
      reason: snapshot.withdrawReason,
      message: snapshot.withdrawMessage,
      nextWithdrawalAt: snapshot.nextWithdrawalAt,
      remainingMs: snapshot.remainingMs,
      minimum: snapshot.settings.minWithdrawal,
    }
  }

  const startMining = (actorInput: AppUser): MiningSnapshot => {
    const actor = assertActiveUser(actorInput)
    const at = now()
    const database = getDb()
    const { state } = ensureUserState(database, actor.id, at)
    syncUserState(database, state, at)

    const candidates = state.machines.filter((machine) => machine.status === 'idle')
    if (candidates.length === 0) {
      persist(database)
      throw new ConflictError('Toutes vos machines sont déjà actives ou en maintenance.')
    }

    for (const machine of candidates) {
      machine.status = 'running'
      machine.runningSince = at
      machine.lastAccruedAt = at
      machine.maintenanceUntil = null
    }
    if (!state.startedAt) state.startedAt = at

    appendEvent(database, {
      userId: actor.id,
      type: 'mining_started',
      title: 'Minage démarré',
      detail: `${candidates.length} machine(s) produisent maintenant des gains simulés.`,
      createdAt: at,
      metadata: { machines: candidates.length },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'mining_started',
      targetType: 'mining',
      targetId: actor.id,
      justification: `Démarrage du minage virtuel (${candidates.length} machine(s)).`,
      createdAt: at,
      metadata: { machines: candidates.length, demo: true },
    })

    persist(database)
    emit()
    return buildSnapshot(database, state, Date.parse(at))
  }

  const stopMining = (actorInput: AppUser): MiningSnapshot => {
    const actor = assertActiveUser(actorInput)
    const at = now()
    const database = getDb()
    const { state } = ensureUserState(database, actor.id, at)
    syncUserState(database, state, at)

    const stopped = state.machines.filter(
      (machine) => machine.status === 'running' || machine.status === 'maintenance',
    )
    if (stopped.length > 0) {
      for (const machine of stopped) {
        machine.status = 'idle'
        machine.runningSince = null
        machine.lastAccruedAt = null
        machine.maintenanceUntil = null
      }

      appendEvent(database, {
        userId: actor.id,
        type: 'mining_stopped',
        title: 'Minage arrêté',
        detail: `${stopped.length} machine(s) à l'arrêt. Les gains déjà produits restent en attente.`,
        createdAt: at,
        metadata: { machines: stopped.length },
      })

      audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'mining_stopped',
        targetType: 'mining',
        targetId: actor.id,
        justification: `Arrêt du minage virtuel (${stopped.length} machine(s)).`,
        createdAt: at,
        metadata: { machines: stopped.length, demo: true },
      })
    }

    persist(database)
    emit()
    return buildSnapshot(database, state, Date.parse(at))
  }

  const setMachineRunning = (
    actorInput: AppUser,
    machineIdInput: string,
    running: boolean,
  ): MiningSnapshot => {
    const actor = assertActiveUser(actorInput)
    const machineId = validateId(machineIdInput, 'Identifiant de machine')
    const at = now()
    const database = getDb()
    const { state } = ensureUserState(database, actor.id, at)
    syncUserState(database, state, at)

    const machine = state.machines.find((candidate) => candidate.id === machineId)
    if (!machine) throw new ValidationError('Machine introuvable.')

    if (running) {
      if (machine.status === 'maintenance') {
        persist(database)
        throw new ConflictError('Cette machine est en maintenance. Réessayez dans quelques minutes.')
      }
      if (machine.status !== 'running') {
        machine.status = 'running'
        machine.runningSince = at
        machine.lastAccruedAt = at
        machine.maintenanceUntil = null
        if (!state.startedAt) state.startedAt = at
        appendEvent(database, {
          userId: actor.id,
          type: 'mining_started',
          title: 'Machine démarrée',
          detail: `${modelById(machine.modelId).shortName} produit des gains simulés.`,
          createdAt: at,
          metadata: { machineId: machine.id, modelId: machine.modelId },
        })
      }
    } else if (machine.status !== 'idle') {
      machine.status = 'idle'
      machine.runningSince = null
      machine.lastAccruedAt = null
      machine.maintenanceUntil = null
      appendEvent(database, {
        userId: actor.id,
        type: 'mining_stopped',
        title: 'Machine arrêtée',
        detail: `${modelById(machine.modelId).shortName} est à l'arrêt.`,
        createdAt: at,
        metadata: { machineId: machine.id, modelId: machine.modelId },
      })
    }

    persist(database)
    emit()
    return buildSnapshot(database, state, Date.parse(at))
  }

  const purchaseMachine = (actorInput: AppUser, modelIdInput: string): MiningSnapshot => {
    const actor = assertActiveUser(actorInput)
    const model = modelById(modelIdInput)
    const at = now()
    const database = getDb()
    const { state } = ensureUserState(database, actor.id, at)
    syncUserState(database, state, at)

    if (state.machines.length >= MAX_MACHINES_PER_USER) {
      persist(database)
      throw new ValidationError(
        `Vous pouvez posséder jusqu'à ${MAX_MACHINES_PER_USER} machines dans cette simulation.`,
      )
    }

    wallet.ensureInitialBalance(actor.id)
    const machine = createOwnedMachine(actor.id, model, at)
    wallet.debit({
      userId: actor.id,
      type: 'mining_purchase',
      amount: model.price,
      currency: wallet.currency,
      source: 'mining',
      reference: `mining:purchase:${machine.id}`,
      idempotencyKey: `mining:purchase:${machine.id}`,
      metadata: {
        machineId: machine.id,
        modelId: model.id,
        modelName: model.name,
        pnl: -model.price,
        demo: true,
      },
      createdAt: at,
    })

    state.machines.push(machine)
    state.totalPurchases += model.price
    addToDaily(state, dateKey(at), 0, 0, model.price)
    pruneDaily(state)

    appendEvent(database, {
      userId: actor.id,
      type: 'machine_purchased',
      title: `${model.shortName} ajoutée`,
      detail: `Achat virtuel de ${model.price} jetons. La machine est prête à démarrer.`,
      createdAt: at,
      amount: model.price,
      metadata: { machineId: machine.id, modelId: model.id },
    })

    notifications.add({
      userId: actor.id,
      type: 'balance_change',
      title: `Machine ajoutée : ${model.shortName}`,
      message: `${model.price} jetons virtuels débités. Démarrez la machine depuis « Mes machines ».`,
      createdAt: at,
      metadata: { machineId: machine.id, modelId: model.id, price: model.price, demo: true },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'mining_machine_purchased',
      targetType: 'mining',
      targetId: machine.id,
      justification: `Ajout d'une machine virtuelle ${model.name} pour ${model.price} jetons.`,
      createdAt: at,
      metadata: {
        modelId: model.id,
        price: model.price,
        userId: actor.id,
        demo: true,
      },
    })

    persist(database)
    emit()
    return buildSnapshot(database, state, Date.parse(at))
  }

  const withdraw = (actorInput: AppUser, idempotencyKeyInput?: string): MiningWithdrawal => {
    const actor = assertActiveUser(actorInput)
    const clientKey =
      idempotencyKeyInput !== undefined
        ? validateIdempotencyKey(idempotencyKeyInput)
        : null
    const at = now()
    const atMs = Date.parse(at)
    const database = getDb()
    const { state } = ensureUserState(database, actor.id, at)
    syncUserState(database, state, at)

    if (clientKey) {
      const existingByClientKey = database.withdrawals.find(
        (withdrawal) =>
          withdrawal.userId === actor.id && withdrawal.idempotencyKey === clientKey,
      )
      if (existingByClientKey) return Object.freeze({ ...existingByClientKey })
    }

    const cycleAnchor = state.lastWithdrawalAt ?? 'first'
    const internalKey = `mining:withdraw:${actor.id}:${cycleAnchor}`
    const existing = database.withdrawals.find(
      (withdrawal) =>
        withdrawal.userId === actor.id && withdrawal.idempotencyKey === internalKey,
    )
    if (existing) return Object.freeze({ ...existing })

    const remainingMs = state.nextWithdrawalAt
      ? Math.max(0, Date.parse(state.nextWithdrawalAt) - atMs)
      : 0

    if (remainingMs > 0) {
      appendEvent(database, {
        userId: actor.id,
        type: 'withdrawal_blocked',
        title: 'Retrait anticipé bloqué',
        detail: `Tentative de retrait avant la fin du cycle serveur. ${Math.ceil(
          remainingMs / 1000,
        )} seconde(s) restante(s).`,
        createdAt: at,
        metadata: { remainingMs, nextWithdrawalAt: state.nextWithdrawalAt },
      })

      audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'mining_withdrawal_blocked',
        targetType: 'mining',
        targetId: actor.id,
        justification: 'Tentative de retrait GPU avant la fin du cycle de 12 heures.',
        createdAt: at,
        metadata: { remainingMs, nextWithdrawalAt: state.nextWithdrawalAt, demo: true },
      })

      persist(database)
      emit()
      throw new ConflictError(
        'Retrait indisponible : le cycle de retrait n’est pas encore terminé.',
      )
    }

    const amount = Math.floor(pendingBalance(state))
    if (amount < database.settings.minWithdrawal) {
      persist(database)
      throw new ValidationError(
        `Aucun gain disponible : ${database.settings.minWithdrawal} jetons minimum sont requis.`,
      )
    }

    const withdrawalId = createId('mwd')
    const nextWithdrawalAt = new Date(atMs + database.settings.cycleHours * HOUR_MS).toISOString()
    const creditKey = `mining:credit:${actor.id}:${cycleAnchor}`

    wallet.ensureInitialBalance(actor.id)
    const movement = wallet.credit({
      userId: actor.id,
      type: 'mining_reward',
      amount,
      currency: wallet.currency,
      source: 'mining',
      reference: `mining:withdrawal:${withdrawalId}`,
      idempotencyKey: clientKey ?? creditKey,
      metadata: {
        withdrawalId,
        amount,
        cycleHours: database.settings.cycleHours,
        nextWithdrawalAt,
        pnl: amount,
        demo: true,
      },
      createdAt: at,
    })

    state.pendingGross = Math.max(0, state.pendingGross - amount)
    state.lastWithdrawalAt = at
    state.nextWithdrawalAt = nextWithdrawalAt

    const withdrawal: MiningWithdrawal = {
      id: withdrawalId,
      userId: actor.id,
      amount,
      currency: wallet.currency,
      status: 'credited',
      cycleHours: database.settings.cycleHours,
      cycleStart: cycleAnchor === 'first' ? null : cycleAnchor,
      requestedAt: at,
      nextWithdrawalAt,
      balanceAfter: movement.balanceAfter,
      ledgerMovementId: movement.id,
      idempotencyKey: clientKey ?? internalKey,
      demo: true,
    }
    database.withdrawals = [withdrawal, ...database.withdrawals]

    appendEvent(database, {
      userId: actor.id,
      type: 'withdrawal_credited',
      title: 'Retrait crédité',
      detail: `${amount} jetons ajoutés au portefeuille virtuel. Prochain retrait à partir de ${nextWithdrawalAt}.`,
      createdAt: at,
      amount,
      metadata: {
        withdrawalId,
        nextWithdrawalAt,
        cycleHours: database.settings.cycleHours,
      },
    })

    persist(database)

    notifications.add({
      userId: actor.id,
      type: 'mining_withdrawal',
      title: `Retrait GPU de ${amount} jetons crédité`,
      message: `Les gains simulés sont dans votre portefeuille. Prochain retrait dans ${database.settings.cycleHours} h.`,
      priority: 'important',
      createdAt: at,
      metadata: {
        withdrawalId,
        amount,
        nextWithdrawalAt,
        cycleHours: database.settings.cycleHours,
        demo: true,
      },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'mining_withdrawal',
      targetType: 'mining',
      targetId: withdrawalId,
      justification: `Retrait de ${amount} jetons minés crédité au portefeuille virtuel.`,
      createdAt: at,
      metadata: {
        amount,
        nextWithdrawalAt,
        cycleHours: database.settings.cycleHours,
        balanceAfter: movement.balanceAfter,
        userId: actor.id,
        demo: true,
      },
    })

    emit()
    return Object.freeze({ ...withdrawal })
  }

  const updateSettings = (
    actorInput: AppUser,
    input: MiningSettingsInput,
  ): MiningSettings => {
    const actor = assertActiveUser(actorInput)
    if (!hasPermission(actor, 'mining.configure')) {
      throw new PermissionError(
        'Seul un Super Admin peut configurer le cycle de retrait du module GPU Mining.',
      )
    }

    const database = getDb()
    const cycleHours =
      input.cycleHours === undefined
        ? database.settings.cycleHours
        : parseAmount(input.cycleHours, {
            label: 'La durée du cycle',
            min: 1,
            max: 168,
          })
    const minWithdrawal =
      input.minWithdrawal === undefined
        ? database.settings.minWithdrawal
        : parseAmount(input.minWithdrawal, {
            label: 'Le retrait minimum',
            min: 1,
            max: 1_000_000,
          })
    const anomalyThreshold =
      input.anomalyThreshold === undefined
        ? database.settings.anomalyThreshold
        : parseAmount(input.anomalyThreshold, {
            label: 'Le seuil de surveillance',
            min: 1_000,
            max: 10_000_000,
          })

    const at = now()
    const settings: MiningSettings = {
      cycleHours,
      minWithdrawal,
      anomalyThreshold,
      updatedAt: at,
      updatedBy: actor.id,
    }
    database.settings = settings
    appendEvent(database, {
      userId: actor.id,
      type: 'settings_updated',
      title: 'Cycle de retrait mis à jour',
      detail: `Cycle : ${cycleHours} h · retrait minimum : ${minWithdrawal} jetons.`,
      createdAt: at,
      metadata: { cycleHours, minWithdrawal, anomalyThreshold },
    })

    audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'mining_setting_changed',
      targetType: 'setting',
      targetId: 'mining',
      justification: `Configuration du cycle GPU : ${cycleHours} h, minimum ${minWithdrawal} jetons.`,
      createdAt: at,
      metadata: { cycleHours, minWithdrawal, anomalyThreshold, demo: true },
    })

    persist(database)
    emit()
    return { ...settings }
  }

  const listAllWithdrawals = (actorInput: AppUser): MiningWithdrawal[] => {
    const actor = assertActiveUser(actorInput)
    if (!hasPermission(actor, 'mining.withdrawals.read')) {
      throw new PermissionError('Vous n’avez pas la permission de consulter tous les retraits GPU.')
    }
    return getDb()
      .withdrawals.slice()
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((withdrawal) => Object.freeze({ ...withdrawal }))
  }

  const listIncidents = (actorInput: AppUser): MiningIncident[] => {
    const actor = assertActiveUser(actorInput)
    if (!hasPermission(actor, 'mining.anomalies.read')) {
      throw new PermissionError('Vous n’avez pas la permission de consulter les anomalies GPU.')
    }
    return buildIncidents(getDb())
  }

  const getAdminOverview = (actorInput: AppUser): MiningAdminOverview => {
    const actor = assertActiveUser(actorInput)
    const database = getDb()
    const canReadWithdrawals = hasPermission(actor, 'mining.withdrawals.read')
    const canReadIncidents = hasPermission(actor, 'mining.anomalies.read')
    const withdrawals = canReadWithdrawals
      ? database.withdrawals
          .slice()
          .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      : []
    return {
      settings: { ...database.settings },
      withdrawals,
      incidents: canReadIncidents ? buildIncidents(database) : [],
      totalWithdrawn: withdrawals.reduce((total, withdrawal) => total + withdrawal.amount, 0),
      withdrawalCount: withdrawals.length,
    }
  }

  return {
    models: MINING_MACHINE_MODELS,
    getSettings,
    updateSettings,
    getSnapshot,
    getQuote,
    startMining,
    stopMining,
    setMachineRunning,
    purchaseMachine,
    withdraw,
    listAllWithdrawals,
    listIncidents,
    getAdminOverview,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const miningService = createMiningService()
