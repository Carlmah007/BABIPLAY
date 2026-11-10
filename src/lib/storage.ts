import { APP_CONFIG } from '../config/appConfig'

export interface StorageAdapter {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): void
  remove(key: string): void
}

function isBrowserStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const probe = '__babiplay_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Adaptateur localStorage préfixé et tolérant aux données corrompues. */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly prefix: string

  constructor(prefix: string = APP_CONFIG.storagePrefix) {
    this.prefix = prefix
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`
  }

  get<T>(key: string): T | null {
    if (!isBrowserStorageAvailable()) return null
    const raw = window.localStorage.getItem(this.fullKey(key))
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      window.localStorage.removeItem(this.fullKey(key))
      return null
    }
  }

  set<T>(key: string, value: T): void {
    if (!isBrowserStorageAvailable()) return
    window.localStorage.setItem(this.fullKey(key), JSON.stringify(value))
  }

  remove(key: string): void {
    if (!isBrowserStorageAvailable()) return
    window.localStorage.removeItem(this.fullKey(key))
  }
}

/** Adaptateur mémoire utilisé par les tests unitaires. */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, string>()

  get<T>(key: string): T | null {
    const raw = this.data.get(key)
    if (raw === undefined) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      this.data.delete(key)
      return null
    }
  }

  set<T>(key: string, value: T): void {
    this.data.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.data.delete(key)
  }

  clear(): void {
    this.data.clear()
  }
}

export const storage = new LocalStorageAdapter()
