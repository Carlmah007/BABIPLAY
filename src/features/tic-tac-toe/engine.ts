import { ConflictError, ValidationError } from '../../lib/errors'
import { validateId } from '../../lib/validation'
import type {
  TicTacToeBoard,
  TicTacToeGame,
  TicTacToeLevel,
  TicTacToeMark,
  TicTacToeResult,
} from '../../types/games'

export const TIC_TAC_TOE_LEVELS: readonly TicTacToeLevel[] = [
  'beginner',
  'intermediate',
  'expert',
]

/**
 * Cotes publiées par niveau (inspirées du modèle bookmaker : plus l'adversaire
 * est difficile, plus la cote est élevée).
 *
 * - victoire : mise × cote, la mise n'est pas restituée en plus ;
 * - match nul : mise remboursée (cote 1.00) ;
 * - défaite : mise perdue.
 */
export const TIC_TAC_TOE_MULTIPLIERS: Readonly<Record<TicTacToeLevel, number>> = Object.freeze({
  beginner: 1.5,
  intermediate: 2,
  expert: 3,
})

export const TIC_TAC_TOE_STAKE_LIMITS = Object.freeze({
  min: 10,
  max: 10_000,
})

export function multiplierForLevel(level: TicTacToeLevel): number {
  const multiplier = TIC_TAC_TOE_MULTIPLIERS[level]
  if (!multiplier) throw new ValidationError('Niveau de jeu invalide.')
  return multiplier
}

const WIN_LINES: ReadonlyArray<readonly number[]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function emptyBoard(): TicTacToeBoard {
  return [null, null, null, null, null, null, null, null, null]
}

export function otherMark(mark: TicTacToeMark): TicTacToeMark {
  return mark === 'X' ? 'O' : 'X'
}

export function winnerOf(board: TicTacToeBoard): { mark: TicTacToeMark; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark && mark === board[b] && mark === board[c]) {
      return { mark, line: [...line] }
    }
  }
  return null
}

export function isBoardFull(board: TicTacToeBoard): boolean {
  return board.every((cell) => cell !== null)
}

export function availableMoves(board: TicTacToeBoard): number[] {
  const moves: number[] = []
  board.forEach((cell, index) => {
    if (cell === null) moves.push(index)
  })
  return moves
}

export function applyMove(
  board: TicTacToeBoard,
  index: number,
  mark: TicTacToeMark,
): TicTacToeBoard {
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    throw new ValidationError('Case de jeu invalide.')
  }
  if (board[index] !== null) {
    throw new ConflictError('Cette case est déjà occupée.')
  }
  const next = [...board]
  next[index] = mark
  return next
}

/** Le joueur X commence toujours, conformément aux règles officielles. */
export function markToPlay(board: TicTacToeBoard): TicTacToeMark {
  const xCount = board.filter((cell) => cell === 'X').length
  const oCount = board.filter((cell) => cell === 'O').length
  return xCount === oCount ? 'X' : 'O'
}

export function resultForBoard(board: TicTacToeBoard): TicTacToeResult {
  const win = winnerOf(board)
  if (win) return { status: 'won', winner: win.mark, line: win.line }
  if (isBoardFull(board)) return { status: 'draw', winner: null, line: null }
  return { status: 'playing', winner: null, line: null }
}

interface SearchOptions {
  aiMark: TicTacToeMark
  humanMark: TicTacToeMark
  maxDepth: number | null
}

function terminalScore(
  board: TicTacToeBoard,
  options: SearchOptions,
  depth: number,
): number | null {
  const win = winnerOf(board)
  if (win) return win.mark === options.aiMark ? 10 - depth : depth - 10
  if (isBoardFull(board)) return 0
  return null
}

function minimax(
  board: TicTacToeBoard,
  options: SearchOptions,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const terminal = terminalScore(board, options, depth)
  if (terminal !== null) return terminal
  if (options.maxDepth !== null && depth >= options.maxDepth) return 0

  const maximizing = markToPlay(board) === options.aiMark
  const moves = availableMoves(board)

  if (maximizing) {
    let best = Number.NEGATIVE_INFINITY
    let localAlpha = alpha
    for (const move of moves) {
      const next = [...board]
      next[move] = options.aiMark
      const score = minimax(next, options, depth + 1, localAlpha, beta)
      if (score > best) best = score
      if (score > localAlpha) localAlpha = score
      if (beta <= localAlpha) break
    }
    return best
  }

  let best = Number.POSITIVE_INFINITY
  let localBeta = beta
  for (const move of moves) {
    const next = [...board]
    next[move] = options.humanMark
    const score = minimax(next, options, depth + 1, alpha, localBeta)
    if (score < best) best = score
    if (score < localBeta) localBeta = score
    if (localBeta <= alpha) break
  }
  return best
}

/** Tous les coups qui atteignent le meilleur score pour l'IA. */
export function bestMoves(
  board: TicTacToeBoard,
  aiMark: TicTacToeMark,
  maxDepth: number | null = null,
): number[] {
  if (winnerOf(board) || isBoardFull(board)) return []
  if (markToPlay(board) !== aiMark) {
    throw new ConflictError("Ce n'est pas le tour de l'IA.")
  }

  const options: SearchOptions = { aiMark, humanMark: otherMark(aiMark), maxDepth }
  const moves = availableMoves(board)
  let bestScore = Number.NEGATIVE_INFINITY
  let selected: number[] = []

  for (const move of moves) {
    const next = [...board]
    next[move] = aiMark
    const score = minimax(next, options, 1, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
    if (score > bestScore) {
      bestScore = score
      selected = [move]
    } else if (score === bestScore) {
      selected.push(move)
    }
  }

  return selected
}

function pickIndex(count: number, random: () => number): number {
  const unit = random()
  const clamped = Number.isFinite(unit) ? Math.min(0.999999, Math.max(0, unit)) : 0
  return Math.floor(clamped * count)
}

/**
 * Choisit un coup selon le niveau annoncé.
 * - expert : Minimax complet ;
 * - intermédiaire : profondeur limitée à 4 demi-coups ;
 * - débutant : coup aléatoire dans 60 % des cas, sinon profondeur 1.
 * Les coups équivalents sont variés par tirage aléatoire, jamais rabaissés.
 */
export function chooseAiMove(
  board: TicTacToeBoard,
  aiMark: TicTacToeMark,
  level: TicTacToeLevel,
  random: () => number,
): number {
  if (winnerOf(board) || isBoardFull(board)) {
    throw new ConflictError('La partie est terminée : l’IA ne joue plus.')
  }
  const moves = availableMoves(board)
  if (moves.length === 0) throw new ConflictError('Aucun coup disponible.')
  if (markToPlay(board) !== aiMark) throw new ConflictError("Ce n'est pas le tour de l'IA.")
  if (!TIC_TAC_TOE_LEVELS.includes(level)) throw new ValidationError('Niveau de jeu invalide.')

  if (level === 'beginner' && random() < 0.6) {
    return moves[pickIndex(moves.length, random)]
  }

  const depth = level === 'expert' ? null : level === 'intermediate' ? 4 : 1
  const candidates = bestMoves(board, aiMark, depth)
  return candidates[pickIndex(candidates.length, random)]
}

export interface CreateGameInput {
  id: string
  userId: string
  level: TicTacToeLevel
  startedAt: string
  humanMark?: TicTacToeMark
  /** Mise engagée (0 = partie découverte). */
  stake?: number
  /** Cote convenue avant la partie. Immuable une fois la partie créée. */
  multiplier?: number
}

export function createTicTacToeGame(input: CreateGameInput): TicTacToeGame {
  if (!TIC_TAC_TOE_LEVELS.includes(input.level)) {
    throw new ValidationError('Niveau de jeu invalide.')
  }
  if (Number.isNaN(Date.parse(input.startedAt))) {
    throw new ValidationError('La date de début de partie est invalide.')
  }
  const humanMark = input.humanMark ?? 'X'
  const stake = input.stake ?? 0
  if (!Number.isFinite(stake) || stake < 0) {
    throw new ValidationError('La mise de la partie est invalide.')
  }
  const multiplier = input.multiplier ?? multiplierForLevel(input.level)
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100) {
    throw new ValidationError('La cote de la partie est invalide.')
  }
  const board = emptyBoard()
  const result: TicTacToeResult = { status: 'playing', winner: null, line: null }
  return Object.freeze({
    id: validateId(input.id, 'Identifiant de partie'),
    userId: validateId(input.userId, 'Identifiant utilisateur'),
    board,
    humanMark,
    aiMark: otherMark(humanMark),
    level: input.level,
    status: 'playing',
    currentTurn: 'X',
    result,
    startedAt: input.startedAt,
    endedAt: null,
    lastAiMove: null,
    moveCount: 0,
    stake,
    multiplier,
    payout: 0,
    pnl: null,
    settledAt: null,
    demo: true,
  })
}

function finalizeIfFinished(game: TicTacToeGame, at: string): TicTacToeGame {
  const result = resultForBoard(game.board)
  if (result.status === 'playing') return game
  return Object.freeze({
    ...game,
    status: result.status,
    currentTurn: game.currentTurn,
    result,
    endedAt: at,
  })
}

/** Joue uniquement le tour de l'IA (utile quand l'IA commence avec X). */
export function playAiMove(
  game: TicTacToeGame,
  at: string,
  random: () => number,
): TicTacToeGame {
  if (game.status !== 'playing') {
    throw new ConflictError('La partie est terminée.')
  }
  if (game.currentTurn !== game.aiMark) {
    throw new ConflictError("Ce n'est pas le tour de l'IA.")
  }
  if (Number.isNaN(Date.parse(at))) throw new ValidationError('Horodatage invalide.')

  const aiIndex = chooseAiMove(game.board, game.aiMark, game.level, random)
  const aiBoard = applyMove(game.board, aiIndex, game.aiMark)
  return finalizeIfFinished(
    {
      ...game,
      board: aiBoard,
      moveCount: game.moveCount + 1,
      currentTurn: game.humanMark,
      lastAiMove: aiIndex,
    },
    at,
  )
}

/**
 * Joue un coup humain puis la réponse de l'IA (si la partie continue).
 * Le niveau reste celui choisi à la création : il n'est jamais modifié.
 */
export function playHumanMove(
  game: TicTacToeGame,
  index: number,
  at: string,
  random: () => number,
): TicTacToeGame {
  if (game.status !== 'playing') {
    throw new ConflictError('La partie est terminée.')
  }
  if (game.currentTurn !== game.humanMark) {
    throw new ConflictError("Ce n'est pas votre tour.")
  }
  if (Number.isNaN(Date.parse(at))) throw new ValidationError('Horodatage invalide.')

  const humanBoard = applyMove(game.board, index, game.humanMark)
  const afterHuman = finalizeIfFinished(
    {
      ...game,
      board: humanBoard,
      moveCount: game.moveCount + 1,
      currentTurn: game.aiMark,
      lastAiMove: game.lastAiMove,
    },
    at,
  )
  if (afterHuman.status !== 'playing') return afterHuman

  const aiIndex = chooseAiMove(afterHuman.board, afterHuman.aiMark, afterHuman.level, random)
  const aiBoard = applyMove(afterHuman.board, aiIndex, afterHuman.aiMark)
  return finalizeIfFinished(
    {
      ...afterHuman,
      board: aiBoard,
      moveCount: afterHuman.moveCount + 1,
      currentTurn: afterHuman.humanMark,
      lastAiMove: aiIndex,
    },
    at,
  )
}

/** Marque une partie comme réglée, une seule fois. Idempotent. */
export function settleTicTacToeGame(game: TicTacToeGame, at: string): TicTacToeGame {
  if (game.settledAt) return game
  if (game.status === 'playing') {
    throw new ConflictError('La partie ne peut pas être réglée avant sa fin.')
  }
  return Object.freeze({ ...game, settledAt: at })
}
