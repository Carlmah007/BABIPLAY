import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Icon } from '../components/ui/Icon'
import { TextField } from '../components/forms/TextField'
import { tradingStore } from '../stores/tradingStore'
import { formatNumber, formatPercent } from '../lib/format'
import { formatDateTime } from '../lib/dates'
import { TRADING_RULES } from '../services/tradingService'
import { toUserMessage } from '../lib/errors'
import { walletStore } from '../stores/walletStore'

const QUICK_STAKES = [100, 500, 1000, 5000]

const PRICE_DECIMALS: Record<string, number> = {
  BTC: 2,
  ETH: 4,
  EURUSD: 4,
  GOLD: 2,
  NASDAQ: 2,
}

const CLOSE_REASON_LABELS: Record<string, string> = {
  manual: 'Fermée',
  stop_loss: 'Stop-loss',
  take_profit: 'Objectif atteint',
  expired: 'Terminée',
}

function formatPrice(symbol: string, price: number): string {
  const decimals = PRICE_DECIMALS[symbol] ?? 2
  return price.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function buildSeries(values: number[]) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, Math.abs(max) * 1e-6 || 1e-9)
  const coords = values.map((value, index) => ({
    x: (index / (values.length - 1)) * 100,
    y: 92 - ((value - min) / span) * 76,
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

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) {
    return <span aria-hidden="true" className="block h-6 w-full rounded bg-slate-100/80" />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, Math.abs(max) * 1e-6 || 1e-9)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 64
      const y = 22 - ((value - min) / span) * 18
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      viewBox="0 0 64 24"
      preserveAspectRatio="none"
      className={`h-6 w-full ${positive ? 'text-emerald-500' : 'text-rose-500'}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function TradingPage() {
  const quotes = tradingStore.useQuotes()
  const positions = tradingStore.usePositions()
  const selected = tradingStore.useSelectedSymbol()
  const userId = walletStore.useUserId()
  const [stake, setStake] = useState('500')
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [duration, setDuration] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [histories, setHistories] = useState<Record<string, number[]>>({})
  const [syncedQuotes, setSyncedQuotes] = useState(quotes)

  useEffect(() => {
    if (userId) tradingStore.setUser(userId)
    const interval = window.setInterval(() => tradingStore.sync(), 5000)
    return () => window.clearInterval(interval)
  }, [userId])

  // Accumule l'historique des prix pendant le rendu (pattern React) au lieu
  // d'un effet qui re-déclenche un rendu à chaque tick.
  if (quotes !== syncedQuotes) {
    setSyncedQuotes(quotes)
    setHistories((previous) => {
      let changed = false
      const next: Record<string, number[]> = { ...previous }
      for (const quote of quotes) {
        const series = [...(next[quote.symbol] ?? [])]
        if (series[series.length - 1] !== quote.price) {
          series.push(quote.price)
          if (series.length > 60) series.shift()
          next[quote.symbol] = series
          changed = true
        }
      }
      return changed ? next : previous
    })
  }

  const selectedQuote = quotes.find((quote) => quote.symbol === selected)
  const chart = buildSeries(histories[selected] ?? [])
  const positive = selectedQuote ? selectedQuote.changePercent >= 0 : true

  const handleOpen = () => {
    if (!userId) return
    setError(null)
    setBusy(true)
    try {
      tradingStore.open({
        userId,
        symbol: selected,
        direction,
        stake: Number(stake),
        stopLossPercent: stopLoss ? Number(stopLoss) : null,
        takeProfitPercent: takeProfit ? Number(takeProfit) : null,
        durationMinutes: duration ? Number(duration) : 1,
      })
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleClose = (positionId: string) => {
    setError(null)
    setBusy(true)
    try {
      tradingStore.close(positionId)
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Trading" />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {quotes.length === 0
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-[118px] animate-pulse rounded-2xl bg-slate-100" />
            ))
          : quotes.map((quote, index) => {
              const up = quote.changePercent >= 0
              const isSelected = quote.symbol === selected
              return (
                <button
                  key={quote.symbol}
                  type="button"
                  onClick={() => tradingStore.setSelectedSymbol(quote.symbol)}
                  className={`anim-fade-up rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-brand-300 bg-white shadow-[0_10px_30px_-18px_rgba(109,40,217,0.6)] ring-2 ring-brand-200'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md'
                  }`}
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{quote.symbol}</span>
                    <Icon
                      name={up ? 'trend-up' : 'trend-down'}
                      size={16}
                      className={up ? 'text-emerald-500' : 'text-rose-500'}
                    />
                  </div>
                  <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
                    {formatPrice(quote.symbol, quote.price)}
                  </p>
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      up ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {formatPercent(quote.changePercent)}
                  </p>
                  <div className="mt-2">
                    <Sparkline values={histories[quote.symbol] ?? []} positive={up} />
                  </div>
                </button>
              )
            })}
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card padded={false} className="overflow-hidden">
          <div className="relative overflow-hidden bg-night p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(520px circle at 20% 0%, rgba(139,92,246,0.22), transparent 60%)',
              }}
            />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  {selected}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                  {selectedQuote ? formatPrice(selected, selectedQuote.price) : '—'}
                </p>
              </div>
              {selectedQuote ? (
                <span
                  className={`anim-pop rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                    positive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {formatPercent(selectedQuote.changePercent)}
                </span>
              ) : null}
            </div>
            <div className="relative mt-4 h-44">
              {chart ? (
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="trading-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={positive ? '#34d399' : '#fb7185'} stopOpacity="0.4" />
                      <stop offset="100%" stopColor={positive ? '#34d399' : '#fb7185'} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={chart.area} fill="url(#trading-area)" />
                  <path
                    d={chart.line}
                    fill="none"
                    stroke={positive ? '#34d399' : '#fb7185'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={chart.last.x} cy={chart.last.y} r="1.2" fill="#ffffff" className="anim-glow" />
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-white/45">
                  Le graphique se dessine…
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900">Ton pari</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sur <span className="font-semibold text-slate-700">{selected}</span>, tu penses que le
            prix va…
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDirection('long')}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-4 text-sm font-bold transition ${
                direction === 'long'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
              }`}
            >
              <Icon name="trend-up" size={24} />
              Ça monte
            </button>
            <button
              type="button"
              onClick={() => setDirection('short')}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-4 text-sm font-bold transition ${
                direction === 'short'
                  ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200'
              }`}
            >
              <Icon name="trend-down" size={24} />
              Ça baisse
            </button>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500">Mise</p>
            <div className="mt-2 flex flex-wrap gap-2">
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
            <div className="mt-3">
              <TextField
                label="Autre montant (jetons)"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Durée de la manche : <span className="font-semibold text-slate-700">{duration} min</span>
          </p>

          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={handleOpen} loading={busy}>
            Jouer cette manche
          </Button>

          <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700">
              Options avancées
              <Icon name="settings" size={14} className="text-slate-400" />
            </summary>
            <div className="mt-3 space-y-3">
              <TextField
                label="Durée (minutes)"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                inputMode="numeric"
              />
              <TextField
                label="Stop-loss % (facultatif)"
                value={stopLoss}
                onChange={(event) => setStopLoss(event.target.value)}
                inputMode="decimal"
              />
              <TextField
                label="Take-profit % (facultatif)"
                value={takeProfit}
                onChange={(event) => setTakeProfit(event.target.value)}
                inputMode="decimal"
              />
              <p className="text-xs text-slate-400">
                Stop-loss : {TRADING_RULES.stopLossPercent.min} % à {TRADING_RULES.stopLossPercent.max} %.
                Take-profit : {TRADING_RULES.takeProfitPercent.min} % à{' '}
                {TRADING_RULES.takeProfitPercent.max} %.
              </p>
            </div>
          </details>

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </Card>
      </section>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <h2 className="text-base font-semibold text-slate-900">Mes parties</h2>
        </div>
        {positions.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="spark"
              title="Aucune partie pour l'instant"
              description="Choisis un marché et lance ta première manche."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {positions.map((position, index) => {
              const pnl = position.pnl ?? 0
              const up = position.direction === 'long'
              return (
                <li
                  key={position.id}
                  className="anim-fade-up flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-xl ${
                        up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      <Icon name={up ? 'trend-up' : 'trend-down'} size={20} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {position.symbol} · {up ? 'Ça monte' : 'Ça baisse'} ·{' '}
                        {formatNumber(position.stake)} jetons
                      </p>
                      <p className="text-xs text-slate-500">
                        {position.status === 'open'
                          ? 'Manche en cours'
                          : `Résultat : ${pnl >= 0 ? '+' : ''}${formatNumber(pnl)} jetons`}
                        <span className="text-slate-400"> · {formatDateTime(position.openedAt)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        position.status === 'open' ? 'brand' : pnl >= 0 ? 'success' : 'danger'
                      }
                    >
                      {position.status === 'open'
                        ? 'En cours'
                        : CLOSE_REASON_LABELS[position.closeReason ?? ''] ?? 'Terminée'}
                    </Badge>
                    {position.status === 'open' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleClose(position.id)}
                        disabled={busy}
                      >
                        Arrêter
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
