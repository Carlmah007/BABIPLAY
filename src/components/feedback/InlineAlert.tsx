import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon, type IconName } from '../ui/Icon'

interface InlineAlertProps {
  tone?: 'error' | 'info' | 'warning' | 'success'
  title?: string
  children: ReactNode
  icon?: IconName
  className?: string
}

const TONES = {
  error: {
    wrapper: 'border-rose-200 bg-rose-50/70 text-rose-800',
    icon: 'bg-white text-rose-600 ring-rose-100',
    defaultIcon: 'alert' as IconName,
  },
  info: {
    wrapper: 'border-sky-200 bg-sky-50/70 text-sky-800',
    icon: 'bg-white text-sky-600 ring-sky-100',
    defaultIcon: 'spark' as IconName,
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50/70 text-amber-800',
    icon: 'bg-white text-amber-600 ring-amber-100',
    defaultIcon: 'alert' as IconName,
  },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
    icon: 'bg-white text-emerald-600 ring-emerald-100',
    defaultIcon: 'check' as IconName,
  },
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: InlineAlertProps) {
  const styles = TONES[tone]
  return (
    <div className={cn('rounded-2xl border p-3.5', styles.wrapper, className)} role="status">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-0.5 rounded-lg p-1.5 ring-1', styles.icon)}>
          <Icon name={icon ?? styles.defaultIcon} size={15} />
        </span>
        <div className="min-w-0 text-sm leading-relaxed">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>
        </div>
      </div>
    </div>
  )
}
