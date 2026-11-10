import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { TextField } from '../components/forms/TextField'
import { aviatorStore } from '../stores/aviatorStore'
import { formatNumber } from '../lib/format'
import { formatDateTime } from '../lib/dates'
import { AVIATOR_RULES } from '../features/aviator/engine'
import { aviatorService } from '../services/aviatorService'
import { toUserMessage } from '../lib/errors'
import { walletStore } from '../stores/walletStore'

interface CurvePoint {
  t: number
  m: number
}

const QUICK_STAKES = [100, 250, 500, 1000]
const EMPTY_POINTS: CurvePoint[] = []

const PaperPlaneLazy = lazy(() =>
  import('../components/game/PaperPlane').then((module) => ({ default: module.PaperPlane })),
)

function PaperPlane({
  playing,
  size,
  className,
}: {
  playing?: boolean
  size?: number
  className?: string
}) {
  return (
    <Suspense
      fallback={
        <span
          aria-hidden="true"
          className={className}
          style={{ display: 'block', width: size ?? 96, height: size ?? 96 }}
        />
      }
    >
      <PaperPlaneLazy playing={playing} size={size} className={className} />
    </Suspense>
  )
}

function buildChart(points: CurvePoint[]) {
  if (points.length < 2) return null
  const maxT = Math.max(points[points.length - 1].t, 1)
  const maxM = Math.max(...points.map((point) => point.m), 1.02)
  const span = Math.max(maxM - 1, 0.02)
  const coords = points.map((point) => ({
    x: (point.t / maxT) * 100,
    y: 92 - ((point.m - 1) / span) * 76,
  }))
  const first = coords[0]
  const last = coords[coords.length - 1]
  const line =
    `M${first.x.toFixed(2)},${first.y.toFixed(2)} ` +
    coords
      .slice(1)
      .map((coord) => `L${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
      .join(' ')
  const area = `${line} L${last.x.toFixed(2)},100 L${first.x.toFixed(2)},100 Z`
  return { line, area, last }
}

export function AviatorPage() {
  const active = aviatorStore.useActiveRound()
  const history = aviatorStore.useHistory()
  const userId = walletStore.useUserId()
  const [stake, setStake] = useState('100')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [serverMultiplier, setServerMultiplier] = useState(1)
  const [curve, setCurve] = useState<{ roundId: string | null; points: CurvePoint[] }>({
    roundId: null,
    points: [],
  })

  const roundId = active?.roundId ?? null
  const isRunning = active?.status === 'running'
  const isSettled = active?.status === 'settled'

  useEffect(() => {
    if (userId) aviatorStore.setUser(userId)
  }, [userId])

  useEffect(() => {
    if (!active || active.status !== 'running') return
    const started = Date.parse(active.startedAt)
    const tick = () => {
      const now = Date.now()
      const ms = Math.max(0, now - started)
      const info = aviatorService.getServerMultiplier(active.roundId, new Date(now).toISOString())
      setElapsed(ms)
      setServerMultiplier(info.multiplier)
      setCurve((previous) => {
        const points =
          previous.roundId === active.roundId
            ? [...previous.points, { t: ms, m: info.multiplier }]
            : [{ t: ms, m: info.multiplier }]
        return {
          roundId: active.roundId,
          points: points.length > 900 ? points.slice(points.length - 900) : points,
        }
      })
      if (info.crashed) aviatorStore.refresh()
    }
    tick()
    const interval = window.setInterval(tick, 100)
    return () => window.clearInterval(interval)
  }, [active])

  const canCashout = isRunning && !busy

  const handleStart = () => {
    setError(null)
    setBusy(true)
    try {
      aviatorStore.start(Number(stake))
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleCashout = () => {
    setError(null)
    setBusy(true)
    try {
      aviatorStore.cashout(new Date().toISOString())
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const recent = useMemo(() => history.slice(0, 8), [history])
  const points = curve.roundId === roundId ? curve.points : EMPTY_POINTS
  const chart = useMemo(() => buildChart(points), [points])

  const crashed = isSettled && !active?.cashoutMultiplier
  const settledMultiplier = active?.cashoutMultiplier ?? active?.crashPoint ?? 1
  const displayMultiplier = isRunning ? serverMultiplier : settledMultiplier
  const cashoutPayout = active ? Math.max(0, Math.round(serverMultiplier * active.stake)) : 0

  const statusLabel = isRunning
    ? 'Manche en direct'
    : isSettled
      ? crashed
        ? 'Crash'
        : 'Retrait validé'
      : 'Prêt à jouer'

  const subLabel = isRunning
    ? 'Le multiplicateur grimpe…'
    : isSettled
      ? crashed
        ? `Crash à ${settledMultiplier.toFixed(2)}x`
        : `Retrait à ${settledMultiplier.toFixed(2)}x`
      : 'Lancez une manche pour commencer'

  return (
    <div>
      <PageHeader
        eyebrow="Aviator"
        title="Le multiplicateur qui grimpe"
        description="Misez, puis retirez avant le crash. Plus vous attendez, plus vous gagnez — et plus vous risquez."
      />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card padded={false} className="overflow-hidden">
          {active ? (
            <>
              <div className={`relative overflow-hidden bg-night ${crashed ? 'anim-shake' : ''}`}>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                />
                <div className="relative h-72">
                  <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="aviator-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={crashed ? '#fb7185' : '#a78bfa'} stopOpacity="0.45" />
                        <stop offset="100%" stopColor={crashed ? '#fb7185' : '#a78bfa'} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {chart ? (
                      <>
                        <path d={chart.area} fill="url(#aviator-area)" />
                        <path
                          d={chart.line}
                          fill="none"
                          stroke={crashed ? '#fb7185' : '#c4b5fd'}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle cx={chart.last.x} cy={chart.last.y} r="1.2" fill="#ffffff" className="anim-glow" />
                      </>
                    ) : null}
                  </svg>

                  {chart ? (
                    <div
                      className="pointer-events-none absolute z-10"
                      style={{
                        left: `${chart.last.x}%`,
                        top: `${chart.last.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <PaperPlane size={64} playing={isRunning} className="drop-shadow-[0_0_14px_rgba(200,255,0,0.6)]" />
                    </div>
                  ) : null}

                  <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                        isRunning
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : crashed
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {isRunning ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-current" />
                      )}
                      {statusLabel}
                    </span>
                    {isRunning ? (
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium tabular-nums text-white/60">
                        {(elapsed / 1000).toFixed(1)} s
                      </span>
                    ) : null}
                  </div>

                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: 'radial-gradient(circle at center, rgba(2,6,23,0.7), transparent 68%)',
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/45">
                      Multiplicateur
                    </p>
                    <p
                      className={`mt-1 text-6xl font-black tabular-nums ${
                        isRunning ? 'text-white' : crashed ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {displayMultiplier.toFixed(2)}
                      <span className="text-3xl">x</span>
                    </p>
                    <p className="mt-2 text-sm text-white/55">{subLabel}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-medium text-slate-500">Mise</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                      {formatNumber(active.stake)}{' '}
                      <span className="text-xs font-medium text-slate-400">jetons</span>
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl p-4 ${
                      isSettled ? (crashed ? 'bg-rose-50' : 'bg-emerald-50') : 'bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-medium text-slate-500">Résultat</p>
                    <p
                      className={`mt-1 text-lg font-semibold tabular-nums ${
                        isSettled ? (crashed ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-900'
                      }`}
                    >
                      {isSettled
                        ? `${(active.pnl ?? 0) >= 0 ? '+' : ''}${formatNumber(active.pnl ?? 0)}`
                        : 'En cours'}
                      <span className="ml-1 text-xs font-medium text-slate-400">jetons</span>
                    </p>
                  </div>
                </div>

                {isRunning ? (
                  <Button
                    variant="success"
                    size="lg"
                    className="w-full anim-pop"
                    onClick={handleCashout}
                    disabled={!canCashout}
                    loading={busy}
                  >
                    Retirer · {formatNumber(cashoutPayout)} jetons
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {QUICK_STAKES.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setStake(String(amount))}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums transition ${
                            stake === String(amount)
                              ? 'border-brand-300 bg-brand-50 text-brand-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {formatNumber(amount)}
                        </button>
                      ))}
                    </div>
                    <TextField
                      label="Mise (jetons)"
                      value={stake}
                      onChange={(event) => setStake(event.target.value)}
                      inputMode="numeric"
                    />
                    <Button variant="primary" size="lg" className="w-full" onClick={handleStart} loading={busy}>
                      Nouvelle manche
                    </Button>
                  </div>
                )}

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              </div>
            </>
          ) : (
            <>
              <div className="relative overflow-hidden bg-night">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'radial-gradient(600px circle at 50% 0%, rgba(139,92,246,0.35), transparent 60%)',
                  }}
                />
                <div className="relative flex h-72 flex-col items-center justify-center gap-3">
                  <div className="anim-float drop-shadow-[0_0_26px_rgba(200,255,0,0.45)]">
                    <PaperPlane size={132} />
                  </div>
                  <p className="text-xl font-semibold text-white">Prêt à décoller ?</p>
                  <p className="max-w-xs text-center text-sm text-slate-400">
                    Choisissez votre mise, puis retirez avant le crash.
                  </p>
                </div>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  {QUICK_STAKES.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setStake(String(amount))}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums transition ${
                        stake === String(amount)
                          ? 'border-brand-300 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {formatNumber(amount)}
                    </button>
                  ))}
                </div>
                <TextField
                  label="Mise (jetons)"
                  value={stake}
                  onChange={(event) => setStake(event.target.value)}
                  inputMode="numeric"
                />
                <Button variant="primary" size="lg" className="w-full" onClick={handleStart} loading={busy}>
                  Démarrer une manche
                </Button>
                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Dernières manches" />
          {recent.length === 0 ? (
            <EmptyState
              icon="plane"
              title="Aucune manche jouée"
              description="Vos résultats apparaîtront ici."
              className="py-6"
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {recent.map((round, index) => {
                const value = round.cashoutMultiplier ?? round.crashPoint
                const won = round.cashoutMultiplier != null
                return (
                  <span
                    key={round.roundId}
                    title={formatDateTime(round.startedAt)}
                    className={`anim-pop rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${
                      won ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                    }`}
                    style={{ animationDelay: `${index * 35}ms` }}
                  >
                    {value.toFixed(2)}x
                  </span>
                )
              })}
            </div>
          )}

          <details className="group mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700">
              Règles & vérifiabilité
              <Icon name="spark" size={14} className="text-slate-400" />
            </summary>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-500">
              <li>Marge maison : {AVIATOR_RULES.houseEdge * 100}%.</li>
              <li>Multiplicateur plafonné à {AVIATOR_RULES.maxMultiplier}x.</li>
              <li>Crash arrondi au centième, minimum 1.01x.</li>
              <li>Résultat verrouillé avant la manche, révélé après.</li>
            </ul>
            {isSettled ? (
              <div className="mt-3 space-y-1 rounded-lg bg-white p-3 text-xs text-slate-500 ring-1 ring-slate-100">
                <p>
                  Hash du seed :{' '}
                  <span className="font-mono">{active?.serverSeedHash.slice(0, 18)}…</span>
                </p>
                <p>
                  Nonce : <span className="font-mono">{active?.nonce.slice(0, 12)}…</span>
                </p>
              </div>
            ) : null}
          </details>
        </Card>
      </section>
    </div>
  )
}
