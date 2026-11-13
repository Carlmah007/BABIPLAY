import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ButtonLink } from '../components/ui/ButtonLink'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/forms/TextField'
import { ticTacToeStore } from '../stores/ticTacToeStore'
import { authStore } from '../stores/authStore'
import { walletStore } from '../stores/walletStore'
import { toUserMessage } from '../lib/errors'
import { formatNumber } from '../lib/format'
import {
  TIC_TAC_TOE_MULTIPLIERS,
  TIC_TAC_TOE_STAKE_LIMITS,
} from '../features/tic-tac-toe/engine'
import type { TicTacToeCell, TicTacToeLevel } from '../types/games'

const LEVEL_LABELS: Record<TicTacToeLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  expert: 'Expert',
}

const QUICK_STAKES = [0, 50, 100, 250, 500]
const EMPTY_BOARD: TicTacToeCell[] = Array.from({ length: 9 }, () => null)

export function TicTacToePage() {
  const game = ticTacToeStore.useActiveGame()
  const history = ticTacToeStore.useHistory()
  const session = authStore.useSession()
  const summary = walletStore.useSummary()
  const userId = session?.user.id ?? null
  const [level, setLevel] = useState<TicTacToeLevel>('intermediate')
  const [humanMark, setHumanMark] = useState<'X' | 'O'>('X')
  const [stake, setStake] = useState('100')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncedGame, setSyncedGame] = useState(game ?? null)

  useEffect(() => {
    if (userId) ticTacToeStore.setUser(userId)
  }, [userId])

  // Recharge les contrôles sur la partie active (ex. après un rafraîchissement).
  // Ajustement d'état pendant le rendu (pattern React) au lieu d'un effet.
  if (game !== syncedGame) {
    setSyncedGame(game)
    if (game) {
      setLevel(game.level)
      setHumanMark(game.humanMark)
      setStake(String(game.stake))
    }
  }

  const isPlaying = Boolean(game && game.status === 'playing')
  const parsedStake = Number(stake.replace(/\s/g, '').replace(',', '.'))
  const safeStake = Number.isFinite(parsedStake) ? Math.max(0, Math.round(parsedStake)) : 0
  const stakeInvalid = safeStake > 0 && safeStake < TIC_TAC_TOE_STAKE_LIMITS.min
  const multiplier = isPlaying && game ? (game.multiplier ?? TIC_TAC_TOE_MULTIPLIERS[game.level]) : TIC_TAC_TOE_MULTIPLIERS[level]
  const displayStake = isPlaying && game ? game.stake : safeStake
  const potentialPayout = Math.round(displayStake * multiplier)
  const maxStake = Math.min(TIC_TAC_TOE_STAKE_LIMITS.max, summary.availableBalance)

  const handleCreate = () => {
    if (!userId) {
      setError('Connectez-vous pour jouer.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      ticTacToeStore.create(level, humanMark, safeStake)
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handlePlay = (index: number) => {
    if (!game || game.status !== 'playing' || game.currentTurn !== game.humanMark) return
    setError(null)
    setBusy(true)
    try {
      ticTacToeStore.play(index)
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const resultPnl = game?.pnl ?? null
  const resultPayout = game?.payout ?? 0
  const humanWon = game?.status === 'won' && game.result.winner === game.humanMark
  // Après une manche (victoire, défaite ou match nul), le plateau est vidé
  // pour laisser place à une nouvelle partie.
  const displayBoard = game && game.status === 'playing' ? game.board : EMPTY_BOARD

  return (
    <div>
      <PageHeader
        eyebrow="Tic-Tac-Toe"
        title="Morpion à cotes, contre une IA Minimax"
        description="Choisissez votre niveau, engagez une mise et encaissez selon la cote publiée. Match nul : mise remboursée."
        actions={
          <>
            <Badge tone="brand" dot>
              Solde : {formatNumber(summary.availableBalance)} jetons
            </Badge>
            <ButtonLink
              to="/payments"
              size="sm"
              variant="outline"
              leftIcon={<Icon name="coins" size={15} />}
            >
              Retirer
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="min-w-0">
          <CardHeader
            title="Mise et niveau"
            description="La cote est figée à la création de la partie."
            action={<Badge tone="neutral">Cote {multiplier.toFixed(2)}×</Badge>}
          />
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Niveau de l'IA</p>
              <div className="grid grid-cols-3 gap-2">
                {(['beginner', 'intermediate', 'expert'] as TicTacToeLevel[]).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={level === value ? 'primary' : 'secondary'}
                    onClick={() => setLevel(value)}
                    disabled={isPlaying}
                    className="flex-col gap-0.5 py-2"
                  >
                    <span>{LEVEL_LABELS[value]}</span>
                    <span className="text-[11px] font-medium opacity-80">
                      {TIC_TAC_TOE_MULTIPLIERS[value].toFixed(2)}×
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Vous jouez</p>
              <div className="flex gap-2">
                {(['X', 'O'] as const).map((mark) => (
                  <Button
                    key={mark}
                    size="sm"
                    variant={humanMark === mark ? 'primary' : 'secondary'}
                    onClick={() => setHumanMark(mark)}
                    disabled={isPlaying}
                  >
                    {mark}
                    <span className="text-[11px] font-medium opacity-70">
                      {mark === 'X' ? 'commence' : 'second'}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Mise (jetons)</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {QUICK_STAKES.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={safeStake === value ? 'primary' : 'secondary'}
                    onClick={() => setStake(String(value))}
                    disabled={isPlaying}
                  >
                    {value === 0 ? 'Gratuit' : formatNumber(value)}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStake(String(Math.max(TIC_TAC_TOE_STAKE_LIMITS.min, maxStake)))}
                  disabled={isPlaying || maxStake < TIC_TAC_TOE_STAKE_LIMITS.min}
                >
                  Max
                </Button>
              </div>
              <TextField
                label="Montant engagé"
                type="number"
                min={0}
                max={TIC_TAC_TOE_STAKE_LIMITS.max}
                step={10}
                inputMode="numeric"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                disabled={isPlaying}
                hint={`0 = partie gratuite · mise payante de ${formatNumber(
                  TIC_TAC_TOE_STAKE_LIMITS.min,
                )} à ${formatNumber(TIC_TAC_TOE_STAKE_LIMITS.max)} jetons.`}
              />
              {stakeInvalid ? (
                <p className="mt-1.5 text-xs font-medium text-rose-600">
                  Mise minimale : {formatNumber(TIC_TAC_TOE_STAKE_LIMITS.min)} jetons, ou 0 pour jouer
                  gratuitement.
                </p>
              ) : null}
              {safeStake > 0 && safeStake > summary.availableBalance ? (
                <p className="mt-1.5 text-xs font-medium text-rose-600">
                  Solde insuffisant : {formatNumber(summary.availableBalance)} jetons disponibles.
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Mise</dt>
                  <dd className="font-semibold text-slate-900">{formatNumber(displayStake)} jetons</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Gain si victoire ({multiplier.toFixed(2)}×)</dt>
                  <dd className="font-semibold text-emerald-600">
                    {formatNumber(potentialPayout)} jetons
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Match nul</dt>
                  <dd className="font-medium text-slate-700">
                    {formatNumber(displayStake)} jetons remboursés
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Défaite</dt>
                  <dd className="font-medium text-rose-600">mise perdue</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Le gain net = gain brut − mise. La mise est débitée une seule fois au lancement.
              </p>
            </div>

            {!isPlaying ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={handleCreate}
                loading={busy}
                disabled={!userId || safeStake > summary.availableBalance || stakeInvalid}
              >
                {safeStake > 0
                  ? `Miser ${formatNumber(safeStake)} jetons et jouer`
                  : 'Jouer gratuitement'}
              </Button>
            ) : (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <p>
                  Partie en cours : la mise de {formatNumber(game?.stake ?? 0)} jetons est engagée.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => ticTacToeStore.abandon()}
                >
                  Abandonner (mise remboursée)
                </Button>
              </div>
            )}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            {!userId && <p className="text-sm text-amber-600">Connectez-vous pour jouer.</p>}
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title="Plateau"
            description={
              game
                ? game.status === 'playing'
                  ? `Tour de ${game.currentTurn} · ${LEVEL_LABELS[game.level]} · cote ${(game.multiplier ?? TIC_TAC_TOE_MULTIPLIERS[game.level]).toFixed(2)}×`
                  : game.status === 'won'
                    ? `Victoire de ${game.result.winner}`
                    : 'Match nul'
                : 'Aucune partie en cours'
            }
            action={
              game && game.stake > 0 ? (
                <Badge tone="warning">Mise {formatNumber(game.stake)}</Badge>
              ) : (
                <Badge tone="neutral">Gratuit</Badge>
              )
            }
          />
          {game ? (
            <div className="space-y-4">
              <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2 sm:gap-3">
                {displayBoard.map((cell, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Case ${index + 1}${cell ? `, ${cell}` : ', vide'}`}
                    disabled={
                      busy ||
                      game.status !== 'playing' ||
                      game.currentTurn !== game.humanMark ||
                      cell !== null
                    }
                    onClick={() => handlePlay(index)}
                    className={`flex aspect-square w-full items-center justify-center rounded-xl border text-3xl font-bold transition sm:text-4xl ${
                      cell === 'X'
                        ? 'border-brand-300/60 bg-brand-50 text-brand-700'
                        : cell === 'O'
                          ? 'border-amber-500/40 bg-amber-50 text-amber-600'
                          : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    {cell}
                  </button>
                ))}
              </div>

              {game.status !== 'playing' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">
                    {humanWon
                      ? 'Vous avez gagné.'
                      : game.status === 'draw'
                        ? 'Match nul.'
                        : "L'IA a gagné."}
                  </p>
                  {game.stake > 0 ? (
                    <dl className="mt-2 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <dt>Mise engagée</dt>
                        <dd className="font-medium text-slate-700">{formatNumber(game.stake)} jetons</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt>Montant rendu</dt>
                        <dd className="font-semibold text-slate-900">
                          {formatNumber(resultPayout)} jetons
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt>Gain net</dt>
                        <dd
                          className={
                            (resultPnl ?? 0) > 0
                              ? 'font-semibold text-emerald-600'
                              : (resultPnl ?? 0) < 0
                                ? 'font-semibold text-rose-600'
                                : 'font-semibold text-slate-600'
                          }
                        >
                          {(resultPnl ?? 0) > 0 ? '+' : ''}
                          {formatNumber(resultPnl ?? 0)} jetons
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-1">Partie gratuite : aucun jeton engagé.</p>
                  )}
                  {game.lastAiMove !== null && (
                    <p className="mt-2 text-xs text-slate-500">
                      Dernier coup de l'IA : case {game.lastAiMove + 1}.
                    </p>
                  )}
                  {resultPayout > 0 ? (
                    <ButtonLink
                      to="/payments"
                      size="sm"
                      variant="success"
                      className="mt-3"
                      leftIcon={<Icon name="coins" size={15} />}
                    >
                      Retirer mes gains
                    </ButtonLink>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon="grid"
              title="Aucune partie"
              description="Choisissez un niveau, une mise et lancez une partie."
            />
          )}
        </Card>
      </section>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader
            title="Historique"
            description="Chaque partie terminée est réglée une seule fois et tracée dans le ledger."
          />
        </div>
        {history.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="grid"
              title="Aucune partie terminée"
              description="Votre historique apparaîtra ici."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.map((item) => {
              const won = item.status === 'won' && item.result.winner === item.humanMark
              return (
                <li key={item.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {won ? 'Victoire' : item.status === 'draw' ? 'Match nul' : 'Défaite'}
                        {item.stake > 0 ? ` · mise ${formatNumber(item.stake)}` : ' · gratuit'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {LEVEL_LABELS[item.level]} · {item.moveCount} coup(s) ·{' '}
                        {item.startedAt.slice(0, 10)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          (item.pnl ?? 0) > 0
                            ? 'text-sm font-semibold text-emerald-600'
                            : (item.pnl ?? 0) < 0
                              ? 'text-sm font-semibold text-rose-600'
                              : 'text-sm font-semibold text-slate-500'
                        }
                      >
                        {(item.pnl ?? 0) > 0 ? '+' : ''}
                        {formatNumber(item.pnl ?? 0)} jetons
                      </p>
                      <Badge tone={item.settledAt ? 'success' : 'neutral'}>
                        {item.settledAt ? 'Réglée' : 'En attente'}
                      </Badge>
                    </div>
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
