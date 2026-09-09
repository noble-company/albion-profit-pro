import { del, get, set } from 'idb-keyval'

import type { RecipeCatalog, CatalogKind } from './service'

/**
 * Cache local do catálogo de receitas (task 4/07).
 *
 * O catálogo só muda em patch do jogo, mas o scanner não calcula **nada** sem ele — está no
 * caminho crítico do primeiro paint. O `ETag` da task 02 já resolve a maior parte (revalidação
 * medida em 5,6 ms), mas `must-revalidate` faz o navegador *esperar* essa condicional depois do
 * `max-age`; sobre internet real isso é um RTT na frente do usuário.
 *
 * **Falhar aqui nunca pode falhar a tela.** IndexedDB não existe em janela privada de alguns
 * navegadores, estoura com armazenamento cheio e pode ser bloqueado por política do usuário.
 * Toda operação é best-effort: no pior caso a tela busca da rede, como se este módulo não
 * existisse.
 */

const KEY_PREFIX = 'albion-profit-pro:catalog:v1:'

export interface CachedCatalog {
  version: string
  payload: RecipeCatalog
}

function keyFor(kind: CatalogKind): string {
  return `${KEY_PREFIX}${kind ?? 'all'}`
}

export async function readCachedCatalog(
  kind: CatalogKind,
): Promise<CachedCatalog | null> {
  try {
    return (await get<CachedCatalog>(keyFor(kind))) ?? null
  } catch {
    return null
  }
}

export async function writeCachedCatalog(
  kind: CatalogKind,
  payload: RecipeCatalog,
): Promise<void> {
  try {
    await set(keyFor(kind), { version: payload.version, payload })
  } catch {
    // Armazenamento cheio ou indisponível: seguir sem cache é degradação aceitável.
  }
}

export async function clearCachedCatalog(kind: CatalogKind): Promise<void> {
  try {
    await del(keyFor(kind))
  } catch {
    // idem
  }
}
