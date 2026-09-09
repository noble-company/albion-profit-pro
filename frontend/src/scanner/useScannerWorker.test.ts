import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { ScannerCatalog, ScannerParams } from './engine'
import type { PriceSnapshotOut } from './prices'
import { useScannerWorker, type EntradaDoWorker } from './useScannerWorker'
import type { ScannerMessage, ScannerResponse } from './worker'

/**
 * Task 4/12. O que se testa aqui não é a conta — é o **protocolo**. Com 2,5 s de cálculo, dois
 * pedidos ficam em voo o tempo todo enquanto o jogador digita, e a ordem de chegada não é
 * garantida. Uma resposta velha pintando a tela mostra números de um cenário que o usuário já
 * abandonou, sem nada indicando isso.
 *
 * O Worker de verdade não existe em jsdom, então o teste injeta um dublê e controla **quando**
 * cada resposta chega — que é exatamente a variável que importa.
 */

class WorkerFalso {
  onmessage: ((event: MessageEvent<ScannerResponse>) => void) | null = null
  readonly recebidas: ScannerMessage[] = []
  terminado = false

  postMessage(mensagem: ScannerMessage) {
    this.recebidas.push(mensagem)
  }

  terminate() {
    this.terminado = true
  }

  /** Devolve uma resposta com o `id` pedido — é assim que se simula chegada fora de ordem. */
  responder(id: number, totalCost: string) {
    this.onmessage?.({
      data: {
        id,
        durationMs: 1,
        rows: [
          {
            outputItem: 'T4_CLOTH',
            locationId: '1002',
            productionKind: 'crafting',
            state: 'priced',
            acquisitionMode: 'immediate',
            saleMode: 'immediate',
            totalCost,
            averageUnitCost: null,
            grossRevenue: null,
            salesTax: null,
            totalFees: null,
            netRevenue: null,
            profit: null,
            roi: null,
            profitPerWeight: null,
            profitPerFocus: null,
            executions: 1,
            producedQuantity: 1,
            focusConsumed: 0,
            oldestObservedAt: null,
            sources: [],
            ingredients: [],
          },
        ],
      },
    } as unknown as MessageEvent<ScannerResponse>)
  }
}

const CATALOGO = { items: [], recipes: [] } as ScannerCatalog
const SNAPSHOT = {} as PriceSnapshotOut

function entrada(quantity: number): EntradaDoWorker {
  return {
    catalog: CATALOGO,
    snapshot: SNAPSHOT,
    canonical: [['1301', '1002']],
    params: { quantity } as ScannerParams,
  }
}

function montar() {
  const worker = new WorkerFalso()
  const hook = renderHook(
    ({ dados }: { dados: EntradaDoWorker }) =>
      useScannerWorker(dados, () => worker as unknown as Worker),
    { initialProps: { dados: entrada(100) } },
  )
  return { worker, hook }
}

describe('protocolo', () => {
  test('o catálogo viaja uma vez; a mudança de cenário manda só os parâmetros', () => {
    const { worker, hook } = montar()

    const dadosIniciais = { ...entrada(100) }
    hook.rerender({ dados: { ...dadosIniciais, params: { quantity: 500 } as ScannerParams } })

    const tipos = worker.recebidas.map((m) => m.type)
    expect(tipos.filter((t) => t === 'data')).toHaveLength(1)
    expect(tipos.filter((t) => t === 'compute').length).toBeGreaterThanOrEqual(2)
  })

  test('desmontar encerra o worker — senão sobra thread rodando sozinha', () => {
    const { worker, hook } = montar()
    hook.unmount()
    expect(worker.terminado).toBe(true)
  })
})

describe('resposta fora de ordem', () => {
  test('a resposta do pedido ANTIGO é descartada', () => {
    const { worker, hook } = montar()

    // Segundo cenário pedido antes de o primeiro responder — é o que acontece digitando.
    act(() => {
      hook.rerender({ dados: entrada(500) })
    })
    const ids = worker.recebidas
      .filter((m): m is Extract<ScannerMessage, { type: 'compute' }> => m.type === 'compute')
      .map((m) => m.id)
    const [primeiro, ultimo] = [ids[0]!, ids[ids.length - 1]!]
    expect(ultimo).toBeGreaterThan(primeiro)

    act(() => {
      worker.responder(ultimo, '999')
    })
    expect(hook.result.current.rows[0]?.totalCost?.toString()).toBe('999')

    // O antigo chega depois. Se pintasse, a tela voltaria para um cenário abandonado.
    act(() => {
      worker.responder(primeiro, '111')
    })
    expect(hook.result.current.rows[0]?.totalCost?.toString()).toBe('999')
  })

  test('enquanto o cálculo não volta, a tela sabe que está calculando', () => {
    const { worker, hook } = montar()
    expect(hook.result.current.calculando).toBe(true)

    const id = worker.recebidas
      .filter((m): m is Extract<ScannerMessage, { type: 'compute' }> => m.type === 'compute')
      .map((m) => m.id)
      .at(-1)!

    act(() => {
      worker.responder(id, '42')
    })

    expect(hook.result.current.calculando).toBe(false)
    expect(hook.result.current.duracaoMs).toBe(1)
  })
})

describe('sem entrada', () => {
  test('não pede cálculo antes de o catálogo existir', () => {
    const worker = new WorkerFalso()
    renderHook(() => useScannerWorker(null, () => worker as unknown as Worker))

    expect(worker.recebidas).toHaveLength(0)
  })
})

test('a linha revivida volta a ter Decimal, não string', () => {
  const { worker, hook } = montar()
  const id = worker.recebidas
    .filter((m): m is Extract<ScannerMessage, { type: 'compute' }> => m.type === 'compute')
    .map((m) => m.id)
    .at(-1)!

  act(() => {
    worker.responder(id, '1234.5')
  })

  // `.plus` só existe se o protótipo voltou: é o que `structuredClone` sozinho perderia.
  expect(hook.result.current.rows[0]?.totalCost?.plus(1).toString()).toBe('1235.5')
  expect(vi.isMockFunction(hook.result.current.rows[0]?.totalCost)).toBe(false)
})
