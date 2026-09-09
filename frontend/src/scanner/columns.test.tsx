import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { components } from '@/api/schema'
import { money } from '@/lib/money'

import { buildColumns, motivoSemPreco } from './columns'
import type { ScannerRow } from './engine'

/**
 * Task 4/11. É **aqui** que o conteúdo da tabela é verificado: cada `cell` é pura, então não
 * depende do virtualizador — que não funciona em jsdom (`W4`).
 */

type CatalogItem = components['schemas']['CatalogItemOut']

const locationName = (id: string) => ({ '1002': 'Lymhurst' })[id] ?? id
const nomeItem = (unique: string) => unique

function row(overrides: Partial<ScannerRow> = {}): ScannerRow {
  return {
    outputItem: 'T4_CLOTH',
    locationId: '1002',
    productionKind: 'refining',
    state: 'priced',
    acquisitionMode: 'immediate',
    saleMode: 'immediate',
    averageUnitCost: money('4'),
    totalCost: money('400'),
    grossRevenue: money('1000'),
    salesTax: money('40'),
    totalFees: money('40'),
    netRevenue: money('960'),
    profit: money('560'),
    roi: money('140'),
    profitPerWeight: money('1098.04'),
    profitPerFocus: null,
    executions: 1,
    producedQuantity: 1,
    focusConsumed: 0,
    oldestObservedAt: 1_757_000_000,
    sources: ['client'],
    ingredients: [],
    ...overrides,
  }
}

const item = { unique_name: 'T4_CLOTH', name_pt: 'Tecido Fino', tier: 4 } as CatalogItem

function renderCell(key: string, r: ScannerRow, i: CatalogItem | undefined = item) {
  const column = buildColumns(locationName, nomeItem).find((c) => c.key === key)!
  render(<>{column.cell(r, i)}</>)
}

describe('linha sem preço', () => {
  test('a coluna de lucro diz o MOTIVO, não um zero', () => {
    // Zero seria uma afirmação sobre o mercado. O motivo é a verdade: não sabemos.
    renderCell('lucro', row({ state: 'missing_ingredient_price', profit: null }))
    expect(screen.getByText('sem preço de ingrediente')).toBeInTheDocument()
  })

  test('cada estado tem seu motivo', () => {
    expect(motivoSemPreco(row({ state: 'missing_output_price' }))).toBe(
      'sem preço de venda',
    )
    expect(motivoSemPreco(row({ state: 'missing_ingredient_price' }))).toBe(
      'sem preço de ingrediente',
    )
    expect(motivoSemPreco(row())).toBeNull()
  })

  test('as colunas numéricas viram traço, nunca zero', () => {
    for (const key of [
      'custo',
      'custoMedio',
      'receita',
      'roi',
      'lucroPorPeso',
      'lucroPorFoco',
    ]) {
      const { unmount } = render(
        <>
          {buildColumns(locationName, nomeItem)
            .find((c) => c.key === key)!
            .cell(
              row({
                state: 'no_price',
                totalCost: null,
                averageUnitCost: null,
                grossRevenue: null,
                roi: null,
                profitPerWeight: null,
                profitPerFocus: null,
              }),
              item,
            )}
        </>,
      )
      expect(screen.getByText('—'), `coluna ${key}`).toBeInTheDocument()
      unmount()
    }
  })
})

describe('sinal do número', () => {
  test('prejuízo é vermelho, lucro é verde', () => {
    // Revisão da §2 de `13-linguagem-visual.md` na task 4/11: o scanner mostra receita que NÃO
    // dá lucro por padrão, e pintar prejuízo de verde induziria a erro.
    const { container, unmount } = render(
      <>{buildColumns(locationName, nomeItem).find((c) => c.key === 'lucro')!.cell(row(), item)}</>,
    )
    expect(container.querySelector('.text-profit')).not.toBeNull()
    unmount()

    render(
      <>
        {buildColumns(locationName, nomeItem)
          .find((c) => c.key === 'lucro')!
          .cell(row({ profit: money('-500') }), item)}
      </>,
    )
    expect(document.querySelector('.text-danger')).not.toBeNull()
  })
})

describe('lista de compras', () => {
  const ingrediente = {
    item: 'T5_WOOD',
    enchantmentLevel: 0,
    purchaseQuantity: 3000,
    unitPrice: money('120'),
    subtotal: money('360000'),
  }

  test('o nome do ingrediente corta; a quantidade, não', () => {
    // Truncar nome e quantidade juntos apaga justamente o número que manda comprar: na coluna
    // estreita sobra "Troncos de Cedro Rar…" e nenhuma quantidade — foi o que apareceu na tela.
    renderCell('ing0', row({ ingredients: [ingrediente] }))

    expect(screen.getByText('×3.000').closest('.truncate')).toBeNull()
    expect(screen.getByText('T5_WOOD').className).toMatch(/\btruncate\b/)
  })
})

describe('rendimento da sessão (task 11.6)', () => {
  test('mostra quantos itens saem no fim, não quantas receitas foram compradas', () => {
    // É o número que responde "vou terminar com quanto?". Com 1000 receitas e 15,2% de
    // retorno são 1179 execuções — e 1179 itens, não os 1000 comprados.
    renderCell('rendimento', row({ executions: 1179, producedQuantity: 1179 }))
    expect(screen.getByText('1.179')).toBeInTheDocument()
  })
})

describe('estratégia na linha (task 11.5)', () => {
  test('a coluna diz em que cenário o número foi feito', () => {
    // Sem isso, "lucro 658" some com a premissa: ele supõe a ordem de compra E a de venda
    // sendo aceitas. É a expectativa falsa que a leitura por cima cria.
    const column = buildColumns(locationName, nomeItem, new Date(), true).find(
      (c) => c.key === 'estrategia',
    )!
    render(<>{column.cell(row({ acquisitionMode: 'buy_order', saleMode: 'sell_order' }), item)}</>)

    expect(screen.getByText('ordem → ordem')).toBeInTheDocument()
  })

  test('sem a coluna pedida, ela não existe — a barra já respondeu', () => {
    expect(
      buildColumns(locationName, nomeItem).some((c) => c.key === 'estrategia'),
    ).toBe(false)
  })
})

describe('procedência e contexto', () => {
  test('idade impossível vira traço, não derruba a tela', () => {
    // Defesa em profundidade: o engine já não produz `Infinity`, mas uma data inválida chegando
    // aqui não pode virar `RangeError` no meio do render — foi assim que a tela inteira caiu no
    // boundary. Formatar é apresentação; apresentação não derruba produto.
    renderCell('idade', row({ oldestObservedAt: Number.POSITIVE_INFINITY }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  test('a fonte de cada linha é exibida', () => {
    renderCell('fonte', row({ sources: ['client', 'aodp'] }))
    expect(screen.getByText('client, aodp')).toBeInTheDocument()
  })

  test('a cidade é traduzida pelo catálogo de localizações', () => {
    renderCell('cidade', row())
    expect(screen.getByText('Lymhurst')).toBeInTheDocument()
  })

  test('lucro por peso aparece quando o item tem peso', () => {
    renderCell('lucroPorPeso', row())
    expect(screen.getByText('1.098')).toBeInTheDocument()
  })
})
