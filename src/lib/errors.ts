export type AppErrorCode =
  | 'VALIDATION'
  | 'INSUFFICIENT_FUNDS'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERMISSION'
  | 'PAYMENT_DISABLED'
  | 'STORAGE'
  | 'UNKNOWN'

export class AppError extends Error {
  readonly code: AppErrorCode

  constructor(code: AppErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION', message)
    this.name = 'ValidationError'
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super('INSUFFICIENT_FUNDS', 'Solde insuffisant pour effectuer cette opération.')
    this.name = 'InsufficientFundsError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable.') {
    super('NOT_FOUND', message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Cette opération a déjà été effectuée.') {
    super('CONFLICT', message)
    this.name = 'ConflictError'
  }
}

export class PermissionError extends AppError {
  constructor(message = "Vous n'avez pas les droits nécessaires.") {
    super('PERMISSION', message)
    this.name = 'PermissionError'
  }
}

export class PaymentDisabledError extends AppError {
  constructor() {
    super('PAYMENT_DISABLED', 'Les paiements réels sont désactivés sur cet environnement.')
    this.name = 'PaymentDisabledError'
  }
}

/** Message sûr à afficher à l'utilisateur, sans détails techniques. */
export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) return error.message
  return 'Une erreur inattendue est survenue. Veuillez réessayer.'
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
