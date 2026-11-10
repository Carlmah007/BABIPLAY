import { createStore, useStore } from '../lib/store'
import { miningService } from '../services/miningService'
import type { AppUser } from '../types/auth'
import type { MiningSnapshot, MiningWithdrawal, MiningWithdrawalQuote } from '../types/mining'

interface MiningState {
  userId: string | null
  snapshot: MiningSnapshot | null
  quote: MiningWithdrawalQuote | null
  loading: boolean
}

const store = createStore<MiningState>({
  userId: null,
  snapshot: null,
  quote: null,
  loading: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  store.setState({
    ...state,
    snapshot: miningService.getSnapshot(state.userId),
    quote: miningService.getQuote(state.userId),
    loading: false,
  })
}

miningService.subscribe(refresh)

export const miningStore = {
  subscribe: store.subscribe,
  getState: store.getState,

  useSnapshot(): MiningSnapshot | null {
    return useStore(store).snapshot
  },

  useQuote(): MiningWithdrawalQuote | null {
    return useStore(store).quote
  },

  useLoading(): boolean {
    return useStore(store).loading
  },

  setUser(userId: string | null): void {
    if (!userId) {
      store.setState({ userId: null, snapshot: null, quote: null, loading: false })
      return
    }
    if (store.getState().userId === userId) {
      refresh()
      return
    }
    store.setState({ userId, snapshot: null, quote: null, loading: true })
    refresh()
  },

  refresh,

  start(actor: AppUser): MiningSnapshot {
    const snapshot = miningService.startMining(actor)
    refresh()
    return snapshot
  },

  stop(actor: AppUser): MiningSnapshot {
    const snapshot = miningService.stopMining(actor)
    refresh()
    return snapshot
  },

  setMachineRunning(actor: AppUser, machineId: string, running: boolean): MiningSnapshot {
    const snapshot = miningService.setMachineRunning(actor, machineId, running)
    refresh()
    return snapshot
  },

  purchase(actor: AppUser, modelId: string): MiningSnapshot {
    const snapshot = miningService.purchaseMachine(actor, modelId)
    refresh()
    return snapshot
  },

  withdraw(actor: AppUser): MiningWithdrawal {
    const withdrawal = miningService.withdraw(actor)
    refresh()
    return withdrawal
  },
}
