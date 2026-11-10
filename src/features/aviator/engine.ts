import { ConflictError, ValidationError } from '../../lib/errors'
import { parseAmount, validateId } from '../../lib/validation'
import type { AviatorRound } from '../../types/games'
import type { RoundSecret } from '../../services/gameRandomnessService'

/**
 * Règles publiques d'Aviator (simulation locale).
 *
 * Distribution du point de crash, documentée et identique pour tous :
 *   r = premier tirage uniforme [0,1)
 *   brut = (1 - houseEdge) / (1 - r)
 *   crashPoint = min(maxMultiplier, max(1.01, floor(brut * 100) / 100))
 *
 * La marge de 1 % est publique. Aucune adaptation au joueur, à son solde,
 * à son historique ou à ses pertes n'est autorisée.
 */
export interface AviatorRules {
  houseEdge: number
  maxMultiplier: number
  minGrowthRate: number
  maxGrowthRate: number
  tickOptionsMs: number[]
  minRoundDelayMs: number
  maxRoundDelayMs: number
}

export const AVIATOR_RULES: AviatorRules = Object.freeze({
  houseEdge: 0.01,
  maxMultiplier: 500,
  minGrowthRate: 0.07,
  maxGrowthRate: 0.32,
  tickOptionsMs: [50, 80, 100, 120],
  minRoundDelayMs: 3_000,
  maxRoundDelayMs: 9_000,
})

function pick<T>(values: readonly T[], unit: number): T {
  const index = Math.min(values.length - 1, Math.floor(unit * values.length))
  return values[Math.max(0, index)]
}

/** Convertit un tirage uniforme en point de crash selon la distribution publique. */
export function crashPointFromUnit(unit: number, rules: AviatorRules = AVIATOR_RULES): number {
  if (!Number.isFinite(unit) || unit < 0 || unit >= 1) {
    throw new ValidationError('Tirage de crash invalide.')
  }
  const raw = (1 - rules.houseEdge) / (1 - unit)
  const floored = Math.floor(raw * 100) / 100
  return Math.min(rules.maxMultiplier, Math.max(1.01, floored))
}

/** Multiplicateur affiché, arrondi au centième inférieur. */
export function displayMultiplier(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.floor(value * 100) / 100
}

export interface GenerateAviatorInput {
  secret: RoundSecret
  userId: string
  stake: number
  startedAt: string
  draw: (index: number) => number
  rules?: AviatorRules
}

/**
 * Crée une manche dont le résultat est fixé avant tout affichage.
 * La fonction est déterministe pour un même engagement (seed, nonce, index).
 */
export function generateAviatorRound(input: GenerateAviatorInput): AviatorRound {
  const rules = input.rules ?? AVIATOR_RULES
  const userId = validateId(input.userId, 'Identifiant utilisateur')
  const stake = parseAmount(input.stake, { label: 'La mise', max: 1_000_000 })
  if (Number.isNaN(Date.parse(input.startedAt))) {
    throw new ValidationError('La date de début de manche est invalide.')
  }
  if (!input.secret || input.secret.game !== 'aviator') {
    throw new ValidationError("L'engagement de manche Aviator est invalide.")
  }

  const crashPoint = crashPointFromUnit(input.draw(0), rules)
  const growthRate =
    rules.minGrowthRate + input.draw(1) * (rules.maxGrowthRate - rules.minGrowthRate)
  const tickMs = pick(rules.tickOptionsMs, input.draw(2))
  const nextRoundDelayMs =
    rules.minRoundDelayMs +
    Math.floor(input.draw(3) * (rules.maxRoundDelayMs - rules.minRoundDelayMs + 1))

  const crashElapsedMs = Math.max(
    1,
    Math.ceil((Math.log(crashPoint) / growthRate) * 1000),
  )

  return Object.freeze({
    game: 'aviator',
    roundId: input.secret.roundId,
    serverSeedHash: input.secret.serverSeedHash,
    nonce: input.secret.nonce,
    createdAt: input.secret.createdAt,
    userId,
    stake,
    status: 'created',
    crashPoint,
    growthRate,
    tickMs,
    nextRoundDelayMs,
    startedAt: input.startedAt,
    crashElapsedMs,
    endedAt: null,
    cashedOutAt: null,
    cashoutMultiplier: null,
    payout: 0,
    pnl: null,
    settledAt: null,
    demo: true,
  })
}

/** Multiplicateur serveur à un instant donné, plafonné au point de crash. */
export function multiplierAt(
  round: Pick<AviatorRound, 'growthRate' | 'crashPoint' | 'crashElapsedMs'>,
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 1
  if (elapsedMs >= round.crashElapsedMs) return round.crashPoint
  return Math.min(round.crashPoint, Math.exp(round.growthRate * (elapsedMs / 1000)))
}

export function hasCrashed(
  round: Pick<AviatorRound, 'crashElapsedMs'>,
  elapsedMs: number,
): boolean {
  return elapsedMs >= round.crashElapsedMs
}

export interface CashoutResult {
  multiplier: number
  payout: number
  pnl: number
}

/**
 * Valide un retrait au moment serveur fourni.
 * Refuse un retrait après crash ou sur une manche non active.
 */
export function computeCashout(round: AviatorRound, elapsedMs: number): CashoutResult {
  if (round.status !== 'running') {
    throw new ConflictError('Cette manche n’est pas en cours.')
  }
  if (hasCrashed(round, elapsedMs)) {
    throw new ConflictError('La manche a déjà crashé : le retrait est refusé.')
  }
  const multiplier = displayMultiplier(multiplierAt(round, elapsedMs))
  const payout = Math.floor(round.stake * multiplier)
  return { multiplier, payout, pnl: payout - round.stake }
}

/** Passe la manche à l'état terminé (crash) sans modifier le point de crash. */
export function markCrashed(round: AviatorRound, at: string): AviatorRound {
  if (round.status !== 'running' && round.status !== 'started') {
    throw new ConflictError('Cette manche ne peut pas être clôturée par un crash.')
  }
  return Object.freeze({
    ...round,
    status: 'completed',
    endedAt: at,
    payout: 0,
    pnl: -round.stake,
  })
}

/** Passe la manche à l'état terminé après un retrait validé. */
export function markCashedOut(
  round: AviatorRound,
  multiplier: number,
  at: string,
): AviatorRound {
  if (round.status !== 'running') {
    throw new ConflictError('Cette manche n’est pas en cours.')
  }
  const payout = Math.floor(round.stake * multiplier)
  return Object.freeze({
    ...round,
    status: 'completed',
    endedAt: at,
    cashedOutAt: at,
    cashoutMultiplier: multiplier,
    payout,
    pnl: payout - round.stake,
  })
}

/** Vérifie a posteriori qu'un crash correspond bien à l'engagement révélé. */
export function verifyCrashPoint(
  expectedCrashPoint: number,
  draw: (index: number) => number,
): boolean {
  return crashPointFromUnit(draw(0)) === expectedCrashPoint
}
