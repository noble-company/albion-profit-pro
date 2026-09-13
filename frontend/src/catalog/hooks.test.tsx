import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { server } from '@/test/msw/server'
import {
  createTestQueryClient,
  wrapperWithQueryClient,
} from '@/test/queryTestClient'

import { readCachedCatalog, writeCachedCatalog } from './cache'
import { useRecipeCatalog } from './hooks'
import type { RecipeCatalog } from './service'

/**
 * Task 4/07. O que importa aqui não é o cache funcionar — é ele **nunca** ser condição para a
 * tela funcionar. IndexedDB falha em janela privada, com disco cheio e por política do usuário.
 *
 * `idb-keyval` é mockado por um `Map`: jsdom não implementa IndexedDB, e o que está sob teste
 * é a lógica de stale-while-revalidate deste módulo, não a implementação do navegador. O modo
 * de falha (toda operação lançando) é exercitado explicitamente abaixo.
 */

const store = new Map<string, unknown>()
const falhar = { get: false, set: false }

vi.mock('idb-keyval', () => ({
  get: (key: string) => {
    if (falhar.get) return Promise.reject(new Error('IndexedDB bloqueado'))
    return Promise.resolve(store.get(key))
  },
  set: (key: string, value: unknown) => {
    if (falhar.set) return Promise.reject(new Error('IndexedDB bloqueado'))
    store.set(key, value)
    return Promise.resolve()
  },
  del: (key: string) => {
    store.delete(key)
    return Promise.resolve()
  },
}))

function catalogo(version: string): RecipeCatalog {
  return {
    version,
    kind: 'refining',
    items: [
      {
        unique_name: 'T4_CLOTH',
        name_en: 'Fine Cloth',
        name_pt: 'Tecido Fino',
        tier: 4,
        enchantment_level: 0,
        weight: '0.51',
        shop_category: 'crafting',
        shop_subcategory: 'refinedresources',
      },
    ],
    recipes: [
      {
        output_item: 'T4_CLOTH',
        production_kind: 'refining',
        enchantment_level: 0,
        silver_cost: 0,
        crafting_focus: 100,
        amount_crafted: 1,
        ingredients: [
          { item: 'T4_FIBER', count: 2, enchantment_level: 0, return_eligible: true },
        ],
        upgrade_resource: null,
      },
    ],
  }
}

function mockCatalogEndpoint(payload: RecipeCatalog, onCall?: () => void) {
  server.use(
    http.get('http://localhost:8000/catalog/recipes', () => {
      onCall?.()
      return HttpResponse.json(payload)
    }),
  )
}

const render = () =>
  renderHook(() => useRecipeCatalog('refining'), {
    wrapper: wrapperWithQueryClient(createTestQueryClient()),
  })

beforeEach(() => {
  store.clear()
  falhar.get = false
  falhar.set = false
})

describe('useRecipeCatalog', () => {
  test('cache vazio: busca da rede e grava', async () => {
    mockCatalogEndpoint(catalogo('v1'))

    const { result } = render()
    await waitFor(() => expect(result.current.catalog).not.toBeNull())

    expect(result.current.catalog?.version).toBe('v1')
    expect((await readCachedCatalog('refining'))?.version).toBe('v1')
  })

  test('cache quente: entrega sem esperar a rede, e ainda revalida', async () => {
    await writeCachedCatalog('refining', catalogo('v1'))

    // A rede fica **segura** até o teste soltar. É o que torna a sequência observável: sem
    // isso a revalidação chega tão rápido que nunca daria pra ver o conteúdo do disco — o que
    // é ótimo em produção e inútil como asserção.
    let soltarRede: () => void = () => {}
    const redeRespondeu = new Promise<void>((resolve) => {
      soltarRede = resolve
    })
    server.use(
      http.get('http://localhost:8000/catalog/recipes', async () => {
        await redeRespondeu
        return HttpResponse.json(catalogo('v2'))
      }),
    )

    const { result } = render()

    // Conteúdo na tela **antes** de a rede responder, e sem passar por "carregando".
    await waitFor(() => expect(result.current.catalog?.version).toBe('v1'))
    expect(result.current.loading).toBe(false)

    soltarRede()

    // A revalidação acontece por trás e traz a versão nova.
    await waitFor(() => expect(result.current.catalog?.version).toBe('v2'))
  })

  test('versão nova substitui o que estava em disco', async () => {
    await writeCachedCatalog('refining', catalogo('v1'))
    mockCatalogEndpoint(catalogo('v2'))

    const { result } = render()
    await waitFor(() => expect(result.current.catalog?.version).toBe('v2'))
    await waitFor(async () =>
      expect((await readCachedCatalog('refining'))?.version).toBe('v2'),
    )
  })

  test('IndexedDB indisponível: a tela funciona pela rede', async () => {
    falhar.get = true
    falhar.set = true
    mockCatalogEndpoint(catalogo('v1'))

    const { result } = render()

    await waitFor(() => expect(result.current.catalog?.version).toBe('v1'))
    expect(result.current.error).toBeNull()
  })

  test('erro de rede sem cache expõe o erro em vez de fingir vazio', async () => {
    server.use(
      http.get('http://localhost:8000/catalog/recipes', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    )

    const { result } = render()

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.catalog).toBeNull()
  })
})
