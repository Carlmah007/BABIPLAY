import { useStore } from '../lib/store'
import { createStore } from '../lib/store'
import { tradingService } from '../services/tradingService'
import type { MarketQuote, TradingPosition } from '../types/trading'

interface TradingState {
  userId: string | null
  quotes: MarketQuote[]
  positions: TradingPosition[]
  selectedSymbol: MarketQuote['symbol']
  loading: boolean
}

const store = createStore<TradingState>({
  userId: null,
  quotes: [],
  positions: [],
  selectedSymbol: 'BTC',
  loading: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  const quotes = tradingService.getQuotes()
  const positions = tradingService.listPositions(state.userId, 50)
  store.setState({ ...state, quotes, positions, loading: false })
}

tradingService.subscribe(refresh)

export const tradingStore = {
  subscribe: store.subscribe,
  getState: store.getState,
  useQuotes(): MarketQuote[] {
    return useStore(store).quotes
  },
  usePositions(): TradingPosition[] {
    return useStore(store).positions
  },
  useSelectedSymbol(): MarketQuote['symbol'] {
    return useStore(store).selectedSymbol
  },
  setSelectedSymbol(symbol: MarketQuote['symbol']): void {
    store.setState({ ...store.getState(), selectedSymbol: symbol })
  },
  setUser(userId: string | null): void {
    if (!userId) {
      store.setState({
        userId: null,
        quotes: [],
        positions: [],
        selectedSymbol: 'BTC',
        loading: false,
      })
      return
    }
    if (store.getState().userId === userId) {
      refresh()
      return
    }
    store.setState({ userId, quotes: [], positions: [], selectedSymbol: 'BTC', loading: true })
    refresh()
  },
  refresh,
  open(input: Parameters<typeof tradingService.openPosition>[0]): TradingPosition {
    const position = tradingService.openPosition(input)
    refresh()
    return position
  },
  close(positionId: string): ReturnType<typeof tradingService.closePosition> {
    const userId = store.getState().userId
    if (!userId) throw new Error('Utilisateur non connecté.')
    const result = tradingService.closePosition(userId, positionId)
    refresh()
    return result
  },
  sync(): ReturnType<typeof tradingService.syncPositions> {
    const userId = store.getState().userId
    if (!userId) return []
    const result = tradingService.syncPositions(userId)
    refresh()
    return result
  },
}
