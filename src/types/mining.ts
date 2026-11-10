/**
 * GPU Mining — simulation 100 % virtuelle.
 *
 * Aucune machine réelle n'est pilotée et aucun revenu réel n'est généré.
 * Les gains sont des jetons BabiPlay crédités au portefeuille virtuel partagé
 * uniquement après un retrait autorisé par le cycle serveur.
 */

export type MiningMachineStatus = 'idle' | 'running' | 'maintenance'

export type MiningMachineTier = 'starter' | 'advanced' | 'pro' | 'elite'

export interface MiningMachineModel {
  id: string
  name: string
  shortName: string
  tier: MiningMachineTier
  /** Puissance affichée, en TH/s virtuels. */
  power: number
  /** Rendement brut estimé sur 24 h, en jetons. */
  dailyYield: number
  /** Électricité virtuelle estimée sur 24 h, en jetons. */
  dailyCost: number
  /** Coût virtuel d'ajout d'une machine supplémentaire. */
  price: number
  /** La première machine de ce modèle est offerte à l'ouverture du module. */
  starter: boolean
  description: string
}

/** Machine possédée par un joueur. */
export interface MiningMachine {
  id: string
  userId: string
  modelId: string
  status: MiningMachineStatus
  purchasedAt: string
  runningSince: string | null
  lastAccruedAt: string | null
  maintenanceUntil: string | null
  totalMined: number
}

export interface MiningMachineView extends MiningMachine {
  model: MiningMachineModel
  estimatedDailyNet: number
}

export interface MiningWithdrawal {
  id: string
  userId: string
  amount: number
  currency: string
  status: 'credited'
  cycleHours: number
  cycleStart: string | null
  requestedAt: string
  nextWithdrawalAt: string
  balanceAfter: number
  ledgerMovementId: string
  idempotencyKey: string
  demo: true
}

export type MiningEventType =
  | 'machine_installed'
  | 'machine_purchased'
  | 'mining_started'
  | 'mining_stopped'
  | 'maintenance_started'
  | 'maintenance_ended'
  | 'withdrawal_credited'
  | 'withdrawal_blocked'
  | 'settings_updated'

export interface MiningEvent {
  id: string
  userId: string
  type: MiningEventType
  title: string
  detail: string
  amount: number | null
  createdAt: string
  metadata: Record<string, string | number | boolean | null>
}

export interface MiningDailyStat {
  /** Jour serveur au format YYYY-MM-DD (UTC). */
  date: string
  mined: number
  electricity: number
  purchases: number
}

export interface MiningSettings {
  /** Durée du cycle de retrait, en heures (1 à 168). */
  cycleHours: number
  /** Seuil minimum de retrait, en jetons entiers. */
  minWithdrawal: number
  /** Seuil à partir duquel un retrait est signalé comme inhabituel. */
  anomalyThreshold: number
  updatedAt: string
  updatedBy: string
}

export interface MiningUserState {
  userId: string
  machines: MiningMachine[]
  /** Gains bruts accumulés, non encore retirés. */
  pendingGross: number
  /** Électricité virtuelle accumulée à déduire des gains bruts. */
  pendingCost: number
  totalMined: number
  totalElectricity: number
  totalPurchases: number
  /** Date serveur du dernier retrait réussi. */
  lastWithdrawalAt: string | null
  /** Date serveur du prochain retrait autorisé. */
  nextWithdrawalAt: string | null
  startedAt: string | null
  daily: MiningDailyStat[]
  seeded: boolean
}

export interface MiningDatabase {
  version: 1
  settings: MiningSettings
  users: Record<string, MiningUserState>
  withdrawals: MiningWithdrawal[]
  events: MiningEvent[]
}

export interface MiningWithdrawalQuote {
  pending: number
  amount: number
  canWithdraw: boolean
  reason: 'no_gain' | 'delay' | null
  message: string | null
  nextWithdrawalAt: string | null
  remainingMs: number
  minimum: number
}

export interface MiningIncident {
  id: string
  userId: string
  createdAt: string
  title: string
  detail: string
  severity: 'warning' | 'critical'
  amount: number | null
}

export interface MiningAdminOverview {
  settings: MiningSettings
  withdrawals: MiningWithdrawal[]
  incidents: MiningIncident[]
  totalWithdrawn: number
  withdrawalCount: number
}

export interface MiningSnapshot {
  userId: string
  machines: MiningMachineView[]
  settings: MiningSettings
  status: 'off' | 'mining' | 'maintenance'
  activeMachines: number
  totalMachines: number
  maintenanceMachines: number
  pendingGross: number
  pendingCost: number
  /** Gains en attente nets d'électricité virtuelle. */
  pendingBalance: number
  withdrawableAmount: number
  estimatedDailyRevenue: number
  estimatedDailyCost: number
  estimatedDailyNet: number
  todayRevenue: number
  todayExpenses: number
  todayNet: number
  totalMined: number
  totalElectricity: number
  totalPurchases: number
  totalWithdrawn: number
  netProfit: number
  lastWithdrawalAt: string | null
  nextWithdrawalAt: string | null
  remainingMs: number
  canWithdraw: boolean
  withdrawReason: 'no_gain' | 'delay' | null
  withdrawMessage: string | null
  withdrawals: MiningWithdrawal[]
  events: MiningEvent[]
  daily: MiningDailyStat[]
}

export interface MiningSettingsInput {
  cycleHours?: number
  minWithdrawal?: number
  anomalyThreshold?: number
}
