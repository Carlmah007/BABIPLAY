import { Badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/ButtonLink'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Icon } from '../components/ui/Icon'
import { paymentStore } from '../stores/paymentStore'
import { walletStore } from '../stores/walletStore'
import { formatDateTime } from '../lib/dates'
import { formatNumber, formatSignedTokens } from '../lib/format'
import { MOVEMENT_LABELS, MOVEMENT_TONES } from '../lib/movementLabels'
import type { LedgerMovement } from '../types/wallet'

function amountLabel(movement: LedgerMovement): string {
  if (movement.direction === 'credit') return formatSignedTokens(movement.amount)
  if (movement.direction === 'debit') return formatSignedTokens(-movement.amount)
  return '—'
}

function amountClass(movement: LedgerMovement): string {
  if (movement.direction === 'credit') return 'text-emerald-600'
  if (movement.direction === 'debit') return 'text-rose-600'
  return 'text-slate-500'
}

export function WalletPage() {
  const summary = walletStore.useSummary()
  const movements = walletStore.useMovements()
  const ready = walletStore.useReady()
  const reservedWithdrawals = paymentStore.useReserved()
  const committed = summary.committedBalance + reservedWithdrawals
  const recent = [...movements].reverse()

  if (!ready) {
    return (
      <div>
        <PageHeader
          title="Portefeuille"
          description="Chargement de votre portefeuille."
        />
        <LoadingState label="Chargement du portefeuille…" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Portefeuille"
        title="Votre solde virtuel"
        description="Suivez chaque mouvement de votre solde."
        actions={
          <>
            <Badge tone="brand" dot>
              Solde · {summary.currency}
            </Badge>
            <ButtonLink
              to="/payments"
              size="sm"
              variant="outline"
              leftIcon={<Icon name="coins" size={15} />}
            >
              Déposer / Retirer
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solde disponible"
          value={`${formatNumber(summary.availableBalance)} jetons`}
          hint="Calculé depuis le dernier mouvement"
          icon="wallet"
          tone="brand"
        />
        <StatCard
          label="Solde engagé"
          value={`${formatNumber(committed)} jetons`}
          hint={
            committed > 0
              ? reservedWithdrawals > 0
                ? `Dont ${formatNumber(reservedWithdrawals)} en retrait`
                : 'Manches et positions en cours'
              : 'Aucune position ouverte'
          }
          icon="lock"
        />
        <StatCard
          label="Gains cumulés"
          value={`${formatNumber(summary.totalGains)} jetons`}
          hint="PnL positif des parties terminées"
          icon="trend-up"
          tone="success"
        />
        <StatCard
          label="Pertes cumulées"
          value={`${formatNumber(summary.totalLosses)} jetons`}
          hint={`${summary.operationCount} opération(s)`}
          icon="trend-down"
          tone="danger"
        />
      </section>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader
            title="Historique du ledger"
            description="Détail complet de chaque mouvement."
            action={<Badge tone="neutral">{movements.length} mouvement(s)</Badge>}
          />
        </div>

        {movements.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="receipt"
              title="Aucun mouvement enregistré"
              description="Votre solde initial apparaîtra ici dès l'initialisation du portefeuille."
            />
          </div>
        ) : (
          <>
            {/* Tableau desktop */}
            <div className="table-scroll hidden sm:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Montant
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Solde après
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Référence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((movement) => (
                    <tr key={movement.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500 sm:px-6">
                        {formatDateTime(movement.createdAt)}
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge tone={MOVEMENT_TONES[movement.type]}>
                          {MOVEMENT_LABELS[movement.type]}
                        </Badge>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3.5 font-semibold ${amountClass(movement)}`}>
                        {amountLabel(movement)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-medium tabular-nums text-slate-700">
                        {formatNumber(movement.balanceAfter)}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3.5 font-mono text-xs text-slate-400">
                        <span title={movement.reference}>{movement.reference}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartes mobile */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {recent.map((movement) => (
                <li key={movement.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge tone={MOVEMENT_TONES[movement.type]}>
                        {MOVEMENT_LABELS[movement.type]}
                      </Badge>
                      <p className="mt-1.5 text-xs text-slate-500">
                        {formatDateTime(movement.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${amountClass(movement)}`}>
                        {amountLabel(movement)}
                      </p>
                      <p className="text-xs text-slate-400">
                        Solde {formatNumber(movement.balanceAfter)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 truncate font-mono text-[11px] text-slate-400">
                    {movement.reference}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="mt-6 border-brand-100 bg-brand-50/40">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-2 text-brand-600 ring-1 ring-brand-100">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Règles du portefeuille</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600">
              <li>• Aucune mise supérieure au solde disponible n'est acceptée.</li>
              <li>• Le solde ne peut jamais devenir négatif.</li>
              <li>• Chaque opération possède une clé d'idempotence unique : aucun double débit ni double crédit.</li>
              <li>• Le solde affiché est toujours recalculé depuis les mouvements du ledger.</li>
              <li>• Un retrait en attente réserve le montant sans le débiter avant validation.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
