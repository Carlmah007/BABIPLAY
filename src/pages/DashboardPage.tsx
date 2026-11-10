import { Link } from '../app/router'
import { authStore } from '../stores/authStore'
import { walletStore } from '../stores/walletStore'
import { canAccessAdminPanel } from '../lib/permissions'
import { formatNumber, formatSignedTokens } from '../lib/format'
import { formatDateTime } from '../lib/dates'
import { MOVEMENT_LABELS } from '../lib/movementLabels'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/ButtonLink'
import { Icon, type IconName } from '../components/ui/Icon'
import { StatCard } from '../components/ui/StatCard'
import { EmptyState } from '../components/ui/EmptyState'

const GAMES: Array<{
  to: string
  title: string
  description: string
  icon: IconName
  tone: 'brand' | 'success' | 'info'
  meta: string
}> = [
  {
    to: '/aviator',
    title: 'Aviator',
    description: 'Multiplicateur croissant, retrait au bon moment.',
    icon: 'plane',
    tone: 'brand',
    meta: 'Manche manuelle',
  },
  {
    to: '/trading',
    title: 'Trading simulé',
    description: 'BTC, ETH, EUR/USD, GOLD et NASDAQ virtuels.',
    icon: 'chart',
    tone: 'success',
    meta: '5 marchés',
  },
  {
    to: '/tic-tac-toe',
    title: 'Tic-Tac-Toe',
    description: 'IA Minimax, trois niveaux et cotes publiées.',
    icon: 'grid',
    tone: 'info',
    meta: 'Mise dès 10 jetons',
  },
]

export function DashboardPage() {
  const session = authStore.useSession()
  const user = session?.user ?? null
  const summary = walletStore.useSummary()
  const movements = walletStore.useMovements()
  const recentMovements = movements.slice(-3).reverse()

  return (
    <div>
      <PageHeader
        eyebrow="Tableau de bord"
        title={`Bonjour, ${user?.displayName ?? 'joueur'}`}
        description="Votre portefeuille, vos jeux et votre activité en un coup d'œil."
        actions={
          <>
            <Badge tone="brand" dot>
              Bêta
            </Badge>
            {user && canAccessAdminPanel(user) ? (
              <Link
                to="/admin"
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Icon name="shield" size={15} />
                Administration
              </Link>
            ) : null}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solde disponible"
          value={`${formatNumber(summary.availableBalance)} jetons`}
          hint="Portefeuille virtuel"
          icon="wallet"
          tone="brand"
        />
        <StatCard
          label="Solde engagé"
          value={`${formatNumber(summary.committedBalance)} jetons`}
          hint={
            summary.committedBalance > 0 ? 'Positions et manches en cours' : 'Aucune position ouverte'
          }
          icon="lock"
        />
        <StatCard
          label="Gains cumulés"
          value={`${formatNumber(summary.totalGains)} jetons`}
          hint={`${summary.operationCount} opération(s) enregistrée(s)`}
          icon="trophy"
          tone="success"
        />
        <StatCard
          label="Pertes cumulées"
          value={`${formatNumber(summary.totalLosses)} jetons`}
          hint="Mises perdues et pertes de trading"
          icon="activity"
          tone="danger"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Vos jeux</h2>
              <p className="text-sm text-slate-500">Choisissez un univers et lancez une partie.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {GAMES.map((game) => (
              <Card key={game.to} interactive className="flex flex-col">
                <span
                  className={
                    game.tone === 'brand'
                      ? 'mb-3 inline-flex w-fit rounded-xl bg-brand-50 p-2.5 text-brand-600'
                      : game.tone === 'success'
                        ? 'mb-3 inline-flex w-fit rounded-xl bg-emerald-50 p-2.5 text-emerald-600'
                        : 'mb-3 inline-flex w-fit rounded-xl bg-sky-50 p-2.5 text-sky-600'
                  }
                >
                  <Icon name={game.icon} size={20} />
                </span>
                <h3 className="text-base font-semibold text-slate-900">{game.title}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">
                  {game.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">{game.meta}</span>
                  <Link
                    to={game.to}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    Jouer
                    <Icon name="arrow-right" size={15} />
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader
              title="Activité récente"
              description="Chaque mouvement du portefeuille sera tracé ici."
            />
            {recentMovements.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="Aucune opération pour l'instant"
                description="Lancez une partie ou ouvrez une position pour voir votre historique."
                action={
                  <ButtonLink
                    to="/aviator"
                    size="sm"
                    variant="outline"
                    leftIcon={<Icon name="play" size={15} />}
                  >
                    Découvrir Aviator
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentMovements.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {MOVEMENT_LABELS[movement.type]}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(movement.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          movement.direction === 'credit'
                            ? 'text-sm font-semibold text-emerald-600'
                            : movement.direction === 'debit'
                              ? 'text-sm font-semibold text-rose-600'
                              : 'text-sm font-semibold text-slate-500'
                        }
                      >
                        {movement.direction === 'credit'
                          ? formatSignedTokens(movement.amount)
                          : movement.direction === 'debit'
                            ? formatSignedTokens(-movement.amount)
                            : '—'}
                      </p>
                      <p className="text-xs text-slate-400">
                        Solde {formatNumber(movement.balanceAfter)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader
              title="Votre compte"
              description="Votre session."
            />
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Nom</dt>
                <dd className="truncate font-medium text-slate-900">{user?.displayName ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Rôle</dt>
                <dd>
                  <Badge tone={canAccessAdminPanel(user) ? 'brand' : 'neutral'}>
                    {user?.role === 'super_admin'
                      ? 'Super Admin'
                      : user?.role === 'admin'
                        ? 'Admin'
                        : user?.role === 'moderator'
                          ? 'Modérateur'
                          : 'Joueur'}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Statut</dt>
                <dd>
                  <Badge tone="success" dot>
                    Actif
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Devise</dt>
                <dd className="font-medium text-slate-900">Jetons virtuels</dd>
              </div>
            </dl>
            <ButtonLink
              to="/profile"
              variant="outline"
              fullWidth
              size="sm"
              className="mt-4"
              leftIcon={<Icon name="user" size={15} />}
            >
              Voir mon profil
            </ButtonLink>
          </Card>

          <Card className="bg-night text-white">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-white/10 p-2 text-acid-300">
                <Icon name="shield" size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold">Votre environnement</p>
                <p className="mt-1 text-sm leading-relaxed text-white/70">
                  Soldes et résultats sont virtuels. Aucun paiement réel n'est possible.
                </p>
                <Link
                  to="/wallet"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-acid-300 hover:text-white"
                >
                  Voir le portefeuille
                  <Icon name="arrow-right" size={15} />
                </Link>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
