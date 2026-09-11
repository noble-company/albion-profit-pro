import { useQuery } from '@tanstack/react-query'

import { apiClient, queryPolicies, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

export type PriceSnapshot = components['schemas']['PriceSnapshotOut']
type Realm = components['schemas']['AlbionServer']

/**
 * As colunas que carregam preço. `generated_at` fica de fora de propósito — ver `mesmosPrecos`.
 */
const COLUNAS_DE_PRECO = [
  'item',
  'location',
  'quality',
  'enchantment',
  'sell_min',
  'sell_observed_at',
  'sell_source',
  'buy_max',
  'buy_observed_at',
  'buy_source',
] as const

function mesmaLista(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

/**
 * Duas respostas trazem os **mesmos preços**?
 *
 * O servidor carimba `generated_at = datetime.now()` em toda resposta (`prices/router.py`).
 * A igualdade estrutural padrão da biblioteca olha a resposta inteira, então esse carimbo
 * sozinho bastava para o snapshot ganhar identidade nova a cada polling — com o mercado
 * inteiramente parado.
 *
 * No craft, identidade nova custa o catálogo inteiro: medido, **2.703 ms** no Worker mais
 * **496 ms de thread principal** reconstruindo os `Decimal` de 44.184 linhas. A tela travava
 * sozinha, em intervalo regular, sem ninguém tocar em nada.
 *
 * Aqui a comparação é sobre o que muda o número. Preço que se move continua trocando a
 * identidade — aí recalcular é o certo.
 */
export function mesmosPrecos(
  anterior: PriceSnapshot | undefined,
  nova: PriceSnapshot,
): boolean {
  if (!anterior) return false
  if (anterior.server !== nova.server) return false
  if (anterior.row_count !== nova.row_count) return false
  if (!mesmaLista(anterior.items, nova.items)) return false
  if (!mesmaLista(anterior.locations, nova.locations)) return false
  if (!mesmaLista(anterior.sources, nova.sources)) return false
  return COLUNAS_DE_PRECO.every((coluna) =>
    mesmaLista(anterior.columns[coluna], nova.columns[coluna]),
  )
}

/**
 * O recorte de uma categoria (task 4/22). A lista de itens **não** viaja na URL — uma categoria
 * de ~100 receitas com ingredientes passa dos 4.096 caracteres —: o servidor resolve os itens das
 * receitas dela, pela mesma regra de `lugarDaReceita`.
 */
export interface RecorteDoSnapshot {
  kind: 'refining' | 'crafting'
  category: string
  subcategory: string | null
}

/**
 * Snapshot de preço do realm (task 4/03), ou só de uma categoria (task 4/22).
 *
 * Política `market` (`staleTime` 30 s) — e **nada de IndexedDB**, ao contrário do catálogo: o
 * preço muda o tempo todo, e cachear em disco só serviria para mostrar dado velho mais rápido.
 *
 * Medido na task 22: o realm West são 20.364 linhas, 187 KB com gzip a cada 30 s; uma
 * subcategoria, de 4 a 15 KB. `habilitado = false` não pede nada — é a tela aberta sem escolha.
 */
export function usePriceSnapshot(
  realm: Realm | null,
  locations: string[],
  recorte: RecorteDoSnapshot | null = null,
  habilitado = true,
) {
  const query = useQuery({
    // As cidades entram na chave: pedir menos cidades é um payload diferente, não um recorte
    // do mesmo. A categoria também (task 22) — trocar de categoria é uma ação explícita, não uma
    // tecla, e os preços da anterior não têm os itens da nova.
    queryKey: [
      'prices',
      'snapshot',
      realm,
      [...locations].sort(),
      recorte ? [recorte.kind, recorte.category, recorte.subcategory] : null,
    ] as const,
    queryFn: async ({ signal }) => {
      const response = await safeApiCall(() =>
        apiClient.GET('/prices/snapshot', {
          params: {
            query: {
              server: realm as Realm,
              location_id: locations.length ? locations : undefined,
              kind: recorte?.kind,
              category: recorte?.category,
              subcategory: recorte?.subcategory ?? undefined,
            },
          },
          signal,
        }),
      )
      return response.data as PriceSnapshot
    },
    enabled: realm !== null && habilitado,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    ...queryPolicies.market,
    // O polling de 30 s (task 11.2.2) fica: ele existe para a captura do jogo aparecer na
    // tela, e uma requisição por meio minuto é barata. O que não pode ficar é o recálculo
    // que ele disparava sem nenhum preço ter mudado.
    structuralSharing: (anterior, nova) =>
      mesmosPrecos(anterior as PriceSnapshot | undefined, nova as PriceSnapshot)
        ? (anterior as PriceSnapshot)
        : (nova as PriceSnapshot),
  })

  return {
    snapshot: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    updatedAt: query.dataUpdatedAt,
  }
}
