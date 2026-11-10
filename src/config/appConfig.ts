/**
 * Configuration centrale, lue depuis les variables d'environnement Vite.
 *
 * IMPORTANT : seules les variables préfixées `VITE_` sont exposées au client.
 * Les secrets de paiement (PAYMENT_SECRET_KEY, PAYMENT_WEBHOOK_SECRET, etc.)
 * restent côté serveur et ne doivent jamais apparaître ici.
 */

const env = import.meta.env

export type AppMode = 'demo' | 'local'

export const APP_CONFIG = {
  name: 'BabiPlay',
  tagline: 'Jouez, tradez, progressez.',
  mode: (env.VITE_APP_MODE === 'local' ? 'local' : 'demo') as AppMode,
  currency: 'BABI',
  currencyLabel: 'jetons',
  demoInitialBalance: 50_000,
  storagePrefix: 'babiplay:v1',
  payments: {
    enabled: env.VITE_PAYMENT_ENABLED === 'true',
    provider: env.VITE_PAYMENT_PROVIDER ?? 'disabled',
    sandbox: env.VITE_PAYMENT_SANDBOX !== 'false',
  },
  supabase: {
    url: env.VITE_SUPABASE_URL ?? '',
    anonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
    configured: Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY),
  },
} as const

export const PAYMENTS_ENABLED = APP_CONFIG.payments.enabled
