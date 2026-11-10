import { ValidationError } from '../lib/errors'
import { getSupabase } from '../lib/supabase'
import type { Database } from '../types/database'
import type { AppUser, RegisterInput, Session } from '../types/auth'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

const FRIENDLY_ERRORS: { match: string; message: string }[] = [
  {
    match: 'email signups are disabled',
    message:
      'Les inscriptions par e-mail sont désactivées sur le serveur. Active-les dans Supabase : Authentication → Providers → Email.',
  },
  {
    match: 'email rate limit exceeded',
    message:
      'Trop de tentatives d’inscription. Désactive « Confirm email » dans Supabase (Authentication → Providers → Email) ou réessaie dans une heure.',
  },
  {
    match: 'email not confirmed',
    message: 'Ton adresse n’est pas encore confirmée : clique sur le lien reçu par e-mail.',
  },
  {
    match: 'invalid login credentials',
    message: 'E-mail ou mot de passe incorrect.',
  },
  {
    match: 'user already registered',
    message: 'Un compte existe déjà avec cette adresse e-mail.',
  },
  {
    match: 'rate limit exceeded',
    message: 'Trop de tentatives. Réessaie dans quelques minutes.',
  },
]

function friendlyError(message: string): string {
  const normalized = message.toLowerCase()
  const known = FRIENDLY_ERRORS.find((entry) => normalized.includes(entry.match))
  return known ? known.message : message
}

function toAppUser(profile: ProfileRow): AppUser {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role,
    status: profile.status,
    demo: false,
    createdAt: profile.created_at,
  }
}

function fallbackUser(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
): AppUser {
  const metadataName = metadata.display_name
  return {
    id: userId,
    email,
    displayName:
      typeof metadataName === 'string' && metadataName.trim().length > 0
        ? metadataName
        : email.split('@')[0] ?? 'Joueur',
    role: 'player',
    status: 'active',
    demo: false,
    createdAt: new Date().toISOString(),
  }
}

async function loadProfile(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
): Promise<AppUser> {
  const supabase = getSupabase()
  if (!supabase) throw new ValidationError("Supabase n'est pas configuré.")
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return fallbackUser(userId, email, metadata)
  return toAppUser(data)
}

function toSession(
  accessToken: string,
  userId: string,
  user: AppUser,
  createdAt: string,
): Session {
  return { token: accessToken, userId, createdAt, user }
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const supabase = getSupabase()
  if (!supabase) throw new ValidationError("Supabase n'est pas configuré.")
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session || !data.user) {
    throw new ValidationError(error ? friendlyError(error.message) : 'E-mail ou mot de passe incorrect.')
  }
  const user = await loadProfile(
    data.user.id,
    data.user.email ?? email,
    data.user.user_metadata ?? {},
  )
  if (user.status !== 'active') {
    throw new ValidationError('Ce compte est suspendu. Contactez un administrateur.')
  }
  return toSession(
    data.session.access_token,
    data.user.id,
    user,
    data.user.created_at ?? new Date().toISOString(),
  )
}

export async function signUpWithEmail(input: RegisterInput): Promise<Session> {
  const supabase = getSupabase()
  if (!supabase) throw new ValidationError("Supabase n'est pas configuré.")
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { display_name: input.displayName } },
  })
  if (error) throw new ValidationError(friendlyError(error.message))
  if (!data.session || !data.user) {
    throw new ValidationError(
      'Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.',
    )
  }
  const user = await loadProfile(
    data.user.id,
    data.user.email ?? input.email,
    data.user.user_metadata ?? {},
  )
  return toSession(
    data.session.access_token,
    data.user.id,
    user,
    data.user.created_at ?? new Date().toISOString(),
  )
}

export async function getStoredSession(): Promise<Session | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const current = data.session
  if (!current || !current.user) return null
  const user = await loadProfile(
    current.user.id,
    current.user.email ?? '',
    current.user.user_metadata ?? {},
  )
  return toSession(
    current.access_token,
    current.user.id,
    user,
    current.user.created_at ?? new Date().toISOString(),
  )
}

export async function signOutSupabase(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.auth.signOut()
}

export function onAuthChange(handler: () => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange(() => {
    handler()
  })
  return () => {
    data.subscription.unsubscribe()
  }
}
