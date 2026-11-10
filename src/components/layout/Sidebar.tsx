import { authStore } from '../../stores/authStore'
import { canAccessAdminPanel } from '../../lib/permissions'
import { navigate } from '../../app/router'
import { ADMIN_NAV, PRIMARY_NAV, SECONDARY_NAV } from '../navigation/navItems'
import { NavLink } from '../navigation/NavLink'
import { Brand } from './Brand'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

const ROLE_LABELS = {
  player: 'Joueur',
  moderator: 'Modérateur',
  admin: 'Admin',
  super_admin: 'Super Admin',
} as const

export function Sidebar() {
  const session = authStore.useSession()
  const user = session?.user ?? null

  if (!user) return null

  const handleSignOut = () => {
    authStore.signOut()
    navigate('/login')
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200/80 bg-white/90 px-3 py-4 backdrop-blur lg:flex">
      <div className="px-2 pb-5">
        <Brand />
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Portefeuille virtuel</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Navigation principale">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Jouer
        </p>
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
        <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Compte
        </p>
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
        {canAccessAdminPanel(user) ? <NavLink item={ADMIN_NAV} /> : null}
      </nav>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{user.displayName}</p>
            <p className="truncate text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          className="mt-2 justify-start"
          onClick={handleSignOut}
          leftIcon={<Icon name="logout" size={15} />}
        >
          Se déconnecter
        </Button>
      </div>
    </aside>
  )
}
