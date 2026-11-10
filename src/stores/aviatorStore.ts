import { useStore } from '../lib/store'
import { createStore } from '../lib/store'
import { aviatorService } from '../services/aviatorService'
import type { AviatorRound } from '../types/games'

interface AviatorState {
  userId: string | null
  activeRound: AviatorRound | null
  history: AviatorRound[]
  loading: boolean
}

const store = createStore<AviatorState>({
  userId: null,
  activeRound: null,
  history: [],
  loading: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  const active = aviatorService.getActiveRound(state.userId)
  const history = aviatorService.listHistory(state.userId, 20)
  store.setState({ ...state, activeRound: active, history, loading: false })
}

aviatorService.subscribe(refresh)

export const aviatorStore = {
  subscribe: store.subscribe,
  getState: store.getState,
  useActiveRound(): AviatorRound | null {
    return useStore(store).activeRound
  },
  useHistory(): AviatorRound[] {
    return useStore(store).history
  },
  useLoading(): boolean {
    return useStore(store).loading
  },
  setUser(userId: string | null): void {
    if (!userId) {
      store.setState({ userId: null, activeRound: null, history: [], loading: false })
      return
    }
    if (store.getState().userId === userId) {
      refresh()
      return
    }
    store.setState({ userId, activeRound: null, history: [], loading: true })
    refresh()
  },
  refresh,
  start(stake: number): AviatorRound {
    const userId = store.getState().userId
    if (!userId) throw new Error('Utilisateur non connecté.')
    const round = aviatorService.startRound(userId, stake)
    refresh()
    return round
  },
  cashout(at?: string): ReturnType<typeof aviatorService.cashout> {
    const userId = store.getState().userId
    const round = store.getState().activeRound
    if (!userId || !round) throw new Error('Aucune manche active.')
    const result = aviatorService.cashout(userId, round.roundId, at)
    refresh()
    return result
  },
}
