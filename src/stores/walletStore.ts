import { useStore } from '../lib/store'
import { createStore } from '../lib/store'
import { walletService } from '../services/walletService'
import type { LedgerMovement, MovementInput, WalletSummary } from '../types/wallet'

interface WalletState {
  userId: string | null
  summary: WalletSummary
  movements: LedgerMovement[]
  committedBalance: number
  ready: boolean
}

function emptySummary(userId: string | null): WalletSummary {
  return {
    userId: userId ?? '',
    currency: 'BABI',
    availableBalance: 0,
    committedBalance: 0,
    totalGains: 0,
    totalLosses: 0,
    operationCount: 0,
    lastMovementAt: null,
  }
}

const store = createStore<WalletState>({
  userId: null,
  summary: emptySummary(null),
  movements: [],
  committedBalance: 0,
  ready: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  const movements = walletService.getMovements(state.userId)
  store.setState({
    ...state,
    movements,
    summary: walletService.getSummary(state.userId, state.committedBalance),
    ready: true,
  })
}

walletService.subscribe(refresh)

export const walletStore = {
  subscribe: store.subscribe,
  getState: store.getState,

  useSummary(): WalletSummary {
    return useStore(store).summary
  },

  useMovements(): LedgerMovement[] {
    return useStore(store).movements
  },

  useReady(): boolean {
    return useStore(store).ready
  },

  useUserId(): string | null {
    return useStore(store).userId
  },

  setUser(userId: string | null): void {
    if (store.getState().userId === userId && store.getState().ready) {
      refresh()
      return
    }
    if (!userId) {
      store.setState({
        userId: null,
        summary: emptySummary(null),
        movements: [],
        committedBalance: 0,
        ready: false,
      })
      return
    }
    walletService.ensureInitialBalance(userId)
    store.setState({
      userId,
      summary: emptySummary(userId),
      movements: [],
      committedBalance: 0,
      ready: false,
    })
    refresh()
  },

  setCommittedBalance(amount: number): void {
    const next = Math.max(0, Math.round(amount))
    if (store.getState().committedBalance === next) return
    store.setState({ ...store.getState(), committedBalance: next })
    refresh()
  },

  refresh,

  apply(input: MovementInput): LedgerMovement {
    const movement = walletService.apply(input)
    refresh()
    return movement
  },

  debit(input: Omit<MovementInput, 'direction'>): LedgerMovement {
    const movement = walletService.debit(input)
    refresh()
    return movement
  },

  credit(input: Omit<MovementInput, 'direction'>): LedgerMovement {
    const movement = walletService.credit(input)
    refresh()
    return movement
  },

  mark(input: Omit<MovementInput, 'direction' | 'amount'>): LedgerMovement {
    const movement = walletService.mark(input)
    refresh()
    return movement
  },
}
