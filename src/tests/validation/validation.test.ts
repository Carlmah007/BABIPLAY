import { describe, expect, it } from 'vitest'
import {
  assertOneOf,
  assertSufficientFunds,
  normalizeEmail,
  parseAmount,
  parseOptionalAmount,
  roundTokens,
  validateAssetSymbol,
  validateAviatorStatus,
  validateCrashMultiplier,
  validateEmail,
  validateIdempotencyKey,
  validateId,
  validateJustification,
  validateLeverage,
  validateMovementDirection,
  validatePassword,
  validatePaymentStatus,
  validateReference,
  validateStake,
  validateTradeDirection,
  validateWithdrawalDestination,
} from '../../lib/validation'
import { AppError, InsufficientFundsError, ValidationError } from '../../lib/errors'

describe('parseAmount', () => {
  it('accepte un entier positif', () => {
    expect(parseAmount(500)).toBe(500)
    expect(parseAmount('1 250')).toBe(1250)
    expect(parseAmount('12,5', { integer: false })).toBe(12.5)
    expect(parseAmount('12.5', { integer: false })).toBe(12.5)
  })

  it('rejette les montants non numériques', () => {
    expect(() => parseAmount('abc')).toThrow(ValidationError)
    expect(() => parseAmount('')).toThrow(ValidationError)
    expect(() => parseAmount(Number.NaN)).toThrow(ValidationError)
    expect(() => parseAmount(Number.POSITIVE_INFINITY)).toThrow(ValidationError)
  })

  it('rejette les décimales par défaut', () => {
    expect(() => parseAmount(10.5)).toThrow(ValidationError)
    expect(parseAmount(10.5, { integer: false })).toBe(10.5)
  })

  it('rejette zéro et les négatifs sauf autorisation explicite', () => {
    expect(() => parseAmount(0)).toThrow(ValidationError)
    expect(() => parseAmount(-5)).toThrow(ValidationError)
    expect(parseAmount(0, { allowZero: true })).toBe(0)
  })

  it('applique le maximum', () => {
    expect(() => parseAmount(101, { max: 100 })).toThrow(ValidationError)
    expect(parseAmount(100, { max: 100 })).toBe(100)
  })

  it('renvoie null pour une saisie optionnelle vide', () => {
    expect(parseOptionalAmount('')).toBeNull()
    expect(parseOptionalAmount(undefined)).toBeNull()
    expect(parseOptionalAmount('42')).toBe(42)
  })
})

describe('validateStake', () => {
  it('accepte une mise couverte par le solde', () => {
    expect(validateStake('500', 50_000)).toBe(500)
  })

  it('rejette une mise supérieure au solde', () => {
    expect(() => validateStake(50_001, 50_000)).toThrow(InsufficientFundsError)
  })

  it('rejette une mise nulle ou négative', () => {
    expect(() => validateStake(0, 50_000)).toThrow(ValidationError)
    expect(() => validateStake(-1, 50_000)).toThrow(ValidationError)
  })
})

describe('assertSufficientFunds', () => {
  it('accepte un montant couvert', () => {
    expect(() => assertSufficientFunds(100, 100)).not.toThrow()
  })

  it('refuse un montant non entier', () => {
    expect(() => assertSufficientFunds(1.5, 100)).toThrow(ValidationError)
  })

  it('refuse un dépassement', () => {
    expect(() => assertSufficientFunds(101, 100)).toThrow(InsufficientFundsError)
  })
})

describe('identifiants et références', () => {
  it('valide les identifiants', () => {
    expect(validateId('round_123')).toBe('round_123')
    expect(() => validateId('a b')).toThrow(ValidationError)
    expect(() => validateId('')).toThrow(ValidationError)
  })

  it('valide les clés d’idempotence', () => {
    expect(validateIdempotencyKey('aviator:stake:round-123')).toBe('aviator:stake:round-123')
    expect(() => validateIdempotencyKey('short')).toThrow(ValidationError)
    expect(() => validateIdempotencyKey('bad key with spaces')).toThrow(ValidationError)
  })

  it('valide les références de paiement', () => {
    expect(validateReference('pay_ref-123456')).toBe('pay_ref-123456')
    expect(() => validateReference('x')).toThrow(ValidationError)
  })
})

describe('statuts et énumérations', () => {
  it('accepte uniquement les statuts connus', () => {
    expect(validateAviatorStatus('running')).toBe('running')
    expect(validatePaymentStatus('confirmed')).toBe('confirmed')
    expect(validateMovementDirection('debit')).toBe('debit')
    expect(() => validateAviatorStatus('flying')).toThrow(ValidationError)
    expect(() => validatePaymentStatus('paid')).toThrow(ValidationError)
    expect(() => validateMovementDirection('up')).toThrow(ValidationError)
  })

  it('générique assertOneOf rejette les valeurs hors liste', () => {
    expect(assertOneOf('long', ['long', 'short'], 'Direction')).toBe('long')
    expect(() => assertOneOf('sideways', ['long', 'short'], 'Direction')).toThrow(ValidationError)
  })
})

describe('formulaires', () => {
  it('normalise et valide les e-mails', () => {
    expect(normalizeEmail('  Demo@BabiPlay.LOCAL ')).toBe('demo@babiplay.local')
    expect(validateEmail('user@example.com')).toBe('user@example.com')
    expect(() => validateEmail('not-an-email')).toThrow(ValidationError)
    expect(() => validateEmail('a@b')).toThrow(ValidationError)
  })

  it('valide les mots de passe', () => {
    expect(validatePassword('Secret123')).toBe('Secret123')
    expect(() => validatePassword('short1')).toThrow(ValidationError)
    expect(() => validatePassword('onlyletters')).toThrow(ValidationError)
    expect(() => validatePassword('12345678')).toThrow(ValidationError)
  })

  it('valide les justifications administratives', () => {
    expect(validateJustification('Correction manuelle validée par audit')).toContain('Correction')
    expect(() => validateJustification('court')).toThrow(ValidationError)
  })

  it('valide la destination de retrait', () => {
    expect(validateWithdrawalDestination('Compte test 1234')).toBe('Compte test 1234')
    expect(() => validateWithdrawalDestination('')).toThrow(ValidationError)
  })
})

describe('paramètres de jeu et de trading', () => {
  it('valide les actifs et directions', () => {
    expect(validateAssetSymbol('BTC')).toBe('BTC')
    expect(validateTradeDirection('short')).toBe('short')
    expect(() => validateAssetSymbol('DOGE')).toThrow(ValidationError)
    expect(() => validateTradeDirection('up')).toThrow(ValidationError)
  })

  it('valide les multiplicateurs et le levier', () => {
    expect(validateCrashMultiplier(2.5)).toBe(2.5)
    expect(() => validateCrashMultiplier(1)).toThrow(ValidationError)
    expect(() => validateCrashMultiplier(2000)).toThrow(ValidationError)
    expect(validateLeverage(5)).toBe(5)
    expect(() => validateLeverage(0)).toThrow(ValidationError)
    expect(() => validateLeverage(25)).toThrow(ValidationError)
  })

  it('arrondit les jetons sans négatif', () => {
    expect(roundTokens(10.4)).toBe(10)
    expect(roundTokens(10.6)).toBe(11)
    expect(roundTokens(-5)).toBe(0)
  })

  it('n’expose pas de code technique dans les erreurs', () => {
    try {
      parseAmount('abc')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('VALIDATION')
      expect((error as Error).message).not.toContain('stack')
    }
  })
})
