import { act, renderHook, waitFor } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { server } from '@/test/msw/server'
import { createTestQueryClient, wrapperWithQueryClient } from '@/test/queryTestClient'

import { useSalesVolume } from './useSalesVolume'
import type { SalesOut } from './vendas'

/**
 * Task 4/29 (achado `W11`). O jogador abre o histórico de um item no jogo e volta para o
 * navegador. Com 1 h de `staleTime` e o foco ignorado, o volume novo só aparecia depois de um F5.
 * Voltar para a aba é o gatilho: dado com mais de um minuto é buscado de novo.
 */

function vendas(unidades: string): SalesOut {
  return {
    server: 'west',
    days: 7,
    row_count: 1,
    items: ['T4_CLOTH'],
    locations: ['1002'],
    columns: {
      item: [0],
      location: [0],
      quality: [1],
      units_per_day: [unidades],
      average_price: ['300'],
      days_with_data: [7],
    },
  } as unknown as SalesOut
}

async function montar() {
  const atual = { corpo: vendas('10'), pedidos: 0 }
  server.use(
    http.get('http://localhost:8000/prices/sales', () => {
      atual.pedidos += 1
      return HttpResponse.json(atual.corpo)
    }),
  )
  const { result } = renderHook(
    () => useSalesVolume('west', { kind: 'refining', category: 'cloth', subcategory: null }),
    { wrapper: wrapperWithQueryClient(createTestQueryClient()) },
  )
  await waitFor(() => expect(result.current.vendas).not.toBeNull())
  return { result, atual }
}

/** Sai e volta para a aba, como quem alterna com o jogo. */
function alternarComOJogo() {
  act(() => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  focusManager.setFocused(undefined)
})

describe('useSalesVolume (task 29)', () => {
  test('dado velho: voltar para a aba busca de novo e o volume novo aparece', async () => {
    const { result, atual } = await montar()
    const pedidosAntes = atual.pedidos

    atual.corpo = vendas('74')
    const agora = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(agora + 61_000)
    alternarComOJogo()

    await waitFor(() => expect(result.current.vendas?.columns.units_per_day[0]).toBe('74'))
    expect(atual.pedidos).toBeGreaterThan(pedidosAntes)
  })

  test('dado recente: voltar para a aba não pede de novo', async () => {
    const { result, atual } = await montar()
    const pedidosAntes = atual.pedidos

    alternarComOJogo()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(atual.pedidos).toBe(pedidosAntes)
    expect(result.current.vendas?.columns.units_per_day[0]).toBe('10')
  })
})

test('sales envia as saídas salvas normalizadas', async () => {
  const pedidos: URLSearchParams[] = []
  server.use(
    http.get('http://localhost:8000/prices/sales', ({ request }) => {
      pedidos.push(new URL(request.url).searchParams)
      return HttpResponse.json(vendas('10'))
    }),
  )
  const { result } = renderHook(
    () => useSalesVolume('west', { outputItems: ['T5_BAG', 'T4_BAG', 'T5_BAG'] }),
    { wrapper: wrapperWithQueryClient(createTestQueryClient()) },
  )
  await waitFor(() => expect(result.current.vendas).not.toBeNull())
  expect(pedidos.at(-1)?.getAll('output_item')).toEqual(['T4_BAG', 'T5_BAG'])
})
