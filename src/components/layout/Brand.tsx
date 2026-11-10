import { cn } from '../../lib/cn'

interface BrandProps {
  compact?: boolean
  className?: string
}

export function Brand({ compact = false, className }: BrandProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-black text-white shadow-md shadow-brand-600/25">
        B
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
      </span>
      {!compact ? (
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          Babi<span className="text-brand-600">Play</span>
        </span>
      ) : null}
    </div>
  )
}
