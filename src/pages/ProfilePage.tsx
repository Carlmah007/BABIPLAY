import { useNavigate } from '../app/router'
import { authStore } from '../stores/authStore'
import { walletStore } from '../stores/walletStore'
import { canAccessAdminPanel } from '../lib/permissions'
import { formatDate } from '../lib/dates'
import { formatNumber } from '../lib/format'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ButtonLink } from '../components/ui/ButtonLink'
import { Icon } from '../components/ui/Icon'

const ROLE_LABELS = {
  player: 'Joueur',
  moderator: 'Modérateur',
  admin: 'Administrateur',
  super_admin: 'Super Administrateur',
} as const

export function ProfilePage() {
  const session = authStore.useSession()
  const summary = walletStore.useSummary()
  const navigate = useNavigate()
  const user = session?.user

  if (!user) return null

  const initials = user.displayName
    .split(' ')
    .map((part) => part.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const signOut = () => {
    authStore.signOut()
    navigate('/login')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Profil"
        title="Votre compte"
        description="Votre compte et vos informations."
        actions={
          <Badge tone={user.demo ? 'brand' : 'info'} dot>
            {user.demo ? 'Compte test' : 'Membre'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0">
          <div className="flex items-start gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-md shadow-brand-600/20">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-semibold text-slate-900">{user.displayName}</h2>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={canAccessAdminPanel(user) ? 'brand' : 'neutral'}>
                  {ROLE_LABELS[user.role]}
                </Badge>
                <Badge tone="success" dot>
                  Compte actif
                </Badge>
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Identifiant
              </dt>
              <dd className="mt-1 min-w-0 truncate font-mono text-sm text-slate-700">{user.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Créé le
              </dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Type de compte
              </dt>
              <dd className="mt-1 text-sm text-slate-700">
                {user.demo ? 'Sans mot de passe' : 'Mot de passe sécurisé'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Session
              </dt>
              <dd className="mt-1 text-sm text-slate-700">
                Persistée dans ce navigateur
              </dd>
            </div>
          </dl>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Portefeuille" description="Solde virtuel lié à ce compte." />
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatNumber(summary.availableBalance)}{' '}
              <span className="text-sm font-medium text-slate-500">jetons</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {summary.operationCount} opération(s) · gains {formatNumber(summary.totalGains)} ·
              pertes {formatNumber(summary.totalLosses)}
            </p>
            <ButtonLink
              to="/wallet"
              variant="outline"
              fullWidth
              className="mt-4"
              leftIcon={<Icon name="wallet" size={16} />}
            >
              Ouvrir le portefeuille
            </ButtonLink>
          </Card>

          {canAccessAdminPanel(user) ? (
            <Card className="border-brand-100 bg-brand-50/40">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-white p-2 text-brand-600 ring-1 ring-brand-100">
                  <Icon name="shield" size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Accès back-office</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Votre rôle autorise l'accès au back-office local.
                  </p>
                  <ButtonLink to="/admin" size="sm" className="mt-3">
                    Ouvrir l'administration
                  </ButtonLink>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Session" description="Se déconnecter de ce navigateur." />
            <Button
              variant="outline"
              fullWidth
              onClick={signOut}
              leftIcon={<Icon name="logout" size={16} />}
            >
              Se déconnecter
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Les contrôles de rôle côté client sont destinés à l'interface. Ils ne remplacent pas
              une autorisation serveur (Supabase RLS + Edge Functions).
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
