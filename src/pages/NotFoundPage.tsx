import { Link } from '../app/router'
import { Card } from '../components/ui/Card'
import { ButtonLink } from '../components/ui/ButtonLink'
import { Icon } from '../components/ui/Icon'
import { Brand } from '../components/layout/Brand'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Retour à l'accueil">
          <Brand />
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-md text-center">
          <span className="mx-auto mb-4 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-600">
            <Icon name="alert" size={26} />
          </span>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Erreur 404</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page introuvable</h1>
          <p className="mt-2 text-sm text-slate-500">
            Cette adresse n'existe pas ou a été déplacée.
          </p>
          <ButtonLink
            to="/dashboard"
            fullWidth
            className="mt-5"
            leftIcon={<Icon name="home" size={16} />}
          >
            Retour au tableau de bord
          </ButtonLink>
        </Card>
      </div>
    </div>
  )
}
