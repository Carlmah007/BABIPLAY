import { useSyncExternalStore } from 'react'

export type Listener = () => void
export type Updater<T> = T | ((previous: T) => T)

export interface Store<T> {
  getState: () => T
  setState: (updater: Updater<T>) => void
  subscribe: (listener: Listener) => () => void
}

/** Store observable minimal, compatible avec useSyncExternalStore. */
export function createStore<T>(initialState: T): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  const getState = () => state

  const setState = (updater: Updater<T>) => {
    const next =
      typeof updater === 'function'
        ? (updater as (previous: T) => T)(state)
        : updater
    if (Object.is(next, state)) return
    state = next
    listeners.forEach((listener) => listener())
  }

  const subscribe = (listener: Listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { getState, setState, subscribe }
}

/** Abonne un composant React à un store. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
