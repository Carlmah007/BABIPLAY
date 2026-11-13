import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/forms/TextField'
import { authService } from '../services/authService'
import { auditService } from '../services/auditService'
import { paymentService, PAYMENT_RULES } from '../services/paymentService'
import { walletService } from '../services/walletService'
import { gameBoostService, type GameBoost } from '../services/gameBoostService'
import { referralService } from '../services/referralService'
import { roleEmailService } from '../services/roleEmailService'
import { authStore } from '../stores/authStore'
import {
  assignableRoles,
  canAccessAdminPanel,
  canAssignRole,
  canManagePayments,
  canManageRoles,
  canSuspendUsers,
} from '../lib/permissions'
import { formatDateTime } from '../lib/dates'
import { toUserMessage } from '../lib/errors'
import { formatNumber } from '../lib/format'
import { WITHDRAWAL_METHOD_LABELS, type PaymentIntent } from '../types/payments'
import type { AppUser, Role } from '../types/auth'

const ROLE_LABELS: Record<Role, string> = {
  player: 'Joueur',
  moderator: 'Modérateur',
  admin: 'Admin',
  super_admin: 'Super Admin',
}

const ROLE_EMAIL_ROLES: readonly Role[] = ['moderator', 'admin', 'super_admin']

export function AdminPage() {
  const session = authStore.useSession()
  const user = session?.user ?? null
  const [users, setUsers] = useState<AppUser[]>(() => authService.listUsers())
  const [audits, setAudits] = useState(() => auditService.list())
  const [pendingPayments, setPendingPayments] = useState<PaymentIntent[]>(() =>
    paymentService.listPendingWithdrawals(),
  )
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [justification, setJustification] = useState('')
  const [paymentJustification, setPaymentJustification] = useState('')
  const [roleTarget, setRoleTarget] = useState<Role>('player')
  const [error, setError] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Affiliation
  const [myReferrals, setMyReferrals] = useState(() =>
    user && (user.role === 'admin' || user.role === 'super_admin')
      ? referralService.listFor(user.id)
      : [],
  )
  const [allReferrals, setAllReferrals] = useState<ReturnType<typeof referralService.listAll>>([])
  const [referralCopied, setReferralCopied] = useState(false)

  // Rôles par email (Super Admin)
  const [roleEmails, setRoleEmails] = useState(() => roleEmailService.list())
  const [roleEmailInput, setRoleEmailInput] = useState('')
  const [roleEmailRole, setRoleEmailRole] = useState<Role>('moderator')
  const [roleEmailNotice, setRoleEmailNotice] = useState<string | null>(null)

  // Boosts programmés (Aviator)
  const [boosts, setBoosts] = useState<GameBoost[]>(() => gameBoostService.list())
  const [boostTime, setBoostTime] = useState('01:37')
  const [boostMultiplier, setBoostMultiplier] = useState('36')
  const [boostMaxWin, setBoostMaxWin] = useState('50000')
  const [boostLabel, setBoostLabel] = useState('Boost Aviator')
  const [boostNotice, setBoostNotice] = useState<string | null>(null)

  const refresh = () => {
    setUsers(authService.listUsers())
    setAudits(auditService.list())
    setPendingPayments(paymentService.listPendingWithdrawals())
    setMyReferrals(user ? referralService.listFor(user.id) : [])
    setAllReferrals(referralService.listAll())
    setRoleEmails(roleEmailService.list())
    setBoosts(gameBoostService.list())
  }

  useEffect(() => {
    const unsubscribe = authService.subscribe(refresh)
    const unsubscribeAudit = auditService.subscribe(refresh)
    const unsubscribePayments = paymentService.subscribe(refresh)
    return () => {
      unsubscribe()
      unsubscribeAudit()
      unsubscribePayments()
    }
  }, [])

  if (!user || !canAccessAdminPanel(user)) {
    return (
      <div>
        <PageHeader title="Administration" description="Accès refusé." />
        <Card>
          <EmptyState
            icon="shield"
            title="Accès refusé"
            description="Cette page est réservée aux modérateurs, administrateurs et super-admins."
          />
        </Card>
      </div>
    )
  }

  const selected = users.find((candidate) => candidate.id === selectedUserId) ?? null
  const selectedPayment =
    pendingPayments.find((candidate) => candidate.id === selectedPaymentId) ?? null
  const roles = assignableRoles(user)
  const canActOnRoles = canManageRoles(user) && roles.length > 0
  const canReviewPayments = canManagePayments(user)

  const handleSuspend = () => {
    if (!selected || !justification.trim()) {
      setError('Une justification est requise.')
      return
    }
    if (selected.id === user.id) {
      setError('Vous ne pouvez pas suspendre votre propre compte.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      authService.setAccountStatus(selected.id, selected.status === 'active' ? 'suspended' : 'active')
      auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: selected.status === 'active' ? 'user_suspended' : 'user_reactivated',
        targetType: 'user',
        targetId: selected.id,
        justification,
      })
      setJustification('')
      refresh()
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleRoleChange = () => {
    if (!selected || !justification.trim()) {
      setError('Une justification est requise.')
      return
    }
    if (selected.id === user.id) {
      setError('Vous ne pouvez pas modifier votre propre rôle.')
      return
    }
    if (!canAssignRole(user, roleTarget)) {
      setError("Vous ne pouvez pas attribuer ce rôle : élévation de privilèges refusée.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      authService.setAccountRole(selected.id, roleTarget)
      auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'role_changed',
        targetType: 'user',
        targetId: selected.id,
        justification,
        metadata: { newRole: roleTarget },
      })
      setJustification('')
      refresh()
    } catch (caught) {
      setError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleReviewPayment = (decision: 'approve' | 'reject') => {
    if (!selectedPayment) {
      setPaymentError('Sélectionnez une demande de retrait.')
      return
    }
    if (paymentJustification.trim().length < 10) {
      setPaymentError('Une justification de 10 caractères minimum est requise.')
      return
    }
    setBusy(true)
    setPaymentError(null)
    setPaymentNotice(null)
    try {
      if (decision === 'approve') {
        paymentService.approveWithdrawal(user, selectedPayment.id, paymentJustification)
        setPaymentNotice(
          `Retrait de ${formatNumber(selectedPayment.amount)} jetons validé. Ledger débité.`,
        )
      } else {
        paymentService.rejectWithdrawal(user, selectedPayment.id, paymentJustification)
        setPaymentNotice(
          `Retrait de ${formatNumber(selectedPayment.amount)} jetons refusé. Réservation libérée.`,
        )
      }
      setPaymentJustification('')
      setSelectedPaymentId(null)
      refresh()
    } catch (caught) {
      setPaymentError(toUserMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleAddRoleEmail = () => {
    setRoleEmailNotice(null)
    try {
      roleEmailService.set(roleEmailInput, roleEmailRole)
      setRoleEmailInput('')
      setRoleEmailNotice(`Rôle attribué : ${roleEmailInput} → ${ROLE_LABELS[roleEmailRole]}.`)
      refresh()
    } catch (caught) {
      setRoleEmailNotice(toUserMessage(caught))
    }
  }

  const handleRemoveRoleEmail = (email: string) => {
    setRoleEmailNotice(null)
    roleEmailService.remove(email)
    refresh()
  }

  const handleAddBoost = () => {
    setBoostNotice(null)
    try {
      gameBoostService.add({
        label: boostLabel,
        game: 'aviator',
        timeOfDay: boostTime,
        forcedMultiplier: Number(boostMultiplier),
        maxWin: Number(boostMaxWin),
      })
      setBoostNotice('Boost programmé et activé.')
      refresh()
    } catch (caught) {
      setBoostNotice(toUserMessage(caught))
    }
  }

  const handleToggleBoost = (id: string) => {
    setBoostNotice(null)
    try {
      const updated = gameBoostService.toggle(id)
      setBoostNotice(updated.enabled ? 'Boost activé.' : 'Boost désactivé.')
      refresh()
    } catch (caught) {
      setBoostNotice(toUserMessage(caught))
    }
  }

  const handleRemoveBoost = (id: string) => {
    setBoostNotice(null)
    gameBoostService.remove(id)
    refresh()
  }

  const handleCopyReferralLink = async () => {
    if (!user) return
    const code = referralService.ensureSponsor(user)
    try {
      await navigator.clipboard.writeText(referralService.linkFor(code))
      setReferralCopied(true)
      setTimeout(() => setReferralCopied(false), 2000)
    } catch {
      setReferralCopied(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={user.role === 'super_admin' ? 'Back-office Super Admin' : 'Back-office'}
        description={`Connecté en tant que ${ROLE_LABELS[user.role]} · les actions sont limitées par permissions et journalisées.`}
        actions={
          <>
            <Badge tone="brand" dot>
              {ROLE_LABELS[user.role]}
            </Badge>
            <Badge tone={canReviewPayments ? 'success' : 'neutral'}>
              {canReviewPayments ? 'Paiements gérables' : 'Paiements en lecture'}
            </Badge>
          </>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-w-0">
          <CardHeader
            title="Utilisateurs"
            description="Cliquez sur un compte pour examiner son rôle et son statut."
          />
          <ul className="divide-y divide-slate-100">
            {users.map((candidate) => (
              <li
                key={candidate.id}
                className={`cursor-pointer px-4 py-3 ${selectedUserId === candidate.id ? 'bg-brand-50/60' : ''}`}
                onClick={() => {
                  setSelectedUserId(candidate.id)
                  const options = assignableRoles(user)
                  setRoleTarget(
                    options.includes(candidate.role) ? candidate.role : (options[0] ?? 'player'),
                  )
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {candidate.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {candidate.email} · {ROLE_LABELS[candidate.role]}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={candidate.status === 'active' ? 'success' : 'danger'}>
                      {candidate.status}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatNumber(walletService.getBalance(candidate.id))} jetons
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            title="Actions"
            description={selected ? selected.displayName : 'Sélectionnez un utilisateur'}
          />
          {selected ? (
            <div className="space-y-3">
              {selected.id === user.id ? (
                <p className="rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Vous ne pouvez pas agir sur votre propre compte (séparation des duties).
                </p>
              ) : null}
              <TextField
                label="Justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                hint="Obligatoire et conservée dans le journal d'audit."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSuspend}
                  disabled={busy || !canSuspendUsers(user) || selected.id === user.id}
                >
                  {selected.status === 'active' ? 'Suspendre' : 'Réactiver'}
                </Button>
                {!canSuspendUsers(user) ? (
                  <Badge tone="neutral">Permission users.suspend requise</Badge>
                ) : null}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  Rôle {roles.length === 0 ? '· aucun rôle attribuable' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(roles.length > 0 ? roles : [selected.role]).map((role) => (
                    <Button
                      key={role}
                      size="sm"
                      variant={roleTarget === role ? 'primary' : 'secondary'}
                      onClick={() => setRoleTarget(role)}
                      disabled={!canActOnRoles}
                    >
                      {ROLE_LABELS[role]}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRoleChange}
                disabled={busy || !canActOnRoles || selected.id === user.id}
              >
                Appliquer le rôle
              </Button>
              {!canManageRoles(user) ? (
                <p className="text-xs text-slate-500">
                  Permission roles.manage requise (Super Admin uniquement).
                </p>
              ) : null}
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </div>
          ) : (
            <EmptyState
              icon="shield"
              title="Aucun utilisateur sélectionné"
              description="Cliquez sur un utilisateur pour agir."
            />
          )}
        </Card>
      </section>

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader
            title="Retraits à valider"
            description={`File d'attente · frais ${Math.round(
              PAYMENT_RULES.withdrawalFeeRate * 100,
            )} % · validation par permission payments.manage.`}
            action={<Badge tone={pendingPayments.length > 0 ? 'warning' : 'neutral'}>{pendingPayments.length} en attente</Badge>}
          />
        </div>

        {!canReviewPayments ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="lock"
              title="Lecture seule"
              description="La validation des retraits est réservée au Super Admin (payments.manage)."
            />
          </div>
        ) : pendingPayments.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="coins"
              title="Aucun retrait en attente"
              description="Les demandes des joueurs apparaîtront ici."
            />
          </div>
        ) : (
          <div className="space-y-4 p-5 sm:p-6">
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {pendingPayments.map((intent) => {
                const account = users.find((candidate) => candidate.id === intent.userId)
                return (
                  <li
                    key={intent.id}
                    className={`cursor-pointer px-4 py-3 ${selectedPaymentId === intent.id ? 'bg-brand-50/60' : ''}`}
                    onClick={() => setSelectedPaymentId(intent.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {account?.displayName ?? intent.userId} · {formatNumber(intent.amount)} jetons
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {intent.method ? WITHDRAWAL_METHOD_LABELS[intent.method] : '—'} ·{' '}
                          {intent.destination} · net {formatNumber(intent.netAmount)}
                        </p>
                        <p className="text-xs text-slate-400">{formatDateTime(intent.createdAt)}</p>
                      </div>
                      <Badge tone="warning">En attente</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>

            {selectedPayment ? (
              <div className="space-y-3">
                <TextField
                  label="Motif de validation / refus"
                  value={paymentJustification}
                  onChange={(event) => setPaymentJustification(event.target.value)}
                  hint="10 caractères minimum · inscrit dans l'audit et notifié au joueur."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleReviewPayment('approve')}
                    disabled={busy}
                  >
                    Valider le retrait
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleReviewPayment('reject')}
                    disabled={busy}
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Sélectionnez une demande pour la valider ou la refuser.
              </p>
            )}
            {paymentError && <p className="text-sm text-rose-600">{paymentError}</p>}
            {paymentNotice && <p className="text-sm text-emerald-600">{paymentNotice}</p>}
          </div>
        )}
      </Card>

      {canManageRoles(user) ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card padded={false}>
            <div className="p-5 pb-0 sm:p-6 sm:pb-0">
              <CardHeader
                title="Rôles par e-mail"
                description="Une adresse listée ici reçoit son rôle dès l'inscription."
                action={<Badge tone="neutral">{roleEmails.length} règle(s)</Badge>}
              />
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
                <input
                  type="email"
                  placeholder="admin@exemple.com"
                  value={roleEmailInput}
                  onChange={(event) => setRoleEmailInput(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <select
                  value={roleEmailRole}
                  onChange={(event) => setRoleEmailRole(event.target.value as Role)}
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-brand-400 focus:outline-none"
                >
                  {ROLE_EMAIL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={handleAddRoleEmail}>
                  Ajouter
                </Button>
              </div>
              {roleEmailNotice && <p className="text-xs text-slate-500">{roleEmailNotice}</p>}
              {roleEmails.length === 0 ? (
                <p className="text-xs text-slate-400">Aucune règle. Tous les inscrits sont joueurs.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {roleEmails.map((entry) => (
                    <li key={entry.email} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{entry.email}</p>
                        <p className="text-xs text-slate-500">→ {ROLE_LABELS[entry.role]}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleRemoveRoleEmail(entry.email)}>
                        Retirer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0 sm:p-6 sm:pb-0">
              <CardHeader
                title="Boosts Aviator programmés"
                description="Pendant la fenêtre, la cote est forcée et le gain plafonné. La vérification provably fair est désactivée sur ces manches."
              />
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField
                  label="Libellé"
                  value={boostLabel}
                  onChange={(event) => setBoostLabel(event.target.value)}
                />
                <TextField
                  label="Heure (HH:MM)"
                  type="time"
                  value={boostTime}
                  onChange={(event) => setBoostTime(event.target.value)}
                />
                <TextField
                  label="Cote forcée"
                  type="number"
                  value={boostMultiplier}
                  onChange={(event) => setBoostMultiplier(event.target.value)}
                  hint="Ex. 36"
                />
                <TextField
                  label="Plafond de gain (jetons)"
                  type="number"
                  value={boostMaxWin}
                  onChange={(event) => setBoostMaxWin(event.target.value)}
                  hint="Ex. 50000"
                />
              </div>
              <Button size="sm" onClick={handleAddBoost}>
                Programmer le boost
              </Button>
              {boostNotice && <p className="text-xs text-slate-500">{boostNotice}</p>}
              {boosts.length === 0 ? (
                <p className="text-xs text-slate-400">Aucun boost programmé.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {boosts.map((boost) => (
                    <li key={boost.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {boost.label} · {boost.timeOfDay}
                        </p>
                        <p className="text-xs text-slate-500">
                          Cote {boost.forcedMultiplier}× · plafond {formatNumber(boost.maxWin)} ·{' '}
                          ± {boost.windowMinutes} min
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          variant={boost.enabled ? 'success' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleBoost(boost.id)}
                        >
                          {boost.enabled ? 'Activé' : 'Désactivé'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRemoveBoost(boost.id)}>
                          Supprimer
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {user.role === 'admin' || user.role === 'super_admin' ? (
        <Card className="mt-6" padded={false}>
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardHeader
              title="Affiliation"
              description="Partagez votre lien : chaque inscription via ce lien est comptée pour votre équipe."
            />
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
                {referralService.linkFor(referralService.ensureSponsor(user))}
              </code>
              <Button size="sm" onClick={handleCopyReferralLink}>
                {referralCopied ? 'Copié ✓' : 'Copier le lien'}
              </Button>
            </div>
            {allReferrals.length === 0 ? (
              <EmptyState
                icon="users"
                title="Aucun filleul pour l'instant"
                description="Les inscriptions via les liens d'affiliation apparaîtront ici."
              />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {(user.role === 'super_admin' ? allReferrals : myReferrals).map((record) => (
                  <li key={record.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{record.displayName}</p>
                        <p className="truncate text-xs text-slate-500">{record.email}</p>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>{formatDateTime(record.createdAt)}</p>
                        {user.role === 'super_admin' && (
                          <p>Parrain : {record.adminEmail}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : null}

      <Card className="mt-6" padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader
            title="Journal d'audit"
            description="Entrées append-only, figées : aucune modification ni suppression."
            action={<Badge tone="neutral">{audits.length} entrée(s)</Badge>}
          />
        </div>
        {audits.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon="shield"
              title="Aucun audit"
              description="Les actions sensibles apparaîtront ici."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audits.slice(0, 40).map((entry) => (
              <li key={entry.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{entry.action}</p>
                    <p className="text-xs text-slate-500">
                      {entry.actorId} · {entry.targetType}:{entry.targetId}
                    </p>
                    <p className="text-xs text-slate-400">{entry.justification}</p>
                  </div>
                  <p className="text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
