import { formatNumber } from '../../lib/format'
import { Link } from '../../app/router'
import { walletStore } from '../../stores/walletStore'
import { Icon } from '../ui/Icon'

export function BalancePill() {
  const summary = walletStore.useSummary()

  return (
    <Link
      to="/wallet"
      className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-700 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
      aria-label={`Ouvrir le portefeuille — solde ${formatNumber(summary.availableBalance)} jetons`}
    >
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon name="wallet" size={14} />
      </span>
      <span className="text-sm font-semibold tabular-nums text-slate-900">
        {formatNumber(summary.availableBalance)}
      </span>
      <span className="hidden text-xs font-medium text-slate-500 sm:inline">jetons</span>
    </Link>
  )
}
