const fallbackRandom = () => Math.floor(Math.random() * 0xffffffff)

/** Génère un identifiant unique préfixé, compatible navigateur et tests. */
export function createId(prefix = 'id'): string {
  const cryptoObject = globalThis.crypto
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `${prefix}_${cryptoObject.randomUUID()}`
  }
  const random = fallbackRandom().toString(36)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}

/** Clé d'idempotence déterministe pour une opération métier. */
export function createIdempotencyKey(scope: string, reference: string): string {
  return `${scope}:${reference}`
}
