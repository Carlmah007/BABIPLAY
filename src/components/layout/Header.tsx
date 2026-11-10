import { authStore } from '../../stores/authStore'
import { navigate } from '../../app/router'
import { Link } from '../../app/router'
import { Badge } from '../ui/Badge'
import { Icon } from '../ui/Icon'
import { BalancePill } from './BalancePill'
import { Brand } from './Brand'
import { useScrollVisibility } from '../../lib/useScrollVisibility'

export function Header() {
  const session = authStore.useSession()
  const visibility = useScrollVisibility()
  const user = session?.user ?? null

  if (!user) return null

  const initials = user.displayName
    .split(' ')
    .map((part) => part.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleSignOut = () => {
    authStore.signOut()
    navigate('/login')
  }

  return (
    <header
      className={`sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur transition-transform duration-300 ease-out ${
        visibility === 'down' ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-slate-900">{user.displayName}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Compte actif
            </p>
          </div>
          <Badge tone="brand" className="hidden md:inline-flex">
            Bêta
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <BalancePill />
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50/40 hover:text-brand-700"
          >
            <Icon name="bell" size={18} />
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Se déconnecter"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:hidden"
          >
            <Icon name="logout" size={17} />
          </button>
          <div className="hidden items-center gap-2 border-l border-slate-200 pl-2 sm:flex">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-night text-xs font-bold text-white">
              {initials}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Se déconnecter"
              className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
