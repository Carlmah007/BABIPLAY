import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '../app/router'
import { authStore } from '../stores/authStore'
import { toUserMessage } from '../lib/errors'
import { Brand } from '../components/layout/Brand'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Icon } from '../components/ui/Icon'
import { TextField } from '../components/forms/TextField'
import { InlineAlert } from '../components/feedback/InlineAlert'
import type { Role } from '../types/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const session = authStore.useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<'form' | Role | null>(null)

  if (session) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md text-center">
          <span className="mx-auto mb-3 inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-600">
            <Icon name="check" size={24} />
          </span>
          <h1 className="text-xl font-semibold text-slate-900">Vous êtes déjà connecté</h1>
          <p className="mt-1 text-sm text-slate-500">
            Session en cours : {session.user.displayName} ({session.user.role}).
          </p>
          <div className="mt-5 space-y-2">
            <Button fullWidth onClick={() => navigate('/dashboard')}>
              Ouvrir mon espace
            </Button>
            <Button
              fullWidth
              variant="outline"
              onClick={() => {
                authStore.signOut()
                setError(null)
              }}
            >
              Changer de compte
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Renseignez votre adresse e-mail et votre mot de passe.')
      return
    }
    setLoading('form')
    try {
      await authStore.signIn(email, password)
      navigate('/dashboard')
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setLoading(null)
    }
  }

  const enterDemo = (role: Role) => {
    setError(null)
    setLoading(role)
    try {
      authStore.signInDemo(role)
      navigate(role === 'player' ? '/dashboard' : '/admin')
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Retour à l'accueil">
          <Brand />
        </Link>
        <Link to="/register" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          Créer un compte
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card>
            <div className="mb-5 text-center">
              <Badge tone="brand" dot>
                {isSupabaseConfigured() ? 'Connexion Supabase' : 'Connexion locale'}
              </Badge>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                Se connecter
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Accédez à votre portefeuille virtuel et à vos jeux.
              </p>
            </div>

            {error ? (
              <div className="mb-4">
                <InlineAlert tone="error">{error}</InlineAlert>
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Adresse e-mail"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <TextField
                label="Mot de passe"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="8 caractères minimum"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button
                type="submit"
                fullWidth
                loading={loading === 'form'}
                disabled={loading !== null}
                leftIcon={<Icon name="lock" size={16} />}
              >
                Se connecter
              </Button>
            </form>

            {isSupabaseConfigured() ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-500">
                Mode Supabase actif : connectez-vous avec un compte créé dans Supabase. Les accès
                démo locaux sont désactivés.
              </p>
            ) : null}

            {isSupabaseConfigured() ? null : (
              <>
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Accès rapide
                  </span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="subtle"
                    fullWidth
                    loading={loading === 'player'}
                    disabled={loading !== null}
                    onClick={() => enterDemo('player')}
                    leftIcon={<Icon name="play" size={16} />}
                  >
                    Joueur · 50 000 jetons
                  </Button>
                  <Button
                    variant="outline"
                    fullWidth
                    loading={loading === 'moderator'}
                    disabled={loading !== null}
                    onClick={() => enterDemo('moderator')}
                    leftIcon={<Icon name="users" size={16} />}
                  >
                    Modérateur
                  </Button>
                  <Button
                    variant="outline"
                    fullWidth
                    loading={loading === 'admin'}
                    disabled={loading !== null}
                    onClick={() => enterDemo('admin')}
                    leftIcon={<Icon name="settings" size={16} />}
                  >
                    Admin
                  </Button>
                  <Button
                    variant="outline"
                    fullWidth
                    loading={loading === 'super_admin'}
                    disabled={loading !== null}
                    onClick={() => enterDemo('super_admin')}
                    leftIcon={<Icon name="shield" size={16} />}
                  >
                    Super Admin
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-slate-400 sm:col-span-2">
                    Accès démo sans mot de passe. Le joueur peut miser, gagner et demander un
                    retrait ; les autres rôles ouvrent le back-office avec leurs permissions.
                  </p>
                </div>
              </>
            )}
          </Card>

          <p className="mt-4 text-center text-xs text-slate-400">
            <Link to="/" className="hover:text-slate-600">
              ← Retour à l'accueil
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
