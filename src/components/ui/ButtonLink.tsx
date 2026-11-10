import type { ReactNode } from 'react'
import { Link } from '../../app/router'
import {
  getButtonClassName,
  type ButtonSize,
  type ButtonVariant,
} from './Button'

interface ButtonLinkProps {
  to: string
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  onClick?: () => void
}

/** Lien de navigation présentant l'apparence d'un bouton, sans bouton imbriqué. */
export function ButtonLink({
  to,
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  leftIcon,
  rightIcon,
  onClick,
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={getButtonClassName({ variant, size, fullWidth, className })}
    >
      {leftIcon}
      <span>{children}</span>
      {rightIcon}
    </Link>
  )
}
