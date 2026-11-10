import { MOBILE_NAV } from '../navigation/navItems'
import { NavLink } from '../navigation/NavLink'
import { useScrollVisibility } from '../../lib/useScrollVisibility'

export function MobileNav() {
  const visibility = useScrollVisibility()
  const hidden = visibility === 'down'

  return (
    <nav
      aria-label="Navigation mobile"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-300 ease-out lg:hidden ${
        hidden ? 'translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="mx-auto grid max-w-lg grid-cols-6 px-1">
        {MOBILE_NAV.map((item) => (
          <NavLink key={item.to} item={item} variant="mobile" />
        ))}
      </div>
    </nav>
  )
}
