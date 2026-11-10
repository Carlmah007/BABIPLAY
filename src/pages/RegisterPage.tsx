import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '../app/router'
import { authStore } from '../stores/authStore'
import { toUserMessage, ValidationError } from '../lib/errors'
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '../lib/validation'
import { Brand } from '../components/layout/Brand'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { TextField } from '../components/forms/TextField'
import { InlineAlert } from '../components/feedback/InlineAlert'

export function RegisterPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      const name = validateDisplayName(displayName)
      const validEmail = validateEmail(email)
      validatePassword(password)
      if (password !== confirmation) {
        throw new ValidationError('Les deux mots de passe ne correspondent pas.')
      }
      setLoading(true)
      await authStore.register({ displayName: name, email: validEmail, password })
      navigate('/dashboard')
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Retour à l'accueil">
          <Brand />
        </Link>
        <Link to="/login" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          Se connecter
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <div className="mb-5 text-center">
            <Badge tone="brand" dot>
              Compte sécurisé
            </Badge>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              Créer un compte
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Vos données sont protégées et synchronisées.
            </p>
          </div>

          {error ? (
            <div className="mb-4">
              <InlineAlert tone="error">{error}</InlineAlert>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Nom affiché"
              type="text"
              name="displayName"
              autoComplete="nickname"
              placeholder="Votre pseudo"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              hint="Entre 2 et 40 caractères."
            />
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
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint="Au moins une lettre et un chiffre."
            />
            <TextField
              label="Confirmer le mot de passe"
              type="password"
              name="passwordConfirmation"
              autoComplete="new-password"
              placeholder="Répétez le mot de passe"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading}
              leftIcon={<Icon name="user" size={16} />}
            >
              Créer mon compte
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-xs leading-relaxed text-slate-500">
            Les jetons sont virtuels et servent uniquement au jeu. Aucun paiement réel n'est
            demandé ni effectué.
          </div>
        </Card>
      </div>
    </div>
  )
}
