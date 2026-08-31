type UnauthorizedListener = () => void

let accessToken: string | null = null
let unauthorizedWaveOpen = false
const listeners = new Set<UnauthorizedListener>()

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  resetUnauthorizedWave()
}

export function subscribeUnauthorized(
  listener: UnauthorizedListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetUnauthorizedWave(): void {
  unauthorizedWaveOpen = false
}

export function notifyUnauthorized(): void {
  if (unauthorizedWaveOpen) return
  unauthorizedWaveOpen = true
  for (const listener of listeners) listener()
}
