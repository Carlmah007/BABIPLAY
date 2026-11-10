import { describe, expect, it } from 'vitest'
import {
  bestMoves,
  chooseAiMove,
  createTicTacToeGame,
  emptyBoard,
} from '../../features/tic-tac-toe/engine'
import { createTicTacToeService } from '../../services/tictactoeService'
import { createGameSettlementService } from '../../services/gameSettlementService'
import { createWalletService } from '../../services/walletService'
import { MemoryStorageAdapter } from '../../lib/storage'
import { createDeterministicRandomSource } from '../../services/gameRandomnessService'
import { ConflictError, PermissionError } from '../../lib/errors'
import type { TicTacToeBoard } from '../../types/games'

const USER = 'demo-player'

describe('Tic-Tac-Toe — Minimax', () => {
  it('choisit toujours un coup gagnant immédiat lorsqu’il existe', () => {
    const board: TicTacToeBoard = ['O', 'O', null, 'X', 'X', null, 'X', null, null]
    const moves = bestMoves(board, 'O', null)
    expect(moves).toContain(2)
  })

  it('bloque toujours une victoire immédiate du joueur', () => {
    const board: TicTacToeBoard = ['X', 'X', null, 'O', null, null, null, null, null]
    const moves = bestMoves(board, 'O', null)
    expect(moves).toContain(2)
  })

  it('varie entre des coups strictement équivalents', () => {
    const board = emptyBoard()
    expect(bestMoves(board, 'X', null).length).toBeGreaterThan(1)
    const picked = new Set(
      [0, 0.25, 0.5, 0.75, 0.999].map((unit) =>
        chooseAiMove(board, 'X', 'expert', () => unit),
      ),
    )
    expect(picked.size).toBeGreaterThan(1)
  })

  it('ne joue jamais sur une case occupée', () => {
    const board: TicTacToeBoard = ['X', null, 'O', null, 'X', null, null, null, null]
    for (const unit of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      const move = chooseAiMove(board, 'O', 'expert', () => unit)
      expect(board[move]).toBeNull()
    }
  })

  it('ne joue jamais après la fin de la partie', () => {
    const finished: TicTacToeBoard = ['X', 'X', 'X', 'O', 'O', null, null, null, null]
    expect(() => chooseAiMove(finished, 'O', 'expert', () => 0.5)).toThrow(ConflictError)
  })

  it('respecte le niveau annoncé sans jamais le modifier', () => {
    const game = createTicTacToeGame({
      id: 'ttt_engine_level_001',
      userId: USER,
      level: 'expert',
      startedAt: '2026-01-01T12:00:00.000Z',
    })
    expect(game.level).toBe('expert')
    expect(game.currentTurn).toBe('X')
  })
})

function setup() {
  const storage = new MemoryStorageAdapter()
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 0, 1, 12, 0, 0, tick++)).toISOString()
  const wallet = createWalletService({ storage, now, initialBalance: 50_000 })
  const settlement = createGameSettlementService({ storage, now, wallet })
  const random = createDeterministicRandomSource(`ttt-test-${tick}`)
  const game = createTicTacToeService({ storage, now, wallet, settlement, random })
  return { storage, wallet, settlement, game }
}

describe('Tic-Tac-Toe — service de partie', () => {
  it('crée des identifiants uniques et peut faire commencer le joueur ou l’IA', () => {
    const { game } = setup()
    const first = game.createGame({ userId: 'player-one', level: 'expert', humanMark: 'X' })
    const second = game.createGame({ userId: 'player-two', level: 'expert', humanMark: 'O' })
    expect(first.id).not.toBe(second.id)
    expect(first.currentTurn).toBe('X')
    expect(second.moveCount).toBe(1)
    expect(second.board.filter((cell) => cell === 'X')).toHaveLength(1)
    expect(second.currentTurn).toBe('O')
  })

  it('conserve le niveau choisi pendant toute la partie et règle une seule fois', () => {
    const { game, wallet, settlement } = setup()
    let current = game.createGame({
      userId: USER,
      level: 'expert',
      humanMark: 'X',
    })
    expect(current.level).toBe('expert')

    let result = game.playMove(USER, current.id, 4)
    current = result.game
    let guard = 0
    while (current.status === 'playing' && guard < 9) {
      guard += 1
      const empty = current.board.findIndex((cell) => cell === null)
      result = game.playMove(USER, current.id, empty)
      current = result.game
      expect(current.level).toBe('expert')
    }

    expect(current.status).not.toBe('playing')
    expect(current.settledAt).not.toBeNull()
    expect(result.settlement?.alreadySettled).toBe(false)
    expect(settlement.list(USER)).toHaveLength(1)
    expect(wallet.getMovements(USER)).toHaveLength(0)

    const again = game.finalizeGame(USER, current.id)
    expect(again.settlement?.alreadySettled).toBe(true)
    expect(again.settlement?.id).toBe(result.settlement?.id)
    expect(settlement.list(USER)).toHaveLength(1)
    expect(() => game.playMove(USER, current.id, 0)).toThrow(ConflictError)
  })

  it('débite la mise à la création et rend le gain au règlement', () => {
    const { game, wallet } = setup()
    let current = game.createGame({ userId: USER, level: 'beginner', humanMark: 'X', stake: 500 })
    expect(current.stake).toBe(500)
    expect(current.multiplier).toBe(1.5)
    expect(current.payout).toBe(0)
    expect(wallet.getBalance(USER)).toBe(49_500)

    let settlement: ReturnType<typeof game.playMove>['settlement'] = null
    let guard = 0
    while (current.status === 'playing' && guard < 9) {
      guard += 1
      const empty = current.board.findIndex((cell) => cell === null)
      const result = game.playMove(USER, current.id, empty)
      current = result.game
      settlement = result.settlement
    }

    expect(current.status).not.toBe('playing')
    expect(settlement?.stake).toBe(500)
    expect(current.payout).toBe(settlement?.payout)
    if (current.status === 'won' && current.result.winner === current.humanMark) {
      expect(settlement?.payout).toBe(750)
      expect(settlement?.pnl).toBe(250)
    }
    if (current.status === 'draw') {
      expect(settlement?.payout).toBe(500)
      expect(settlement?.pnl).toBe(0)
    }
    if (current.status === 'won' && current.result.winner !== current.humanMark) {
      expect(settlement?.payout).toBe(0)
      expect(settlement?.pnl).toBe(-500)
    }
    expect(wallet.getBalance(USER)).toBe(50_000 - 500 + (settlement?.payout ?? 0))
  })

  it('applique les bornes de mise et refuse une mise hors limites', () => {
    const { game } = setup()
    expect(() =>
      game.createGame({ userId: USER, level: 'beginner', humanMark: 'X', stake: 5 }),
    ).toThrow()
    expect(() =>
      game.createGame({ userId: USER, level: 'beginner', humanMark: 'X', stake: 10_001 }),
    ).toThrow()
  })

  it('refuse deux parties simultanées et protège la propriété de la partie', () => {
    const { game } = setup()
    const created = game.createGame({ userId: USER, level: 'beginner', humanMark: 'X' })
    expect(() =>
      game.createGame({ userId: USER, level: 'expert', humanMark: 'X' }),
    ).toThrow(ConflictError)
    expect(() => game.playMove('other-player', created.id, 0)).toThrow(PermissionError)
  })

  it('ne joue jamais sur une case occupée côté service', () => {
    const { game } = setup()
    const created = game.createGame({ userId: USER, level: 'expert', humanMark: 'X' })
    game.playMove(USER, created.id, 0)
    const after = game.getGame(created.id)
    expect(after?.board[0]).toBe('X')
    expect(() => game.playMove(USER, created.id, 0)).toThrow(ConflictError)
  })
})
