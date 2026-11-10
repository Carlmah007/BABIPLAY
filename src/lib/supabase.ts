import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { APP_CONFIG } from '../config/appConfig'
import type { Database } from '../types/database'

export type AppSupabaseClient = SupabaseClient<Database>

let client: AppSupabaseClient | null = null

/**
 * `true` si VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont renseignés.
 * Tant que ce n'est pas le cas, BabiPlay reste en mode démonstration locale.
 */
export function isSupabaseConfigured(): boolean {
  return APP_CONFIG.supabase.configured
}

/**
 * Retourne le client Supabase typé, ou `null` si la configuration est absente.
 * Le singleton est créé à la première demande et réutilisé ensuite.
 */
export function getSupabase(): AppSupabaseClient | null {
  if (!APP_CONFIG.supabase.configured) return null
  if (client === null) {
    client = createClient<Database>(APP_CONFIG.supabase.url, APP_CONFIG.supabase.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}
