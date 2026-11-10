import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon, type IconName } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { authStore } from '../stores/authStore'
import { miningStore } from '../stores/miningStore'
import { walletStore } from '../stores/walletStore'
import { formatNumber } from '../lib/format'
import { formatDateTime } from '../lib/dates'
import { toUserMessage } from '../lib/errors'
import { MINING_MACHINE_MODELS } from '../services/miningService'
import type { MiningMachineStatus, MiningMachineView, MiningSnapshot } from '../types/mining'

type TabId = 'home' | 'machines' | 'gains' | 'history'

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'machines', label: 'Mes machines', icon: 'grid' },
  { id: 'gains', label: 'Mes gains', icon: 'coins' },
  { id: 'history', label: 'Historique', icon: 'clock' },
]

const STATUS_LABELS: Record<MiningMachineStatus, string> = {
  idle: 'À l’arrêt',
  running: 'En marche',
  maintenance: 'Maintenance',
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-white/50">
      i
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-52 -translate-x-1/2 rounded-lg border border-white/10 bg-night px-2.5 py-2 text-[11px] font-normal leading-snug text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

function GpuArt({ status }: { status: MiningMachineStatus }) {
  const active = status === 'running'
  const maintenance = status === 'maintenance'
  const led = maintenance ? '#f59e0b' : active ? '#76b900' : '#3a414d'

  return (
    <div className="overflow-hidden rounded-xl bg-graphite p-1">
      <svg viewBox="0 0 220 110" className="h-24 w-full" aria-hidden="true">
        <rect
          x="8"
          y="10"
          width="204"
          height="90"
          rx="12"
          fill="#0b0d11"
          stroke={active ? '#76b900' : '#2a2f38'}
          strokeWidth="2"
        />
        {[65, 155].map((cx) => (
          <g key={cx}>
            <circle
              cx={cx}
              cy="55"
              r="30"
              fill="#11141a"
              stroke={active ? '#76b900' : '#2a2f38'}
              strokeWidth="2"
            />
            <g className={active ? 'gpu-fan' : undefined} style={{ transformOrigin: `${cx}px 55px` }}>
              {[0, 90, 180, 270].map((angle) => (
                <rect
                  key={angle}
                  x={cx - 3}
                  y="28"
                  width="6"
                  height="27"
                  rx="3"
                  fill={active ? '#8fcc00' : '#3a414d'}
                  transform={`rotate(${angle} ${cx} 55)`}
                />
              ))}
            </g>
            <circle cx={cx} cy="55" r="5" fill={active ? '#76b900' : '#3a414d'} />
          </g>
        ))}
        <circle
          cx="196"
          cy="24"
          r="4"
          fill={led}
          className={active ? 'gpu-led' : maintenance ? 'maint-blink' : undefined}
        />
        <rect x="18" y="86" width="60" height="5" rx="2.5" fill={active ? '#76b900' : '#2a2f38'} />
      </svg>
    </div>
  )
}

function MachineStatusBadge({ status }: { status: MiningMachineStatus }) {
  const tone = status === 'running' ? 'success' : status === 'maintenance' ? 'warning' : 'neutral'
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>
}

function StatBlock({
  label,
  value,
  hint,
  tone = 'text-white',
}: {
  label: string
  value: string
  hint?: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-white/40">{hint}</p> : null}
    </div>
  )
}

interface ConfirmState {
  title: string
  message: string
  label: string
  variant: 'primary' | 'danger' | 'success'
  action: () => void
}

function ConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-100 p-5 anim-pop">
        <h2 className="text-lg font-semibold text-slate-900">{state.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{state.message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant={state.variant} className="flex-1" onClick={onConfirm}>
            {state.label}
          </Button>
        </div>
      </div>
    </div>
  )
}

function WithdrawalButton({
  snapshot,
  remainingMs,
  busy,
  onWithdraw,
}: {
  snapshot: MiningSnapshot
  remainingMs: number
  busy: boolean
  onWithdraw: () => void
}) {
  const canWithdraw = snapshot.canWithdraw && remainingMs <= 0
  const label = canWithdraw
    ? 'RETIRER MES GAINS'
    : remainingMs > 0
      ? `RETRAIT DISPONIBLE DANS ${formatCountdown(remainingMs)}`
      : 'AUCUN GAIN DISPONIBLE'

  return (
    <button
      type="button"
      onClick={onWithdraw}
      disabled={!canWithdraw || busy}
      className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition ${
        canWithdraw
          ? 'bg-gpu-500 text-black hover:bg-gpu-400'
          : 'cursor-not-allowed border border-white/10 bg-white/5 text-white/40'
      }`}
    >
      {label}
    </button>
  )
}

export function MiningPage() {
  const session = authStore.useSession()
  const user = session?.user ?? null
  const snapshot = miningStore.useSnapshot()
  const summary = walletStore.useSummary()

  const [tab, setTab] = useState<TabId>('home')
  const [tick, setTick] = useState(() => Date.now())
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reward, setReward] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const seconds = window.setInterval(() => setTick(Date.now()), 1000)
    const sync = window.setInterval(() => miningStore.refresh(), 15000)
    return () => {
      window.clearInterval(seconds)
      window.clearInterval(sync)
    }
  }, [])

  useEffect(() => {
    if (reward === null) return
    const timeout = window.setTimeout(() => setReward(null), 1600)
    return () => window.clearTimeout(timeout)
  }, [reward])

  const remainingMs = useMemo(() => {
    if (!snapshot?.nextWithdrawalAt) return 0
    return Math.max(0, Date.parse(snapshot.nextWithdrawalAt) - tick)
  }, [snapshot?.nextWithdrawalAt, tick])

  if (!user) return null

  const run = (action: () => void) => {
    setError(null)
    setBusy(true)
    try {
      action()
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  if (!snapshot) {
    return (
      <div>
        <PageHeader title="Mining" eyebrow="GPU simulés" />
        <Card>
          <p className="text-sm text-slate-500">Chargement du simulateur…</p>
        </Card>
      </div>
    )
  }

  const mining = snapshot.status === 'mining'
  const statusLabel =
    snapshot.status === 'mining'
      ? 'Minage en cours'
      : snapshot.status === 'maintenance'
        ? 'Maintenance en cours'
        : 'À l’arrêt'

  const askStart = () =>
    setConfirm({
      title: mining ? 'Arrêter le minage ?' : 'Démarrer le minage ?',
      message: mining
        ? 'Les machines vont s’arrêter et les gains cesseront de s’accumuler.'
        : 'Vos machines vont tourner et accumuler des jetons virtuels (moins l’électricité simulée).',
      label: mining ? 'Arrêter' : 'Démarrer',
      variant: mining ? 'danger' : 'success',
      action: () => run(() => (mining ? miningStore.stop(user) : miningStore.start(user))),
    })

  const askPurchase = (modelId: string, modelName: string, price: number) =>
    setConfirm({
      title: `Ajouter ${modelName} ?`,
      message: `Coût virtuel : ${formatNumber(price)} jetons, débités de votre portefeuille.`,
      label: 'Acheter',
      variant: 'primary',
      action: () => run(() => miningStore.purchase(user, modelId)),
    })

  const askWithdraw = () =>
    setConfirm({
      title: 'Retirer vos gains ?',
      message: `${formatNumber(snapshot.withdrawableAmount)} jetons seront crédités sur votre portefeuille. Prochain retrait dans ${snapshot.settings.cycleHours} h.`,
      label: 'Retirer',
      variant: 'success',
      action: () =>
        run(() => {
          const withdrawal = miningStore.withdraw(user)
          setReward(withdrawal.amount)
        }),
    })

  const askMachineToggle = (machine: MiningMachineView) =>
    setConfirm({
      title: machine.status === 'running' ? `Arrêter ${machine.model.shortName} ?` : `Démarrer ${machine.model.shortName} ?`,
      message:
        machine.status === 'running'
          ? 'Cette machine cessera de produire jusqu’à son redémarrage.'
          : 'Cette machine commencera à produire des gains simulés.',
      label: machine.status === 'running' ? 'Arrêter' : 'Démarrer',
      variant: machine.status === 'running' ? 'danger' : 'success',
      action: () =>
        run(() =>
          miningStore.setMachineRunning(user, machine.id, machine.status !== 'running'),
        ),
    })

  return (
    <div>
      <PageHeader
        eyebrow="GPU simulés"
        title="Mining"
        actions={<Badge tone="success" dot>Retrait toutes les {snapshot.settings.cycleHours} h</Badge>}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1 sm:grid-cols-4">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm ${
              tab === item.id ? 'bg-gpu-500 text-black' : 'text-white/60 hover:bg-white/5'
            }`}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'home' ? (
        <div className="space-y-4">
          <Card className="border-white/10 bg-graphite">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white/45">
                  État du minage
                  <InfoTip text="Le minage est 100 % simulé : aucune machine réelle, aucun revenu réel." />
                </p>
                <p className="mt-1 text-2xl font-bold text-white">{statusLabel}</p>
                <p className="mt-1 text-sm text-white/50">
                  {snapshot.activeMachines} / {snapshot.totalMachines} machine(s) active(s)
                </p>
              </div>
              <button
                type="button"
                onClick={askStart}
                disabled={busy}
                className={`rounded-xl px-6 py-4 text-sm font-black tracking-wide transition disabled:opacity-60 ${
                  mining
                    ? 'border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                    : 'bg-gpu-500 text-black hover:bg-gpu-400'
                }`}
              >
                {mining ? 'ARRÊTER LE MINAGE' : 'DÉMARRER LE MINAGE'}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatBlock
                label="Gains du jour"
                value={`${formatNumber(snapshot.todayRevenue)}`}
                hint="jetons simulés"
                tone="text-gpu-300"
              />
              <StatBlock
                label="Dépenses du jour"
                value={`${formatNumber(snapshot.todayExpenses)}`}
                hint="électricité + achats"
                tone="text-amber-300"
              />
              <StatBlock
                label="Bénéfice net"
                value={`${formatNumber(snapshot.todayNet)}`}
                hint="gains − dépenses"
                tone={snapshot.todayNet >= 0 ? 'text-emerald-300' : 'text-rose-300'}
              />
              <StatBlock
                label="Machines actives"
                value={`${snapshot.activeMachines}`}
                hint={`sur ${snapshot.totalMachines}`}
              />
            </div>
          </Card>

          <Card className="border-white/10 bg-graphite">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white/45">
                  Gains disponibles
                  <InfoTip text="Gains bruts moins l’électricité simulée, prêts à être retirés." />
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums text-white">
                  {formatNumber(snapshot.withdrawableAmount)}
                  <span className="ml-2 text-sm font-medium text-white/40">jetons</span>
                </p>
                <p className="mt-1 text-sm text-white/50">
                  {remainingMs > 0
                    ? `Prochain retrait dans ${formatCountdown(remainingMs)}`
                    : 'Retrait disponible maintenant'}
                </p>
              </div>
              <div className="w-full sm:max-w-xs">
                <WithdrawalButton
                  snapshot={snapshot}
                  remainingMs={remainingMs}
                  busy={busy}
                  onWithdraw={askWithdraw}
                />
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'machines' ? (
        <div className="space-y-4">
          <Card className="border-white/10 bg-graphite">
            <h2 className="text-base font-semibold text-white">Mes machines</h2>
            <p className="mt-1 text-sm text-white/50">
              {snapshot.totalMachines} machine(s) dans votre ferme simulée.
            </p>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {snapshot.machines.map((machine) => (
              <div key={machine.id} className="rounded-2xl border border-white/10 bg-graphite p-4">
                <GpuArt status={machine.status} />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white">{machine.model.name}</p>
                    <p className="text-xs text-white/45">
                      {machine.model.power} TH/s virtuels
                    </p>
                  </div>
                  <MachineStatusBadge status={machine.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/60">
                  <p>
                    Rendement estimé :{' '}
                    <span className="font-semibold text-gpu-300">
                      {formatNumber(machine.model.dailyYield)} / jour
                    </span>
                  </p>
                  <p>
                    Électricité :{' '}
                    <span className="font-semibold text-amber-300">
                      {formatNumber(machine.model.dailyCost)} / jour
                    </span>
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setExpanded(expanded === machine.id ? null : machine.id)}
                  >
                    {expanded === machine.id ? 'Masquer' : 'Voir ma machine'}
                  </Button>
                  <Button
                    size="sm"
                    variant={machine.status === 'running' ? 'outline' : 'success'}
                    className="flex-1"
                    onClick={() => askMachineToggle(machine)}
                    disabled={busy || machine.status === 'maintenance'}
                  >
                    {machine.status === 'running' ? 'Arrêter' : 'Démarrer'}
                  </Button>
                </div>
                {expanded === machine.id ? (
                  <div className="mt-3 space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                    <p>Identifiant : <span className="font-mono text-white/80">{machine.id}</span></p>
                    <p>Total produit : {formatNumber(machine.totalMined)} jetons</p>
                    <p>Installée le {formatDateTime(machine.purchasedAt)}</p>
                    {machine.maintenanceUntil ? (
                      <p className="text-amber-300">
                        Maintenance jusqu’à {formatDateTime(machine.maintenanceUntil)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <Card className="border-white/10 bg-graphite">
            <h2 className="text-base font-semibold text-white">Ajouter une machine</h2>
            <p className="mt-1 text-sm text-white/50">
              Solde disponible : {formatNumber(summary.availableBalance)} jetons.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {MINING_MACHINE_MODELS.map((model) => (
                <div key={model.id} className="rounded-2xl border border-white/10 p-4">
                  <GpuArt status="idle" />
                  <p className="mt-3 text-sm font-bold text-white">{model.name}</p>
                  <p className="mt-1 text-xs text-white/50">{model.description}</p>
                  <div className="mt-3 space-y-1 text-xs text-white/60">
                    <p>{model.power} TH/s virtuels</p>
                    <p>
                      Rendement :{' '}
                      <span className="font-semibold text-gpu-300">
                        {formatNumber(model.dailyYield)} / jour
                      </span>
                    </p>
                    <p>Coût virtuel : {formatNumber(model.price)} jetons</p>
                  </div>
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => askPurchase(model.id, model.name, model.price)}
                    disabled={busy || model.price > summary.availableBalance}
                  >
                    Ajouter
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'gains' ? (
        <div className="space-y-4">
          <Card className="border-white/10 bg-graphite">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white/45">
                  Gains disponibles
                  <InfoTip text="Montant déjà validé par le simulateur et retirable maintenant." />
                </p>
                <p className="mt-1 text-4xl font-black tabular-nums text-gpu-300">
                  {formatNumber(snapshot.withdrawableAmount)}
                  <span className="ml-2 text-sm font-medium text-white/40">jetons</span>
                </p>
                <p className="mt-1 text-sm text-white/50">
                  {remainingMs > 0
                    ? `Prochain retrait dans ${formatCountdown(remainingMs)}`
                    : 'Retrait disponible maintenant'}
                </p>
              </div>
              <div className="w-full sm:max-w-xs">
                <WithdrawalButton
                  snapshot={snapshot}
                  remainingMs={remainingMs}
                  busy={busy}
                  onWithdraw={askWithdraw}
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="border-white/10 bg-graphite">
              <h3 className="text-sm font-semibold text-white">Détail des gains en attente</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between text-white/60">
                  <span>Gains bruts accumulés</span>
                  <span className="font-semibold tabular-nums text-white">
                    {formatNumber(snapshot.pendingGross)}
                  </span>
                </li>
                <li className="flex items-center justify-between text-white/60">
                  <span>Électricité simulée</span>
                  <span className="font-semibold tabular-nums text-amber-300">
                    −{formatNumber(snapshot.pendingCost)}
                  </span>
                </li>
                <li className="flex items-center justify-between border-t border-white/10 pt-2 font-semibold">
                  <span className="text-white">Net retirable</span>
                  <span className="tabular-nums text-gpu-300">
                    {formatNumber(snapshot.pendingBalance)}
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-white/40">
                Les gains en attente ne sont pas encore sur votre portefeuille : ils le seront au
                prochain retrait.
              </p>
            </Card>

            <Card className="border-white/10 bg-graphite">
              <h3 className="text-sm font-semibold text-white">Estimations et total</h3>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between text-white/60">
                  <span className="flex items-center gap-1">
                    Revenu estimé / 24 h
                    <InfoTip text="Estimation affichée : elle n’est pas versée automatiquement." />
                  </span>
                  <span className="font-semibold tabular-nums text-white">
                    {formatNumber(snapshot.estimatedDailyRevenue)}
                  </span>
                </li>
                <li className="flex items-center justify-between text-white/60">
                  <span>Coût estimé / 24 h</span>
                  <span className="font-semibold tabular-nums text-amber-300">
                    {formatNumber(snapshot.estimatedDailyCost)}
                  </span>
                </li>
                <li className="flex items-center justify-between text-white/60">
                  <span>Net estimé / 24 h</span>
                  <span className="font-semibold tabular-nums text-gpu-300">
                    {formatNumber(snapshot.estimatedDailyNet)}
                  </span>
                </li>
                <li className="flex items-center justify-between border-t border-white/10 pt-2 text-white/60">
                  <span>Total miné</span>
                  <span className="font-semibold tabular-nums text-white">
                    {formatNumber(snapshot.totalMined)}
                  </span>
                </li>
                <li className="flex items-center justify-between text-white/60">
                  <span>Total déjà crédité</span>
                  <span className="font-semibold tabular-nums text-white">
                    {formatNumber(snapshot.totalWithdrawn)}
                  </span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="space-y-4">
          <Card className="border-white/10 bg-graphite" padded={false}>
            <div className="p-5 pb-0">
              <h2 className="text-base font-semibold text-white">Mes retraits</h2>
            </div>
            {snapshot.withdrawals.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="coins"
                  title="Aucun retrait pour l’instant"
                  description="Retirez vos gains une fois le cycle terminé."
                />
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {snapshot.withdrawals.map((withdrawal) => (
                  <li
                    key={withdrawal.id}
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        +{formatNumber(withdrawal.amount)} jetons
                      </p>
                      <p className="text-xs text-white/45">
                        Crédité le {formatDateTime(withdrawal.requestedAt)}
                      </p>
                    </div>
                    <Badge tone="success">Crédité</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="border-white/10 bg-graphite" padded={false}>
            <div className="p-5 pb-0">
              <h2 className="text-base font-semibold text-white">Activité</h2>
            </div>
            {snapshot.events.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="clock"
                  title="Aucune activité"
                  description="Démarrez une machine pour voir l’historique."
                />
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {snapshot.events.slice(0, 20).map((event) => (
                  <li key={event.id} className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-white">{event.title}</p>
                      <p className="text-xs text-white/45">{event.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-white/35">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {reward !== null ? (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center">
          <span className="anim-coin rounded-full bg-gpu-500 px-4 py-2 text-sm font-bold text-black shadow-lg">
            +{formatNumber(reward)} jetons
          </span>
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const action = confirm.action
            setConfirm(null)
            action()
          }}
        />
      ) : null}
    </div>
  )
}
