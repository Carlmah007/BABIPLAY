import { Link, useNavigate } from '../app/router'
import { authStore } from '../stores/authStore'
import { isSupabaseConfigured } from '../lib/supabase'
import { APP_CONFIG } from '../config/appConfig'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Icon } from '../components/ui/Icon'
import { Brand } from '../components/layout/Brand'
import { formatNumber } from '../lib/format'

const CURRENT_YEAR = new Date().getFullYear()

const FEATURES = [
  {
    icon: 'plane' as const,
    title: 'Aviator',
    description: 'Misez, suivez le multiplicateur et retirez avant le crash.',
    tone: 'brand' as const,
  },
  {
    icon: 'chart' as const,
    title: 'Trading simulé',
    description: 'Cinq marchés virtuels, positions à la hausse ou à la baisse.',
    tone: 'success' as const,
  },
  {
    icon: 'grid' as const,
    title: 'Tic-Tac-Toe',
    description: 'Affrontez une IA Minimax qui ne laisse rien passer.',
    tone: 'info' as const,
  },
]

export function LandingPage() {
  const session = authStore.useSession()
  const navigate = useNavigate()

  const enterDemo = () => {
    if (!session) {
      if (isSupabaseConfigured()) {
        navigate('/register')
        return
      }
      authStore.signInDemo()
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-svh overflow-x-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.14),transparent_60%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 sm:inline-flex"
          >
            Se connecter
          </Link>
          <Button size="sm" onClick={enterDemo} rightIcon={<Icon name="arrow-right" size={16} />}>
            {session ? 'Mon espace' : 'Créer un compte'}
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <Badge tone="brand" dot>
              Portefeuille virtuel
            </Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Jouez, tradez,
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-fuchsia-500 bg-clip-text text-transparent">
                progressez.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              BabiPlay réunit un portefeuille virtuel partagé, des jeux rapides et un espace de
              trading simulé. Aucun argent réel, aucune carte bancaire : vous testez le produit de
              bout en bout.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={enterDemo} rightIcon={<Icon name="arrow-right" size={18} />}>
                {session ? 'Ouvrir mon espace' : 'Entrer en mode démo'}
              </Button>
              <Link
                to="/register"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                Créer un compte local
              </Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Icon name="lock" size={14} />
              Solde initial offert : {formatNumber(APP_CONFIG.demoInitialBalance)} jetons virtuels.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-200/60 to-fuchsia-100/40 blur-2xl" />
            <Card className="relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Portefeuille virtuel
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                    {formatNumber(APP_CONFIG.demoInitialBalance)}
                    <span className="ml-1 text-sm font-medium text-slate-500">jetons</span>
                  </p>
                </div>
                <Badge tone="success" dot>
                  Bêta
                </Badge>
              </div>

              <div className="mt-5 rounded-2xl bg-night p-4 text-white">
                <div className="flex items-center justify-between text-xs text-white/55">
                  <span>Aviator · manche simulée</span>
                  <span className="font-mono text-emerald-400">2.41×</span>
                </div>
                <div className="mt-4 flex h-24 items-end gap-1.5" aria-hidden="true">
                  {[18, 26, 22, 38, 34, 48, 44, 60, 56, 72, 68, 86, 92].map((height, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t bg-gradient-to-t from-brand-500/40 to-emerald-400"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-white/55">Mise 500 · Retrait 1 205</span>
                  <span className="font-semibold text-emerald-400">+705</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Jeux', '3'],
                  ['Marchés', '5'],
                  ['Frais', '0'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 px-2 py-3">
                    <p className="text-lg font-semibold text-slate-900">{value}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} interactive>
              <span
                className={
                  feature.tone === 'brand'
                    ? 'mb-4 inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-600'
                    : feature.tone === 'success'
                      ? 'mb-4 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-600'
                      : 'mb-4 inline-flex rounded-xl bg-sky-50 p-2.5 text-sky-600'
                }
              >
                <Icon name={feature.icon} size={20} />
              </span>
              <h2 className="text-base font-semibold text-slate-900">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{feature.description}</p>
            </Card>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white p-2 text-amber-600 ring-1 ring-amber-100">
              <Icon name="shield" size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">Transparence avant tout</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800/90">
                Les soldes, cours et résultats sont simulés localement. Les paiements réels sont
                désactivés. BabiPlay ne doit pas être utilisé pour de l'argent réel tant que le
                moteur serveur et le fournisseur de paiement officiel ne sont pas validés.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200/80 bg-white/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {CURRENT_YEAR} BabiPlay — version bêta.</p>
          <p>Jetons virtuels · Aucun paiement réel · Données stockées dans votre navigateur</p>
        </div>
      </footer>
    </div>
  )
}
