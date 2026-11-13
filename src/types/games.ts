/**
 * Contrats communs aux jeux BabiPlay.
 *
 * Tous les moteurs de jeu partagent la même machine d'état :
 * created → started → running → completed → settled
 * (ou cancelled). Une partie terminée ne peut plus être modifiée.
 */

export type GameKind = 'aviator' | 'trading' | 'tic_tac_toe'

export type GameState = 'created' | 'started' | 'running' | 'completed' | 'settled' | 'cancelled'

/** Alias conservé pour la validation existante. */
export type AviatorStatus = GameState

/** Engagement public d'une manche : ne contient jamais le seed serveur. */
export interface RoundCommitment {
  game: GameKind
  roundId: string
  serverSeedHash: string
  nonce: string
  createdAt: string
}

export interface AviatorRound extends RoundCommitment {
  game: 'aviator'
  userId: string
  stake: number
  status: GameState
  /** Point de crash décidé avant la manche, jamais recalculé. */
  crashPoint: number
  /** Vitesse de croissance exponentielle du multiplicateur (par seconde). */
  growthRate: number
  /** Intervalle d'affichage variable, purement visuel. */
  tickMs: number
  /** Délai variable avant la manche suivante. */
  nextRoundDelayMs: number
  startedAt: string
  /** Durée serveur calculée à partir du crashPoint et de la croissance. */
  crashElapsedMs: number
  endedAt: string | null
  cashedOutAt: string | null
  cashoutMultiplier: number | null
  payout: number
  pnl: number | null
  settledAt: string | null
  demo: true
  /** Présent si la manche a été lancée pendant un boost programmé. */
  boosted?: { multiplier: number; maxWin: number; label: string }
}

export type TicTacToeMark = 'X' | 'O'
export type TicTacToeCell = TicTacToeMark | null
export type TicTacToeBoard = TicTacToeCell[]
export type TicTacToeLevel = 'beginner' | 'intermediate' | 'expert'
export type TicTacToeStatus = 'playing' | 'won' | 'draw'

export interface TicTacToeResult {
  status: TicTacToeStatus
  winner: TicTacToeMark | null
  line: number[] | null
}

export interface TicTacToeGame {
  id: string
  userId: string
  board: TicTacToeBoard
  humanMark: TicTacToeMark
  aiMark: TicTacToeMark
  level: TicTacToeLevel
  status: TicTacToeStatus
  currentTurn: TicTacToeMark
  result: TicTacToeResult
  startedAt: string
  endedAt: string | null
  lastAiMove: number | null
  moveCount: number
  /** Mise engagée à la création (0 = partie découverte). */
  stake: number
  /** Cote convenue à la création : gain brut = mise × cote en cas de victoire. */
  multiplier: number
  /** Total rendu au joueur au règlement (mise incluse). */
  payout: number
  /** Gain net : payout - stake, null tant que la partie n'est pas réglée. */
  pnl: number | null
  /** Renseigné une seule fois à la finalisation (idempotence). */
  settledAt: string | null
  demo: true
}
