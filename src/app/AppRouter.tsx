import { useEffect } from 'react'
import { authStore } from '../stores/authStore'
import { canAccessAdminPanel } from '../lib/permissions'
import { AppShell } from '../components/layout/AppShell'
import { LoadingState } from '../components/ui/LoadingState'
import { Card } from '../components/ui/Card'
import { ButtonLink } from '../components/ui/ButtonLink'
import { Icon } from '../components/ui/Icon'
import { navigate, useHashPath } from './router'
import { ROUTES, type AppRoute } from './routes'

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true })
  }, [to])
  return <LoadingState label="Redirection…" />
}

function AccessDenied() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <span className="mx-auto mb-4 inline-flex rounded-2xl bg-rose-50 p-3 text-rose-600">
        <Icon name="lock" size={24} />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">Accès refusé</h1>
      <p className="mt-2 text-sm text-slate-500">
        Votre rôle ne permet pas d'accéder à cet espace. Cette restriction sera également appliquée
        côté serveur en production.
      </p>
      <ButtonLink
        to="/dashboard"
        fullWidth
        className="mt-5"
        leftIcon={<Icon name="arrow-left" size={16} />}
      >
        Retour au tableau de bord
      </ButtonLink>
    </Card>
  )
}

export function AppRouter() {
  const path = useHashPath()
  const route = ROUTES.find((candidate) => candidate.path === path)
  if (!route) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-lg text-center">
          <h1 className="text-xl font-semibold text-slate-900">Page introuvable</h1>
          <p className="mt-2 text-sm text-slate-500">L'adresse « {path} » n'existe pas.</p>
          <ButtonLink to="/dashboard" fullWidth className="mt-5">
            Retour au tableau de bord
          </ButtonLink>
        </Card>
      </AppShell>
    )
  }
  return <RouteView route={route} />
}

function RouteView({ route }: { route: AppRoute }) {
  const session = authStore.useSession()
  const ready = authStore.useReady()
  const user = session?.user ?? null
  const path = useHashPath()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [path])

  if (route.protected && !ready) {
    return (
      <AppShell>
        <LoadingState label="Connexion…" />
      </AppShell>
    )
  }
  if (route.protected && !user) return <Redirect to="/login" />
  if (route.adminOnly && !canAccessAdminPanel(user)) {
    return (
      <AppShell>
        <AccessDenied />
      </AppShell>
    )
  }
  if (route.chrome === 'public') return <>{route.element}</>
  return <AppShell>{route.element}</AppShell>
}
