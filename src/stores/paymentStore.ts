import { createStore, useStore } from '../lib/store'
import { paymentService } from '../services/paymentService'
import type { AppUser } from '../types/auth'
import type { PaymentIntent, WithdrawalMethod } from '../types/payments'

interface PaymentState {
  userId: string | null
  intents: PaymentIntent[]
  pending: PaymentIntent[]
  reserved: number
  available: number
  ready: boolean
}

const store = createStore<PaymentState>({
  userId: null,
  intents: [],
  pending: [],
  reserved: 0,
  available: 0,
  ready: false,
})

function refresh(): void {
  const state = store.getState()
  if (!state.userId) return
  store.setState({
    ...state,
    intents: paymentService.list(state.userId),
    pending: paymentService.listPendingWithdrawals().filter((intent) => intent.userId === state.userId),
    reserved: paymentService.reservedAmount(state.userId),
    available: paymentService.availableToWithdraw(state.userId),
    ready: true,
  })
}

paymentService.subscribe(refresh)

export const paymentStore = {
  subscribe: store.subscribe,
  getState: store.getState,

  useIntents(): PaymentIntent[] {
    return useStore(store).intents
  },

  usePending(): PaymentIntent[] {
    return useStore(store).pending
  },

  useReserved(): number {
    return useStore(store).reserved
  },

  useAvailable(): number {
    return useStore(store).available
  },

  useReady(): boolean {
    return useStore(store).ready
  },

  setUser(userId: string | null): void {
    if (store.getState().userId === userId && store.getState().ready) {
      refresh()
      return
    }
    if (!userId) {
      store.setState({
        userId: null,
        intents: [],
        pending: [],
        reserved: 0,
        available: 0,
        ready: false,
      })
      return
    }
    store.setState({ userId, intents: [], pending: [], reserved: 0, available: 0, ready: true })
    refresh()
  },

  refresh,

  deposit(actor: AppUser, amount: number, method: WithdrawalMethod = 'mobile_money'): PaymentIntent {
    const intent = paymentService.requestDeposit(actor, {
      amount,
      method,
      idempotencyKey: `client:deposit:${actor.id}:${Date.now()}`,
    })
    refresh()
    return intent
  },

  withdraw(
    actor: AppUser,
    amount: number,
    destination: string,
    method: WithdrawalMethod,
    conditionsAccepted: boolean,
  ): PaymentIntent {
    const intent = paymentService.requestWithdrawal(actor, {
      amount,
      destination,
      method,
      conditionsAccepted,
      idempotencyKey: `client:withdrawal:${actor.id}:${Date.now()}`,
    })
    refresh()
    return intent
  },

  cancel(actor: AppUser, intentId: string): PaymentIntent {
    const intent = paymentService.cancelWithdrawal(actor, intentId)
    refresh()
    return intent
  },

  approve(actor: AppUser, intentId: string, justification: string): PaymentIntent {
    const intent = paymentService.approveWithdrawal(actor, intentId, justification)
    refresh()
    return intent
  },

  reject(actor: AppUser, intentId: string, justification: string): PaymentIntent {
    const intent = paymentService.rejectWithdrawal(actor, intentId, justification)
    refresh()
    return intent
  },
}
