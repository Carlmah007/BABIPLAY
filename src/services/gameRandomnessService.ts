import { ConflictError, NotFoundError, ValidationError } from '../lib/errors'
import { nowIso } from '../lib/dates'
import { createId } from '../lib/ids'
import { sha256Hex } from '../lib/sha256'
import { storage as defaultStorage, type StorageAdapter } from '../lib/storage'
import { validateId } from '../lib/validation'
import type { GameKind, RoundCommitment } from '../types/games'

export const GAME_KINDS: readonly GameKind[] = ['aviator', 'trading', 'tic_tac_toe']

const ROUNDS_KEY = 'randomness:rounds'
const TWO_POW_32 = 0x1_0000_0000

export interface RandomSource {
  uint32: () => number
  bytes: (length: number) => Uint8Array
}

/** Source d'aléa cryptographiquement sûre (navigateur ou Node ≥ 19). */
export function createCryptoRandomSource(): RandomSource {
  return {
    uint32() {
      const buffer = new Uint32Array(1)
      globalThis.crypto.getRandomValues(buffer)
      return buffer[0] >>> 0
    },
    bytes(length: number) {
      const buffer = new Uint8Array(length)
      globalThis.crypto.getRandomValues(buffer)
      return buffer
    },
  }
}

/**
 * Source déterministe uniquement destinée aux tests et à la reproduction
 * d'un historique de marché. La graine doit rester côté serveur.
 */
export function createDeterministicRandomSource(seed: string): RandomSource {
  let counter = 0
  const nextUint32 = (): number => {
    const value = Number.parseInt(sha256Hex(`${seed}:${counter}`).slice(0, 8), 16)
    counter += 1
    return value >>> 0
  }
  return {
    uint32: nextUint32,
    bytes(length: number) {
      const output = new Uint8Array(length)
      let offset = 0
      while (offset < length) {
        const value = nextUint32()
        for (let shift = 24; shift >= 0 && offset < length; shift -= 8) {
          output[offset] = (value >>> shift) & 0xff
          offset += 1
        }
      }
      return output
    },
  }
}

export interface RoundSecret extends RoundCommitment {
  /** Ne doit jamais être transmis au client avant la révélation. */
  serverSeed: string
}

export interface GameRandomnessService {
  createRound: (game: GameKind, options?: { roundId?: string; now?: string }) => RoundSecret
  getRound: (roundId: string) => RoundSecret | null
  listRounds: () => RoundCommitment[]
  reveal: (roundId: string) => string | null
  verify: (roundId: string) => boolean
  drawSequence: (roundId: string) => (index: number) => number
  hashSeed: (seed: string) => string
}

export interface GameRandomnessOptions {
  storage?: StorageAdapter
  random?: RandomSource
  now?: () => string
}

function assertGameKind(value: unknown): GameKind {
  if (typeof value !== 'string' || !(GAME_KINDS as readonly string[]).includes(value)) {
    throw new ValidationError('Type de jeu invalide.')
  }
  return value as GameKind
}

function bytesToHex(bytes: Uint8Array): string {
  let output = ''
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0')
  return output
}

/** Dérivation documentée : SHA-256(seed:nonce:index) → 32 bits. */
export function deriveUint32(serverSeed: string, nonce: string, index: number): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new ValidationError("L'index de tirage est invalide.")
  }
  return Number.parseInt(sha256Hex(`${serverSeed}:${nonce}:${index}`).slice(0, 8), 16) >>> 0
}

/** Tirage uniforme dans [0, 1). */
export function deriveUnit(serverSeed: string, nonce: string, index: number): number {
  return deriveUint32(serverSeed, nonce, index) / TWO_POW_32
}

/** Tirage entier borné inclusif (biais de modulo négligeable, documenté). */
export function deriveInt(
  serverSeed: string,
  nonce: string,
  index: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new ValidationError('Intervalle de tirage invalide.')
  }
  const span = max - min + 1
  return min + (deriveUint32(serverSeed, nonce, index) % span)
}

function loadRounds(adapter: StorageAdapter): Record<string, RoundSecret> {
  const stored = adapter.get<Record<string, RoundSecret>>(ROUNDS_KEY)
  return stored && typeof stored === 'object' ? stored : {}
}

function saveRounds(adapter: StorageAdapter, rounds: Record<string, RoundSecret>): void {
  adapter.set(ROUNDS_KEY, rounds)
}

export function createGameRandomnessService(
  options: GameRandomnessOptions = {},
): GameRandomnessService {
  const adapter = options.storage ?? defaultStorage
  const random = options.random ?? createCryptoRandomSource()
  const now = options.now ?? nowIso

  const createRound = (
    gameInput: GameKind,
    roundOptions: { roundId?: string; now?: string } = {},
  ): RoundSecret => {
    const game = assertGameKind(gameInput)
    const rounds = loadRounds(adapter)
    const roundId =
      roundOptions.roundId !== undefined
        ? validateId(roundOptions.roundId, 'Identifiant de manche')
        : createId(game)

    if (rounds[roundId]) {
      throw new ConflictError('Cet identifiant de manche est déjà utilisé.')
    }

    let serverSeed = bytesToHex(random.bytes(32))
    let nonce = bytesToHex(random.bytes(16))
    let attempts = 0
    while (
      Object.values(rounds).some(
        (round) => round.nonce === nonce || round.serverSeed === serverSeed,
      )
    ) {
      attempts += 1
      if (attempts > 8) {
        throw new ConflictError('Impossible de générer un seed et un nonce uniques.')
      }
      serverSeed = bytesToHex(random.bytes(32))
      nonce = bytesToHex(random.bytes(16))
    }

    const record: RoundSecret = {
      game,
      roundId,
      serverSeed,
      serverSeedHash: sha256Hex(serverSeed),
      nonce,
      createdAt: roundOptions.now ?? now(),
    }

    saveRounds(adapter, { ...rounds, [roundId]: record })
    return record
  }

  const getRound = (roundId: string): RoundSecret | null => {
    if (typeof roundId !== 'string' || !roundId) return null
    return loadRounds(adapter)[roundId] ?? null
  }

  const reveal = (roundId: string): string | null => getRound(roundId)?.serverSeed ?? null

  const verify = (roundId: string): boolean => {
    const round = getRound(roundId)
    return Boolean(round && sha256Hex(round.serverSeed) === round.serverSeedHash)
  }

  const drawSequence = (roundId: string): ((index: number) => number) => {
    const round = getRound(roundId)
    if (!round) throw new NotFoundError('Manche introuvable pour le tirage aléatoire.')
    return (index: number) => deriveUnit(round.serverSeed, round.nonce, index)
  }

  return {
    createRound,
    getRound,
    listRounds: () =>
      Object.values(loadRounds(adapter)).map(
        ({ game, roundId, serverSeedHash, nonce, createdAt }): RoundCommitment => ({
          game,
          roundId,
          serverSeedHash,
          nonce,
          createdAt,
        }),
      ),
    reveal,
    verify,
    drawSequence,
    hashSeed: sha256Hex,
  }
}

export const gameRandomnessService = createGameRandomnessService()
