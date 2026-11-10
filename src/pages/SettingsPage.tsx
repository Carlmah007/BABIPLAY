import { useEffect, useState } from 'react'
import { Link, useNavigate } from '../app/router'
import { authStore } from '../stores/authStore'
import { canAccessAdmin } from '../lib/permissions'
import { APP_CONFIG } from '../config/appConfig'
import { storage } from '../lib/storage'
import { PageHeader } from '../components/ui/PageHeader'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'

interface Preferences {
  sound: boolean
  notifications: boolean
  reducedMotion: boolean
}

const PREFERENCES_KEY = 'user:preferences'
const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  notifications: true,
  reducedMotion: false,
}

const ROLE_LABELS = {
  player: 'Joueur',
  moderator: 'Modérateur',
  admin: 'Administrateur',
  super_admin: 'Super Administrateur',
} as const

function loadPreferences(): Preferences {
  const stored = storage.get<Partial<Preferences>>(PREFERENCES_KEY)
  return { ...DEFAULT_PREFERENCES, ...(stored ?? {}) }
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300"
      aria-pressed={value}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

export function SettingsPage() {
  const session = authStore.useSession()
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion)
  }, [preferences.reducedMotion])

  const user = session?.user
  if (!user) return null

  const initials = user.displayName
    .split(' ')
    .map((part) => part.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const update = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    storage.set(PREFERENCES_KEY, next)
  }

  const resetDemo = () => {
    const prefix = `${APP_CONFIG.storagePrefix}:`
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key)
    }
    authStore.signOut()
    navigate('/login')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Compte"
        title="Paramètres"
        description="Personnalise ton expérience."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mon compte" />
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{user.displayName}</p>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
            </div>
            <Badge tone="brand" className="ml-auto shrink-0">
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/profile"
              className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Icon name="user" size={15} />
              Mon profil
            </Link>
            {canAccessAdmin(user) ? (
              <Link
                to="/admin"
                className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                <Icon name="shield" size={15} />
                Back-office
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Préférences" description="Enregistrées localement sur cet appareil." />
          <div className="space-y-2">
            <Toggle
              label="Sons du jeu"
              description="Effets sonores lors des résultats"
              value={preferences.sound}
              onChange={(sound) => update({ sound })}
            />
            <Toggle
              label="Notifications"
              description="Alertes de résultats et de solde"
              value={preferences.notifications}
              onChange={(notifications) => update({ notifications })}
            />
            <Toggle
              label="Réduire les animations"
              description="Pour un confort visuel maximal"
              value={preferences.reducedMotion}
              onChange={(reducedMotion) => update({ reducedMotion })}
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Données locales"
            description="Solde, parties et historique sont stockés sur cet appareil."
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-slate-500">
              La réinitialisation efface le portefeuille virtuel, les parties et les préférences
              locales, puis te déconnecte. Aucune donnée réelle n'est concernée.
            </p>
            {confirmReset ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>
                  Annuler
                </Button>
                <Button variant="danger" size="sm" onClick={resetDemo}>
                  Confirmer
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
                Réinitialiser mes données
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
