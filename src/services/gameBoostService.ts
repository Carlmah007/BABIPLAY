import { ValidationError } from '../lib/errors'
import { createId } from '../lib/ids'
import { nowIso } from '../lib/dates'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import { parseAmount } from '../lib/validation'
import type { GameKind } from '../types/games'

const BOOSTS_KEY = 'boosts:schedule'

export type BoostGame = Extract<GameKind, 'aviator'>

export interface GameBoost {
  id: string
  label: string
  game: BoostGame
  /** Heure locale de déclenchement au format « HH:MM » (24 h). */
  timeOfDay: string
  /** Tolérance autour de l'heure, en minutes. */
  windowMinutes: number
  /** Cote forcée pendant la fenêtre (point de crash Aviator). */
  forcedMultiplier: number
  /** Plafond de gain par manche pendant la fenêtre. */
  maxWin: number
  enabled: boolean
  createdAt: string
}

export interface GameBoostInput {
  label: string
  game: BoostGame
  timeOfDay: string
  windowMinutes?: number
  forcedMultiplier: number
  maxWin: number
  enabled?: boolean
}

export interface GameBoostService {
  list: () => GameBoost[]
  add: (input: GameBoostInput) => GameBoost
  update: (id: string, patch: Partial<Omit<GameBoost, 'id' | 'createdAt' | 'game'>>) => GameBoost
  remove: (id: string) => void
  toggle: (id: string) => GameBoost
  /** Renvoie le boost actif pour le jeu à l'instant donné, ou null. */
  activeBoost: (game: BoostGame, at?: string) => GameBoost | null
  subscribe: (listener: () => void) => () => void
}

const DEFAULT_WINDOW_MINUTES = 3
const MAX_WINDOW_MINUTES = 60
const MIN_MULTIPLIER = 1.02
const MAX_MULTIPLIER = 500

function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** Écart en minutes entre deux instants du jour, gérant le passage de minuit. */
function minuteDistance(aMinutes: number, bMinutes: number): number {
  const direct = Math.abs(aMinutes - bMinutes)
  return Math.min(direct, 1440 - direct)
}

/**
 * Programmateur de manches boostées.
 *
 * ATTENTION : un boost force le résultat d'une manche : la vérification
 * provably fair (`verify`) échoue alors pour ces manches, ce qui est
 * cohérent — le résultat n'est plus tiré au sort. Fonction réservée à la
 * démonstration, désactivable à tout moment par un admin.
 */
export function createGameBoostService(options: {
  storage?: StorageAdapter
  now?: () => string
} = {}): GameBoostService {
  const adapter = options.storage ?? defaultStorage
  const now = options.now ?? nowIso
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())

  const load = (): GameBoost[] => {
    const stored = adapter.get<GameBoost[]>(BOOSTS_KEY)
    if (!Array.isArray(stored)) return []
    return stored.filter(
      (boost) =>
        boost &&
        typeof boost.id === 'string' &&
        typeof boost.timeOfDay === 'string' &&
        typeof boost.forcedMultiplier === 'number',
    )
  }

  const save = (boosts: GameBoost[]): void => {
    adapter.set(BOOSTS_KEY, boosts)
    emit()
  }

  const validateInput = (input: GameBoostInput): void => {
    if (!isTimeOfDay(input.timeOfDay)) {
      throw new ValidationError("L'heure doit être au format « HH:MM » (24 h).")
    }
    if (
      typeof input.forcedMultiplier !== 'number' ||
      input.forcedMultiplier < MIN_MULTIPLIER ||
      input.forcedMultiplier > MAX_MULTIPLIER
    ) {
      throw new ValidationError(
        `La cote forcée doit être comprise entre ${MIN_MULTIPLIER} et ${MAX_MULTIPLIER}.`,
      )
    }
    if (
      typeof input.windowMinutes === 'number' &&
      (input.windowMinutes < 1 || input.windowMinutes > MAX_WINDOW_MINUTES)
    ) {
      throw new ValidationError(
        `La tolérance doit être entre 1 et ${MAX_WINDOW_MINUTES} minutes.`,
      )
    }
  }

  const toMinutes = (timeOfDay: string): number => {
    const [hours, minutes] = timeOfDay.split(':').map((part) => Number(part))
    return hours * 60 + minutes
  }

  const add = (input: GameBoostInput): GameBoost => {
    validateInput(input)
    parseAmount(input.maxWin, { label: 'Le plafond de gain', allowZero: false, max: 1_000_000 })
    const boost: GameBoost = {
      id: createId('boost'),
      label: input.label.trim() || 'Boost',
      game: input.game,
      timeOfDay: input.timeOfDay,
      windowMinutes: input.windowMinutes ?? DEFAULT_WINDOW_MINUTES,
      forcedMultiplier: Math.floor(input.forcedMultiplier * 100) / 100,
      maxWin: input.maxWin,
      enabled: input.enabled ?? true,
      createdAt: now(),
    }
    save([...load(), boost])
    return boost
  }

  const update = (
    id: string,
    patch: Partial<Omit<GameBoost, 'id' | 'createdAt' | 'game'>>,
  ): GameBoost => {
    const boosts = load()
    const index = boosts.findIndex((candidate) => candidate.id === id)
    if (index < 0) throw new ValidationError('Boost introuvable.')
    const next: GameBoost = { ...boosts[index], ...patch }
    if (patch.timeOfDay !== undefined && !isTimeOfDay(patch.timeOfDay)) {
      throw new ValidationError("L'heure doit être au format « HH:MM » (24 h).")
    }
    boosts[index] = next
    save(boosts)
    return next
  }

  const remove = (id: string): void => {
    save(load().filter((boost) => boost.id !== id))
  }

  const toggle = (id: string): GameBoost => {
    const boosts = load()
    const index = boosts.findIndex((candidate) => candidate.id === id)
    if (index < 0) throw new ValidationError('Boost introuvable.')
    boosts[index] = { ...boosts[index], enabled: !boosts[index].enabled }
    save(boosts)
    return boosts[index]
  }

  const activeBoost = (game: BoostGame, atIso?: string): GameBoost | null => {
    const at = atIso ?? now()
    const time = new Date(at)
    if (Number.isNaN(time.getTime())) return null
    const nowMinutes = time.getHours() * 60 + time.getMinutes()
    return (
      load().find(
        (boost) =>
          boost.enabled &&
          boost.game === game &&
          minuteDistance(nowMinutes, toMinutes(boost.timeOfDay)) <= boost.windowMinutes,
      ) ?? null
    )
  }

  return {
    list: () => load(),
    add,
    update,
    remove,
    toggle,
    activeBoost,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const gameBoostService = createGameBoostService()
