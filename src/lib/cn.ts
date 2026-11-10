export type ClassValue = string | false | null | undefined

/** Concatène des classes conditionnelles sans dépendance externe. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
