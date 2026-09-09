import { apiClient, safeApiCall } from '@/api'
import type { components } from '@/api/schema'

import type { DestinyBoard } from '@/scanner/focus-efficiency'

type DestinyBoardOut = components['schemas']['DestinyBoardOut']

/**
 * O painel do jogador vive no servidor (task 4/17), não no navegador: é progressão de
 * personagem, não preferência de máquina.
 */
export async function getDestinyBoard(signal?: AbortSignal): Promise<DestinyBoard> {
  const response = await safeApiCall(() =>
    apiClient.GET('/me/destiny-board', { signal }),
  )
  return paraMapa(response.data as DestinyBoardOut)
}

/** Substitui o painel inteiro — a tela edita a grade e salva o conjunto. */
export async function putDestinyBoard(board: DestinyBoard): Promise<DestinyBoard> {
  const response = await safeApiCall(() =>
    apiClient.PUT('/me/destiny-board', {
      body: { nodes: Object.fromEntries(board) },
    }),
  )
  return paraMapa(response.data as DestinyBoardOut)
}

/** `{chave: nível}` vira `Map`, que é o formato que o engine consulta em O(1). */
function paraMapa(data: DestinyBoardOut): DestinyBoard {
  const nodes: Record<string, number> = data.nodes ?? {}
  return new Map<string, number>(Object.entries(nodes))
}
