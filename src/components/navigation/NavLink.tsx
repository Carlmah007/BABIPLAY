import { cn } from '../../lib/cn'
import { Link, useHashPath } from '../../app/router'
import { Icon } from '../ui/Icon'
import type { NavItem } from './navItems'

interface NavLinkProps {
  item: NavItem
  variant?: 'sidebar' | 'mobile'
  onNavigate?: () => void
}

export function NavLink({ item, variant = 'sidebar', onNavigate }: NavLinkProps) {
  const path = useHashPath()
  const active = path === item.to || path.startsWith(`${item.to}/`)

  if (variant === 'mobile') {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors',
          active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800',
        )}
      >
        <span
          className={cn(
            'grid h-8 w-12 place-items-center rounded-full transition-colors',
            active ? 'bg-brand-50' : 'bg-transparent',
          )}
        >
          <Icon name={item.icon} size={20} />
        </span>
        <span className="max-w-full truncate">{item.label}</span>
      </Link>
    )
  }

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <span
        className={cn(
          'grid h-8 w-8 place-items-center rounded-lg transition-colors',
          active
            ? 'bg-white text-brand-600 shadow-sm ring-1 ring-brand-100'
            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700',
        )}
      >
        <Icon name={item.icon} size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> : null}
    </Link>
  )
}
