const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function nowIso(): string {
  return new Date().toISOString()
}

export function toIso(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function isValidIsoDate(value: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function formatDate(value: string): string {
  if (!isValidIsoDate(value)) return '—'
  return dateFormatter.format(new Date(value))
}

export function formatTime(value: string): string {
  if (!isValidIsoDate(value)) return '—'
  return timeFormatter.format(new Date(value))
}

export function formatDateTime(value: string): string {
  if (!isValidIsoDate(value)) return '—'
  return dateTimeFormatter.format(new Date(value))
}

export function formatRelative(value: string): string {
  if (!isValidIsoDate(value)) return '—'
  const diffMs = Date.now() - Date.parse(value)
  if (diffMs < 0) return formatDateTime(value)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days} j`
  return formatDate(value)
}
