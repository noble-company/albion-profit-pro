import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'

import { server } from '@/test/msw/server'
import { createTestQueryClient, wrapperWithQueryClient } from '@/test/queryTestClient'

import { mesmosPrecos, usePriceSnapshot, type PriceSnapshot } from './usePriceSnapshot'

/**
 * Task 4/12, segunda correção de desempenho.
 *
 * O polling de 30 s (task 11.2.2) fica — ele existe para a captura do jogo aparecer na tela, e
 * uma requisição por meio minuto é barata. O que não pode ficar é o efeito colateral dele.
 *
 * `GET /prices/snapshot` carimba `generated_at = datetime.now()` em **toda** resposta. Isso
 * bastava para o objeto do snapshot ganhar identidade nova a cada meio minuto, mesmo com o
 * mercado inteiramente parado. No craft cada identidade nova custa o catálogo inteiro: medido,
 * **2.703 ms** no Worker e mais **496 ms de thread principal** reconstruindo os `Decimal` de
 * 44.184 linhas. A tela travava sozinha, em intervalo regular, sem ninguém tocar em nada.
 *
 * A identidade passa a seguir o que muda o número — os preços —, não o carimbo.
 */

const T = 1_757_000_000

function snapshot(
  overrides: {
    generated_at?: string
    sell_min?: (string | null)[]
    row_count?: number
  } = {},
): PriceSnapshot {
  return {
    server: 'west',
    generated_at: overrides.generated_at ?? '2026-09-09T16:20:00Z',
    row_count: overrides.row_count ?? 2,
    items: ['T4_FIBER', 'T4_CLOTH'],
    locations: ['1002'],
    sources: ['client'],
    columns: {
      item: [0, 1],
      location: [0, 0],
      quality: [1, 1],
      enchantment: [0, 0],
      sell_min: overrides.sell_min ?? ['100', '1100'],
      sell_observed_at: [T, T],
      sell_source: [0, 0],
      buy_max: ['90', '1000'],
      buy_observed_at: [T, T],
      buy_source: [0, 0],
    },
  } as unknown as PriceSnapshot
}

describe('mesmosPrecos', () => {
  test('carimbo novo com o mercado parado NÃO é mudança de preço', () => {
    expect(
      mesmosPrecos(snapshot(), snapshot({ generated_at: '2026-09-09T16:20:30Z' })),
    ).toBe(true)
  })

  test('um preço que se moveu é mudança', () => {
    expect(mesmosPrecos(snapshot(), snapshot({ sell_min: ['100', '1250'] }))).toBe(false)
  })

  test('preço que sumiu não é o mesmo que preço igual', () => {
    // `null` é "não sabemos" (`X02`). Confundir com o preço anterior seria afirmar um mercado
    // que ninguém observou.
    expect(mesmosPrecos(snapshot(), snapshot({ sell_min: ['100', null] }))).toBe(false)
  })

  test('linha a mais é mudança', () => {
    expect(mesmosPrecos(snapshot(), snapshot({ row_count: 3 }))).toBe(false)
  })
})

describe('usePriceSnapshot', () => {
  /**
   * O intervalo em si já é testado em `tanstack-query-behavior` (polling com a aba visível,
   * pausa com a aba oculta). O que se testa aqui é o passo seguinte: **o que a segunda resposta
   * faz com a identidade do objeto** — que é o que decide se o craft recalcula ou não.
   *
   * A resposta corrente é explícita, e não a n-ésima de uma lista: o mount pede mais de uma vez,
   * e indexar por contagem entregava a resposta seguinte antes do teste pedir por ela.
   */
  async function montar(inicial: PriceSnapshot) {
    const atual = { corpo: inicial, pedidos: 0 }
    server.use(
      http.get('http://localhost:8000/prices/snapshot', () => {
        atual.pedidos += 1
        return HttpResponse.json(atual.corpo)
      }),
    )
    const client = createTestQueryClient()
    const { result } = renderHook(() => usePriceSnapshot('west', ['1002']), {
      wrapper: wrapperWithQueryClient(client),
    })
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())

    /** Troca o que o servidor responde e força o ciclo que o `refetchInterval` faria. */
    const responderCom = async (corpo: PriceSnapshot) => {
      atual.corpo = corpo
      const pedidosAntes = atual.pedidos
      const carimboAntes = result.current.updatedAt
      // O relógio precisa andar: `dataUpdatedAt` é em milissegundos, e é ele que prova que a
      // resposta assentou mesmo quando o objeto de dados é — de propósito — o mesmo.
      await new Promise((resolve) => setTimeout(resolve, 5))
      await act(async () => {
        await client.refetchQueries({ queryKey: ['prices', 'snapshot'] })
      })
      await waitFor(() => expect(result.current.updatedAt).toBeGreaterThan(carimboAntes))
      // Sem isto o teste passaria por não ter buscado nada — foi o que aconteceu nas primeiras
      // versões dele, com a resposta presa no timer falso e depois sem flush.
      expect(atual.pedidos).toBeGreaterThan(pedidosAntes)
    }

    return { result, responderCom }
  }

  test('mercado parado: o polling NÃO troca a identidade do snapshot', async () => {
    const { result, responderCom } = await montar(
      snapshot({ generated_at: '2026-09-09T16:20:00Z' }),
    )

    const antes = result.current.snapshot
    await responderCom(snapshot({ generated_at: '2026-09-09T16:20:30Z' }))

    // A resposta é outra — o carimbo mudou. O objeto que alimenta o engine não pode mudar.
    expect(result.current.snapshot).toBe(antes)
  })

  test('preço que se move TROCA a identidade — aí recalcular é o certo', async () => {
    const { result, responderCom } = await montar(snapshot())

    const antes = result.current.snapshot
    await responderCom(
      snapshot({ generated_at: '2026-09-09T16:20:30Z', sell_min: ['100', '1250'] }),
    )

    expect(result.current.snapshot).not.toBe(antes)
    expect(result.current.snapshot?.columns.sell_min[1]).toBe('1250')
  })
})

describe('snapshot só da categoria (task 22)', () => {
  /** Guarda a query string de cada pedido, para o teste olhar o que foi pedido de fato. */
  function registrarPedidos() {
    const pedidos: URLSearchParams[] = []
    server.use(
      http.get('http://localhost:8000/prices/snapshot', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams)
        return HttpResponse.json(snapshot())
      }),
    )
    return pedidos
  }

  test('com categoria, o pedido leva o recorte — e o servidor resolve os itens', async () => {
    const pedidos = registrarPedidos()
    const { result } = renderHook(
      () =>
        usePriceSnapshot('west', ['1002'], {
          kind: 'crafting',
          category: 'weapons',
          subcategory: 'sword',
        }),
      { wrapper: wrapperWithQueryClient(createTestQueryClient()) },
    )
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())

    const ultimo = pedidos.at(-1)!
    expect(ultimo.get('kind')).toBe('crafting')
    expect(ultimo.get('category')).toBe('weapons')
    expect(ultimo.get('subcategory')).toBe('sword')
  })

  test('sem recorte, o pedido é o de hoje: o realm inteiro', async () => {
    const pedidos = registrarPedidos()
    const { result } = renderHook(() => usePriceSnapshot('west', ['1002'], null), {
      wrapper: wrapperWithQueryClient(createTestQueryClient()),
    })
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())

    const ultimo = pedidos.at(-1)!
    expect(ultimo.has('kind')).toBe(false)
    expect(ultimo.has('category')).toBe(false)
  })

  test('trocar de categoria pede de novo, com a categoria nova', async () => {
    // A categoria entra na chave: sem isso a tela da família nova ficaria com os preços da
    // anterior, que não têm os itens dela.
    const pedidos = registrarPedidos()
    const { result, rerender } = renderHook(
      ({ categoria }: { categoria: string }) =>
        usePriceSnapshot('west', ['1002'], {
          kind: 'refining',
          category: categoria,
          subcategory: null,
        }),
      {
        wrapper: wrapperWithQueryClient(createTestQueryClient()),
        initialProps: { categoria: 'cloth' },
      },
    )
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())

    rerender({ categoria: 'planks' })

    await waitFor(() => expect(pedidos.at(-1)?.get('category')).toBe('planks'))
    expect(pedidos.at(-1)?.has('subcategory')).toBe(false)
  })

  test('desligado — a tela vazia —, não pede nada', async () => {
    // A tela abre sem nada escolhido (task 21) e não calcula nada. Baixar os 187 KB do realm
    // para não usar era desperdício.
    const pedidos = registrarPedidos()
    const { result } = renderHook(() => usePriceSnapshot('west', ['1002'], null, false), {
      wrapper: wrapperWithQueryClient(createTestQueryClient()),
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(pedidos).toHaveLength(0)
    expect(result.current.loading).toBe(false)
    expect(result.current.snapshot).toBeNull()
  })
})

describe('snapshot por saídas salvas (A07)', () => {
  test('normaliza ordem e duplicatas na chave e na query', async () => {
    const pedidos: URLSearchParams[] = []
    server.use(
      http.get('http://localhost:8000/prices/snapshot', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams)
        return HttpResponse.json(snapshot())
      }),
    )
    const client = createTestQueryClient()
    const { result, rerender } = renderHook(
      ({ items }: { items: string[] }) =>
        usePriceSnapshot('west', ['1002'], { outputItems: items }),
      { wrapper: wrapperWithQueryClient(client), initialProps: { items: ['B', 'A', 'A'] } },
    )
    await waitFor(() => expect(result.current.snapshot).not.toBeNull())
    expect(pedidos.at(-1)?.getAll('output_item')).toEqual(['A', 'B'])

    const count = pedidos.length
    rerender({ items: ['A', 'B'] })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(pedidos).toHaveLength(count)
  })
})
