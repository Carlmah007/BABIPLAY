import { useStore } from '../lib/store'
import { createStore } from '../lib/store'
import { ticTacToeService } from '../services/tictactoeService'
import type { TicTacToeGame, TicTacToeLevel } from '../types/games'

interface TicTacToeState {
  userId: string | null
  activeGame: TicTacToeGame | null
  history: TicTacToeGame[]
  loading: boolean
}

const store = createStore<TicTacToeState>({
  userId: null,
  activeGame: null,
  history: [],
  loading: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  const active = ticTacToeService.getActiveGame(state.userId)
  const history = ticTacToeService.listHistory(state.userId, 20)
  store.setState({ ...state, activeGame: active, history, loading: false })
}

ticTacToeService.subscribe(refresh)

export const ticTacToeStore = {
  subscribe: store.subscribe,
  getState: store.getState,
  useActiveGame(): TicTacToeGame | null {
    return useStore(store).activeGame
  },
  useHistory(): TicTacToeGame[] {
    return useStore(store).history
  },
  setUser(userId: string | null): void {
    if (!userId) {
      store.setState({ userId: null, activeGame: null, history: [], loading: false })
      return
    }
    if (store.getState().userId === userId) {
      refresh()
      return
    }
    store.setState({ userId, activeGame: null, history: [], loading: true })
    refresh()
  },
  refresh,
  create(level: TicTacToeLevel, humanMark?: 'X' | 'O', stake?: number): TicTacToeGame {
    const userId = store.getState().userId
    if (!userId) throw new Error('Utilisateur non connecté.')
    const game = ticTacToeService.createGame({ userId, level, humanMark, stake })
    refresh()
    return game
  },
  play(cell: number): ReturnType<typeof ticTacToeService.playMove> {
    const userId = store.getState().userId
    const game = store.getState().activeGame
    if (!userId || !game) throw new Error('Aucune partie active.')
    const result = ticTacToeService.playMove(userId, game.id, cell)
    refresh()
    return result
  },
  abandon(): void {
    const userId = store.getState().userId
    if (!userId) return
    ticTacToeService.abandonGame(userId)
    refresh()
  },
}
