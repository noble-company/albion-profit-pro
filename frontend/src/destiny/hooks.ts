import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryPolicies } from '@/api'
import type { DestinyBoard } from '@/scanner/focus-efficiency'

import { getDestinyBoard, putDestinyBoard } from './service'

const CHAVE = ['destiny-board'] as const

/**
 * Política `catalog`: o painel muda quando o jogador sobe de nível no jogo, não a cada minuto.
 * Enquanto carrega, devolve painel **vazio** — que significa "custo de foco base", nunca um
 * desconto que o jogador não tem.
 */
export function useDestinyBoard(): DestinyBoard {
  const { data } = useQuery({
    queryKey: CHAVE,
    queryFn: ({ signal }) => getDestinyBoard(signal),
    ...queryPolicies.catalog,
  })
  return data ?? new Map<string, number>()
}

export function useSaveDestinyBoard() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: putDestinyBoard,
    // O servidor devolve o painel já normalizado (nó zerado sai). Semear o cache com a
    // resposta evita a tela mostrar por um instante o que ela mandou, e não o que ficou.
    onSuccess: (board) => client.setQueryData(CHAVE, board),
  })
}
