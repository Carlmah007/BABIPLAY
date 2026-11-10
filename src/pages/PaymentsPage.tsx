import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { TextField } from '../components/forms/TextField'
import { authStore } from '../stores/authStore'
import { paymentStore } from '../stores/paymentStore'
import { walletStore } from '../stores/walletStore'
import { PAYMENT_RULES } from '../services/paymentService'
import { toUserMessage } from '../lib/errors'
import { formatDateTime } from '../lib/dates'
import { formatNumber } from '../lib/format'
import {
  WITHDRAWAL_METHOD_LABELS,
  type PaymentIntent,
  type WithdrawalMethod,
} from '../types/payments'

const DEPOSIT_PRESETS = [1_000, 5_000, 10_000, 25_000]
const WITHDRAWAL_PRESETS = [500, 1_000, 5_000, 10_000]
const METHODS = Object.keys(WITHDRAWAL_METHOD_LABELS) as WithdrawalMethod[]

const STATUS_LABELS: Record<PaymentIntent['status'], string> = {
  pending: 'En attente',
  processing: 'En traitement',
  confirmed: 'Confirmé',
  failed: 'Échoué',
  cancelled: 'Annulé',
  refunded: 'Remboursé',
}

function statusTone(status: PaymentIntent['status']): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'confirmed') return 'success'
  if (status === 'pending' || status === 'processing') return 'warning'
  if (status === 'failed') return 'danger'
  if (status === 'refunded') return 'info'
  return 'neutral'
}

export function PaymentsPage() {
  const session = authStore.useSession()
  const user = session?.user ?? null
  const summary = walletStore.useSummary()
  const intents = paymentStore.useIntents()
  const pending = paymentStore.usePending()
  const reserved = paymentStore.useReserved()
  const available = paymentStore.useAvailable()

  const [depositAmount, setDepositAmount] = useState('1000')
  const [withdrawAmount, setWithdrawAmount] = useState('500')
  const [destination, setDestination] = useState('')
  const [method, setMethod] = useState<WithdrawalMethod>('mobile_money')
  const [conditionsAccepted, setConditionsAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<'deposit' | 'withdraw' | 'cancel' | null>(null)

  useEffect(() => {
    if (user) paymentStore.setUser(user.id)
  }, [user])

  if (!user) {
    return (
      <div>
        <PageHeader title="Paiements" description="Connectez-vous pour gérer vos dépôts et retraits." />
        <Card>
          <EmptyState icon="lock" title="Connexion requise" description="Vos opérations sont liées à votre compte." />
        </Card>
      </div>
    )
  }

  const handleDeposit = () => {
    setError(null)
    setNotice(null)
    setBusy('deposit')
    try {
      const parsed = Number(depositAmount.replace(/\s/g, '').replace(',', '.'))
      const intent = paymentStore.deposit(user, parsed)
      setNotice(`Dépôt de ${formatNumber(intent.amount)} jetons crédité (démo).`)
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const handleWithdraw = () => {
    setError(null)
    setNotice(null)
    setBusy('withdraw')
    try {
      const parsed = Number(withdrawAmount.replace(/\s/g, '').replace(',', '.'))
      const intent = paymentStore.withdraw(user, parsed, destination, method, conditionsAccepted)
      setNotice(
        `Demande de ${formatNumber(intent.amount)} jetons enregistrée. Elle doit être validée par un Super Admin.`,
      )
      setDestination('')
      setConditionsAccepted(false)
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = (intentId: string) => {
    setError(null)
    setNotice(null)
    setBusy('cancel')
    try {
      paymentStore.cancel(user, intentId)
      setNotice('Demande de retrait annulée. Les jetons sont de nouveau disponibles.')
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const parsedWithdraw = Number(withdrawAmount.replace(/\s/g, '').replace(',', '.'))
  const feePreview = Number.isFinite(parsedWithdraw)
    ? Math.round(parsedWithdraw * PAYMENT_RULES.withdrawalFeeRate)
    : 0
  const netPreview = Number.isFinite(parsedWithdraw) ? Math.max(0, parsedWithdraw - feePreview) : 0
  const maxWithdraw = Math.min(available, PAYMENT_RULES.maxWithdrawal)
  const hasPending = pending.length > 0

  return (
    <div>
      <PageHeader
        eyebrow="Paiements"
        title="Dépôts & retraits"
        description="Parcours complet de test, sans prestataire de paiement réel : jetons virtuels, ledger et validation opérateur."
        actions={
          <Badge tone="warning" dot>
            Mode démo · aucun argent réel
          </Badge>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solde portefeuille"
          value={`${formatNumber(summary.availableBalance)} jetons`}
          hint="Source de vérité : ledger"
          icon="wallet"
          tone="brand"
        />
        <StatCard
          label="Disponible au retrait"
          value={`${formatNumber(available)} jetons`}
          hint={reserved > 0 ? `${formatNumber(reserved)} jetons réservés` : 'Aucun retrait en attente'}
          icon="coins"
          tone="success"
        />
        <StatCard
          label="Retraits en attente"
          value={`${formatNumber(reserved)} jetons`}
          hint={`${pending.length} demande(s)`}
          icon="clock"
          tone={hasPending ? 'warning' : undefined}
        />
        <StatCard
          label="Gains cumulés"
          value={`${formatNumber(summary.totalGains)} jetons`}
          hint={`${summary.operationCount} opération(s)`}
          icon="trend-up"
          tone="success"
        />
      </section>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Dépôt de démonstration"
            description="Le dépôt est crédité instantanément par le bac à sable local."
            action={<Badge tone="success">Instantané</Badge>}
          />
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DEPOSIT_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  size="sm"
                  variant={Number(depositAmount) === preset ? 'primary' : 'secondary'}
                  onClick={() => setDepositAmount(String(preset))}
                >
                  {formatNumber(preset)}
                </Button>
              ))}
            </div>
            <TextField
              label="Montant du dépôt (jetons)"
              type="number"
              min={PAYMENT_RULES.minDeposit}
              max={PAYMENT_RULES.maxDeposit}
              step={100}
              inputMode="numeric"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              hint={`Minimum ${formatNumber(PAYMENT_RULES.minDeposit)} jetons · crédit immédiat en démo.`}
            />
            <Button fullWidth onClick={handleDeposit} loading={busy === 'deposit'} disabled={busy !== null}>
              Créditer mon portefeuille
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">
              En production, cette action créerait une intention de paiement et attendrait le webhook
              signé du prestataire. Aucune clé de paiement n'est utilisée ici.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Demande de retrait"
            description="Seuil, frais, vérification et validation opérateur comme chez un bookmaker."
            action={<Badge tone="brand">Validation manuelle</Badge>}
          />
          <div className="space-y-3">
            {hasPending ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-700">
                <p className="font-semibold">Retrait déjà en attente</p>
                <p className="mt-1">
                  {pending.map((intent) => `${formatNumber(intent.amount)} jetons`).join(', ')} en cours de
                  validation. Annulez-le pour en créer un autre.
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Moyen de retrait</p>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={method === value ? 'primary' : 'secondary'}
                    onClick={() => setMethod(value)}
                  >
                    {WITHDRAWAL_METHOD_LABELS[value]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {WITHDRAWAL_PRESETS.filter((preset) => preset <= maxWithdraw).map((preset) => (
                <Button
                  key={preset}
                  size="sm"
                  variant={Number(withdrawAmount) === preset ? 'primary' : 'secondary'}
                  onClick={() => setWithdrawAmount(String(preset))}
                >
                  {formatNumber(preset)}
                </Button>
              ))}
              {maxWithdraw >= PAYMENT_RULES.minWithdrawal ? (
                <Button size="sm" variant="outline" onClick={() => setWithdrawAmount(String(maxWithdraw))}>
                  Tout ({formatNumber(maxWithdraw)})
                </Button>
              ) : null}
            </div>

            <TextField
              label="Montant du retrait (jetons)"
              type="number"
              min={PAYMENT_RULES.minWithdrawal}
              max={PAYMENT_RULES.maxWithdrawal}
              step={100}
              inputMode="numeric"
              value={withdrawAmount}
              onChange={(event) => setWithdrawAmount(event.target.value)}
              hint={`Minimum ${formatNumber(PAYMENT_RULES.minWithdrawal)} jetons · disponible ${formatNumber(available)}.`}
            />

            <TextField
              label={method === 'crypto' ? 'Adresse du portefeuille' : method === 'bank_transfer' ? 'IBAN / compte bancaire' : 'Numéro mobile money'}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={
                method === 'crypto'
                  ? 'TX... adresse USDT'
                  : method === 'bank_transfer'
                    ? 'FR76 3000 6000 0112 3456 7890 189'
                    : '+229 90 00 00 00'
              }
              hint="Le bénéficiaire doit correspondre au titulaire du compte (KYC)."
            />

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand-500"
                checked={conditionsAccepted}
                onChange={(event) => setConditionsAccepted(event.target.checked)}
              />
              <span>
                Je confirme que le compte bénéficiaire est à mon nom et j'accepte les conditions de
                retrait (vérification KYC, une demande à la fois, jetons engagés non retirables).
              </span>
            </label>

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Montant demandé</span>
                <span className="font-semibold text-slate-900">
                  {formatNumber(Number.isFinite(parsedWithdraw) ? parsedWithdraw : 0)} jetons
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-slate-500">Frais ({Math.round(PAYMENT_RULES.withdrawalFeeRate * 100)} %)</span>
                <span className="font-medium text-slate-700">{formatNumber(feePreview)} jetons</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
                <span className="text-slate-500">Net versé</span>
                <span className="font-semibold text-emerald-600">{formatNumber(netPreview)} jetons</span>
              </div>
            </div>

            <Button
              fullWidth
              variant="success"
              onClick={handleWithdraw}
              loading={busy === 'withdraw'}
              disabled={busy !== null || hasPending}
              leftIcon={<Icon name="lock" size={16} />}
            >
              Demander le retrait
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">
              Le montant est réservé immédiatement et reste visible dans « retraits en attente ». Le débit
              définitif n'est inscrit au ledger qu'après validation par un Super Admin.
            </p>
          </div>
        </Card>
      </section>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader
            title="Historique des paiements"
            description="Chaque intention est idempotente et auditable."
            action={<Badge tone="neutral">{intents.length} opération(s)</Badge>}
          />
        </div>

        {intents.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="receipt"
              title="Aucun paiement"
              description="Votre premier dépôt ou retrait apparaîtra ici."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {intents.map((intent) => (
              <li key={intent.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {intent.kind === 'deposit' ? 'Dépôt' : 'Retrait'} ·{' '}
                        {formatNumber(intent.amount)} jetons
                      </p>
                      <Badge tone={statusTone(intent.status)}>{STATUS_LABELS[intent.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(intent.createdAt)}
                      {intent.method ? ` · ${WITHDRAWAL_METHOD_LABELS[intent.method]}` : ''}
                      {intent.destination ? ` · ${intent.destination}` : ''}
                    </p>
                    {intent.failureReason ? (
                      <p className="mt-1 text-xs text-rose-600">{intent.failureReason}</p>
                    ) : null}
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{intent.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      Net {formatNumber(intent.netAmount)} jetons
                    </p>
                    <p className="text-xs text-slate-400">Frais {formatNumber(intent.fee)}</p>
                    {intent.kind === 'withdrawal' &&
                    (intent.status === 'pending' || intent.status === 'processing') ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => handleCancel(intent.id)}
                        disabled={busy !== null}
                      >
                        Annuler
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6 border-brand-100 bg-brand-50/40">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-white p-2 text-brand-600 ring-1 ring-brand-100">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Règles de retrait (inspirées Betclic / 1xBet)</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600">
              <li>• Retrait minimum : {formatNumber(PAYMENT_RULES.minWithdrawal)} jetons.</li>
              <li>• Une seule demande en attente par compte ; le montant est réservé.</li>
              <li>• Vérification KYC et compte bénéficiaire au nom du joueur obligatoires.</li>
              <li>• Validation par un opérateur habilité ({'payments.manage'}), jamais par le demandeur.</li>
              <li>• Frais affichés avant confirmation ({Math.round(PAYMENT_RULES.withdrawalFeeRate * 100)} % en démo).</li>
              <li>• Aucun prestataire réel : les jetons restent virtuels et le ledger est append-only.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
