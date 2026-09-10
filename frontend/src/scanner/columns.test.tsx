import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { components } from '@/api/schema'
import { formatarIdade } from '@/lib/formatters'
import { formatPercent, formatSilver, money } from '@/lib/money'

import { buildColumns, motivoSemPreco } from './columns'
import type { ScannerIngredient, ScannerRow } from './engine'

/**
 * Task 4/11, revista na 4/20. É **aqui** que o conteúdo da tabela é verificado: cada `cell` é
 * pura, então não depende do virtualizador — que não funciona em jsdom (`W4`).
 *
 * A 20 corta a tabela para 8 colunas. O que saiu dela não sumiu: está no painel expandido e é
 * testado em `RowDetails.test.tsx`.
 */

type CatalogItem = components['schemas']['CatalogItemOut']

const T = 1_757_000_000
/** Duas horas depois de toda observação dos fixtures. */
const AGORA = new Date((T + 7200) * 1000)
const IDADE = formatarIdade(new Date(T * 1000).toISOString(), AGORA)

const locationName = (id: string) => ({ '1002': 'Lymhurst' })[id] ?? id
const nomeItem = (unique: string) => unique

function row(overrides: Partial<ScannerRow> = {}): ScannerRow {
  return {
    outputItem: 'T4_CLOTH',
    locationId: '1002',
    productionKind: 'refining',
    tier: 4,
    enchantmentLevel: 0,
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
    saleUnitPrice: money('1000'),
    saleObservedAt: T,
    saleSource: 'client',
    executions: 1,
    producedQuantity: 1,
    focusConsumed: 0,
    oldestObservedAt: T,
    sources: ['client'],
    ingredients: [],
    ...overrides,
  }
}

function ingrediente(
  item: string,
  overrides: Partial<ScannerIngredient> = {},
): ScannerIngredient {
  return {
    item,
    enchantmentLevel: 0,
    purchaseQuantity: 3000,
    unitPrice: money('100'),
    subtotal: money('300000'),
    observedAt: T,
    ...overrides,
  }
}

const SEM_PRECO: Partial<ScannerRow> = {
  state: 'missing_output_price',
  totalCost: null,
  averageUnitCost: null,
  grossRevenue: null,
  netRevenue: null,
  profit: null,
  roi: null,
  saleUnitPrice: null,
  saleObservedAt: null,
  saleSource: null,
}

const item = { unique_name: 'T4_CLOTH', name_pt: 'Tecido Fino', tier: 4 } as CatalogItem

function colunas(maxIngredientes = 2) {
  return buildColumns(locationName, nomeItem, { agora: AGORA, maxIngredientes })
}

function coluna(key: string, maxIngredientes = 2) {
  return colunas(maxIngredientes).find((c) => c.key === key)!
}

function renderCell(key: string, r: ScannerRow, i: CatalogItem | undefined = item) {
  render(<>{coluna(key).cell(r, i)}</>)
}

describe('as 8 colunas (task 20)', () => {
  test('na ordem em que o jogador decide', () => {
    expect(colunas().map((c) => c.key)).toEqual([
      'item',
      'investimento',
      'vendaBruta',
      'lucro',
      'venda',
      'compra',
      'foco',
      'rendimento',
    ])
  })

  test('são as mesmas no refino e no craft — só a largura da Compra acompanha', () => {
    // O refino tem 2 ingredientes, o craft até 4. Antes a tela trocava de colunas conforme a
    // aba; agora os cards de Compra absorvem a diferença.
    expect(colunas(4).map((c) => c.key)).toEqual(colunas(2).map((c) => c.key))
    expect(coluna('compra', 4).width).not.toBe(coluna('compra', 2).width)
  })

  test('nada do que saiu voltou como coluna', () => {
    // Cada uma destas mora no painel expandido agora.
    const chaves = colunas().map((c) => c.key)
    for (const saiu of [
      'cidade',
      'custoMedio',
      'lucroPorPeso',
      'lucroPorFoco',
      'estrategia',
      'idade',
      'fonte',
      'ingredientes',
      'ing0',
      'sub0',
    ]) {
      expect(chaves).not.toContain(saiu)
    }
  })

  test('a coluna Item ordena por tier (task 19)', () => {
    expect(coluna('item').sortField).toBe('tier')
  })
})

describe('lucro', () => {
  test('prata e percentual na mesma célula', () => {
    renderCell('lucro', row())

    expect(screen.getByText(formatSilver(money('560')))).toBeInTheDocument()
    expect(screen.getByText(formatPercent(money('140')))).toBeInTheDocument()
  })

  test('ordena por lucro OU por ROI, pelo mesmo cabeçalho', () => {
    expect(coluna('lucro').sortTargets?.map((alvo) => alvo.field)).toEqual(['profit', 'roi'])
  })

  test('prejuízo é vermelho, lucro é verde', () => {
    renderCell('lucro', row({ profit: money('-5'), roi: money('-2') }))
    expect(screen.getByText(formatSilver(money('-5')))).toHaveClass('text-danger')
  })

  test('sem preço, diz o MOTIVO — não um zero', () => {
    const r = row(SEM_PRECO)
    renderCell('lucro', r)
    expect(screen.getByText(motivoSemPreco(r)!)).toBeInTheDocument()
  })
})

describe('venda', () => {
  test('diz a cidade, o preço unitário e de quando é o preço', () => {
    // Com a cidade fora da linha (task 19), "Venda bruta" sozinha não diria ONDE nem por
    // QUANTO se vende.
    renderCell('venda', row())

    expect(screen.getByText('Lymhurst')).toBeInTheDocument()
    expect(screen.getByText('1.000')).toBeInTheDocument()
    expect(screen.getByText(IDADE)).toBeInTheDocument()
  })

  test('preço fixado na mão diz que é fixo, sem inventar idade', () => {
    renderCell('venda', row({ saleObservedAt: null }))
    expect(screen.getByText('preço fixo')).toBeInTheDocument()
  })

  test('sem preço de venda, traço', () => {
    renderCell('venda', row(SEM_PRECO))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  test('idade impossível não derruba a tela', () => {
    // Foi um `new Date(Infinity).toISOString()` no meio do render que levou a tela inteira ao
    // ErrorBoundary na task 11. Formatar é apresentação e não pode derrubar produto.
    expect(() =>
      renderCell('venda', row({ saleObservedAt: Number.POSITIVE_INFINITY })),
    ).not.toThrow()
  })
})

describe('compra', () => {
  const QUATRO = ['T4_FIBER', 'T4_HIDE', 'T4_ORE', 'T4_WOOD'].map((nome) => ingrediente(nome))

  test('um card por ingrediente, de 1 a 4', () => {
    renderCell('compra', row({ ingredients: QUATRO }))
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  test('a quantidade aparece inteira em cada card', () => {
    renderCell('compra', row({ ingredients: [ingrediente('T4_FIBER')] }))
    expect(screen.getByText('×3.000')).toBeInTheDocument()
  })

  test('o nome completo fica no título do card, para o hover', () => {
    renderCell('compra', row({ ingredients: [ingrediente('T4_FIBER')] }))
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'title',
      expect.stringContaining('T4_FIBER'),
    )
  })

  test('cada card diz de quando é o preço', () => {
    renderCell('compra', row({ ingredients: QUATRO }))
    expect(screen.getAllByText(IDADE)).toHaveLength(4)
  })

  test('ingrediente sem preço mostra traço, não zero', () => {
    renderCell(
      'compra',
      row({
        ingredients: [
          ingrediente('T4_FIBER', { unitPrice: null, subtotal: null, observedAt: null }),
        ],
      }),
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('traço, nunca zero', () => {
  test('investimento e venda bruta sem preço', () => {
    const r = row(SEM_PRECO)
    // Cada célula no seu elemento, como na tabela. Lado a lado no mesmo pai, os dois traços
    // viravam um texto só ("——") e o teste falhava sem haver defeito nenhum na coluna.
    render(
      <>
        <span>{coluna('investimento').cell(r, item)}</span>
        <span>{coluna('vendaBruta').cell(r, item)}</span>
      </>,
    )
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  test('foco zero não é "0 de foco" — é não usar foco', () => {
    renderCell('foco', row({ focusConsumed: 0 }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('rendimento da sessão (task 11.6)', () => {
  test('mostra quantos itens saem no fim, não quantas receitas foram compradas', () => {
    renderCell('rendimento', row({ producedQuantity: 1179, executions: 1179 }))
    expect(screen.getByText('1.179')).toBeInTheDocument()
  })
})
