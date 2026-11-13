import { useId, useState, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../ui/Icon'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  /**
   * Affiche un bouton « œil » pour révéler/masquer la valeur.
   * Prévu pour les champs de mot de passe ; ignoré pour les autres types.
   */
  showPasswordToggle?: boolean
}

export function TextField({
  label,
  error,
  hint,
  id,
  className,
  type,
  showPasswordToggle,
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  const isPassword = type === 'password'
  const [revealed, setRevealed] = useState(false)
  const effectiveType = isPassword && revealed ? 'text' : type

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={effectiveType}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400',
            'transition-colors focus:outline-none focus:ring-2',
            error
              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
              : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
            isPassword && showPasswordToggle ? 'pr-11' : undefined,
            className,
          )}
          {...rest}
        />
        {isPassword && showPasswordToggle ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            title={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <Icon name={revealed ? 'eye-off' : 'eye'} size={18} />
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
