const tokenFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
})

const decimalFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return tokenFormatter.format(value)
}

export function formatTokens(value: number): string {
  return `${formatNumber(value)} jetons`
}

export function formatSignedTokens(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${tokenFormatter.format(value)}`
}

export function formatMoney(value: number, currency = 'EUR'): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatMultiplier(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${decimalFormatter.format(value)}×`
}

export function formatPercent(value: number, withSign = true): string {
  if (!Number.isFinite(value)) return '—'
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)} %`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
