/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: 'demo' | 'local'
  readonly VITE_PAYMENT_ENABLED?: string
  readonly VITE_PAYMENT_PROVIDER?: string
  readonly VITE_PAYMENT_SANDBOX?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
