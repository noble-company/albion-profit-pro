type UnauthorizedListener = () => void

/**
 * Fonte de verdade única do token de acesso (task 3.5/16, F07). O `sessionStorage` é a
 * própria persistência — `getAccessToken`/`setAccessToken` leem e escrevem nele direto, sem
 * cache em variável de módulo. Antes havia duas camadas: uma variável aqui e o
 * `sessionStorage` lido por `auth/service.ts`, e elas não se falavam ao restaurar — depois
 * de um F5 a variável ficava `null`, `/auth/me` saía sem `Authorization` e o app deslogava.
 * Sem variável de módulo, também não sobra estado pra vazar entre testes.
 */
export const ACCESS_TOKEN_STORAGE_KEY = 'albion-profit-pro.access-token'

let unauthorizedWaveOpen = false
const listeners = new Set<UnauthorizedListener>()

export function getAccessToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    else sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  } catch {
    // sessionStorage indisponível (navegação privada em navegador antigo etc.): sem
    // persistência, mas o app não quebra — degrada para "sem sessão".
  }
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
