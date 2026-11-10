import { useStore } from '../lib/store'
import { createStore } from '../lib/store'
import { notificationService } from '../services/notificationService'
import type { AppNotification } from '../types/notifications'

interface NotificationState {
  userId: string | null
  items: AppNotification[]
  loading: boolean
}

const store = createStore<NotificationState>({
  userId: null,
  items: [],
  loading: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  store.setState({ ...state, items: notificationService.list(state.userId), loading: false })
}

notificationService.subscribe(refresh)

export const notificationStore = {
  subscribe: store.subscribe,
  getState: store.getState,
  useItems(): AppNotification[] {
    return useStore(store).items
  },
  useUnreadCount(): number {
    return useStore(store).items.filter((item) => !item.read).length
  },
  setUser(userId: string | null): void {
    if (!userId) {
      store.setState({ userId: null, items: [], loading: false })
      return
    }
    if (store.getState().userId === userId) {
      refresh()
      return
    }
    store.setState({ userId, items: [], loading: true })
    refresh()
  },
  refresh,
  markRead(id: string): void {
    const userId = store.getState().userId
    if (!userId) return
    notificationService.markRead(id, userId)
    refresh()
  },
  markAllRead(): void {
    const userId = store.getState().userId
    if (!userId) return
    notificationService.markAllRead(userId)
    refresh()
  },
}
