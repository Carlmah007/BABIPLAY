import { APP_CONFIG } from '../config/appConfig'
import { ValidationError } from '../lib/errors'
import { createStore, useStore } from '../lib/store'
import { storage } from '../lib/storage'
import { isSupabaseConfigured } from '../lib/supabase'
import { authService } from '../services/authService'
import {
  getStoredSession,
  onAuthChange,
  signInWithEmail,
  signOutSupabase,
  signUpWithEmail,
} from '../services/supabaseAuthService'
import type { AppUser, RegisterInput, Role, Session } from '../types/auth'

const SESSION_KEY = 'session'
const SUPABASE_MODE = isSupabaseConfigured()

interface AuthState {
  session: Session | null
  ready: boolean
}

function loadLocalSession(): Session | null {
  const stored = storage.get<Session>(SESSION_KEY)
  if (!stored || typeof stored.token !== 'string' || !stored.user) return null
  const refreshed = authService.refreshSession(stored)
  if (!refreshed) {
    storage.remove(SESSION_KEY)
    return null
  }
  return refreshed
}

function persistLocalSession(session: Session | null): void {
  if (session) storage.set(SESSION_KEY, session)
  else storage.remove(SESSION_KEY)
}

const store = createStore<AuthState>({
  session: SUPABASE_MODE ? null : loadLocalSession(),
  ready: !SUPABASE_MODE,
})

function setSession(session: Session | null): void {
  if (!SUPABASE_MODE) persistLocalSession(session)
  store.setState({ session, ready: true })
}

async function syncSupabaseSession(): Promise<void> {
  try {
    setSession(await getStoredSession())
  } catch {
    setSession(null)
  }
}

if (SUPABASE_MODE) {
  void syncSupabaseSession()
  onAuthChange(() => {
    void syncSupabaseSession()
  })
} else {
  authService.subscribe(() => {
    const current = store.getState().session
    if (!current) return
    const refreshed = authService.refreshSession(current)
    if (!refreshed) {
      setSession(null)
      return
    }
    if (
      refreshed.user.role !== current.user.role ||
      refreshed.user.status !== current.user.status
    ) {
      setSession(refreshed)
    }
  })
}

export const authStore = {
  getState: store.getState,
  subscribe: store.subscribe,

  useSession(): Session | null {
    return useStore(store).session
  },

  useReady(): boolean {
    return useStore(store).ready
  },

  getUser(): AppUser | null {
    return store.getState().session?.user ?? null
  },

  isDemo(): boolean {
    if (SUPABASE_MODE) return false
    return APP_CONFIG.mode === 'demo' || Boolean(store.getState().session?.user.demo)
  },

  signInDemo(role: Role = 'player'): Session {
    if (SUPABASE_MODE) {
      throw new ValidationError(
        'La connexion de démonstration est désactivée : utilise ton compte Supabase.',
      )
    }
    const session = authService.createDemoSession(role)
    setSession(session)
    return session
  },

  async signIn(email: string, password: string): Promise<Session> {
    const session = SUPABASE_MODE
      ? await signInWithEmail(email, password)
      : await authService.login(email, password)
    setSession(session)
    return session
  },

  async register(input: RegisterInput): Promise<Session> {
    const session = SUPABASE_MODE
      ? await signUpWithEmail(input)
      : await authService.register(input)
    setSession(session)
    return session
  },

  signOut(): void {
    setSession(null)
    if (SUPABASE_MODE) void signOutSupabase()
  },

  refreshSession(): void {
    if (SUPABASE_MODE) {
      void syncSupabaseSession()
      return
    }
    const current = store.getState().session
    if (!current) return
    setSession(authService.refreshSession(current))
  },

  setSession,
}
