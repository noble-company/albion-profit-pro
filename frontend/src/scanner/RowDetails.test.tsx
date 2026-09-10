import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { formatSilver, money } from '@/lib/money'

import { computeScanner, explainRow, type ScannerCatalog, type ScannerParams } from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'
import { RowDetails } from './RowDetails'

/**
 * Task 4/11.4. O painel é testado com o detalhe **de verdade**, saído do engine — um fixture
 * inventado provaria só que o componente sabe imprimir o que recebe, e o defeito que interessa
 * é o extrato divergir da linha que ele explica.
 */

const T = 1_757_000_000

const SNAPSHOT = {
  server: 'west',
  generated_at: new Date(T * 1000).toISOString(),
  row_count: 4,
  items: ['T4_FIBER', 'T3_CLOTH', 'T4_CLOTH'],
  locations: ['1002', '3005'],
  sources: ['client'],
  columns: {
    item: [0, 1, 2, 2],
    location: [0, 0, 0, 1],
    quality: [1, 1, 1, 1],
    enchantment: [0, 0, 0, 0],
    sell_min: ['100', '200', '1100', '1500'],
    sell_observed_at: [T, T, T, T],
    sell_source: [0, 0, 0, 0],
    buy_max: ['90', '180', '1000', '1400'],
    buy_observed_at: [T, T, T, T],
    buy_source: [0, 0, 0, 0],
  },
} as unknown as PriceSnapshotOut

const CATALOGO: ScannerCatalog = {
  items: [
    { unique_name: 'T4_CLOTH', weight: '0.51', enchantment_level: 0 },
    { unique_name: 'T4_FIBER', weight: '0.51', enchantment_level: 0 },
    { unique_name: 'T3_CLOTH', weight: '0.38', enchantment_level: 0 },
  ] as ScannerCatalog['items'],
  recipes: [
    {
      output_item: 'T4_CLOTH',
      production_kind: 'refining',
      enchantment_level: 0,
      silver_cost: 0,
      crafting_focus: 100,
      amount_crafted: 1,
      ingredients: [
        { item: 'T4_FIBER', count: 2, enchantment_level: 0 },
        { item: 'T3_CLOTH', count: 1, enchantment_level: 0 },
      ],
      upgrade_resource: null,
    },
  ] as ScannerCatalog['recipes'],
}

const PARAMS: ScannerParams = {
  locations: ['1002'],
  priceLocations: ['1002'],
  pricing: {
    base: { kind: 'sale_city' },
    manual: new Map(),
    byItemCity: new Map(),
    manualSale: new Map(),
  },
  strategy: { acquisition: 'best', sale: 'best' },
  quantityMeans: 'initial_recipes',
  destinyBoard: new Map(),
  premium: true,
  returnRate: '0',
  stationFeePer100Nutrition: '0',
  useFocus: false,
  outputQuality: 1,
  quantity: 1,
}

function montar(onExcecao = vi.fn(), precoDeVendaFixado?: string) {
  const index = buildPriceIndex(SNAPSHOT)
  const detail = explainRow(CATALOGO, index, PARAMS, {
    outputItem: 'T4_CLOTH',
    locationId: '1002',
  })!

  render(
    <RowDetails
      detail={detail}
      nomeItem={(u) => u}
      locationName={(id) => ({ '1002': 'Lymhurst', '3005': 'Caerleon' })[id] ?? id}
      precoPorCidade={[
        { locationId: '1002', sell: money('1100'), buy: money('1000') },
        { locationId: '3005', sell: money('1500'), buy: money('1400') },
      ]}
      precoDeVendaFixado={precoDeVendaFixado}
      precosFixados={new Map()}
      onExcecao={onExcecao}
      agora={new Date(T * 1000)}
    />,
  )
  return { detail, onExcecao }
}

/** Consulta dentro de uma seção do painel, pelo título dela. */
function secao(titulo: string) {
  return within(screen.getByRole('heading', { name: titulo }).closest('section')!)
}

describe('extrato', () => {
  test('o custo total do painel é o MESMO da linha da tabela', () => {
    // O defeito que este teste existe para pegar: um painel que soma diferente da linha
    // convida a decidir pelo número errado, e o erro fica invisível porque os dois "parecem"
    // certos separadamente.
    const { detail } = montar()
    const daTabela = computeScanner(CATALOGO, buildPriceIndex(SNAPSHOT), PARAMS)[0]!

    expect(detail.breakdown.totalCost.toString()).toBe(daTabela.totalCost!.toString())
    expect(detail.breakdown.netRevenue.toString()).toBe(daTabela.netRevenue!.toString())
    // Aparece duas vezes de propósito: no extrato e na linha do cenário vencedor.
    expect(screen.getAllByText('370 silver').length).toBeGreaterThan(0)
  })

  test('mostra o preço de equilíbrio', () => {
    montar()
    // 370 / (1 − 0,04 − 0,025) = 395,72 -> exibido arredondado
    expect(screen.getByText(/39[56] silver/)).toBeInTheDocument()
  })
})

describe('procedência do preço', () => {
  test('cada ingrediente diz de onde veio o preço e de quando', () => {
    montar()
    // Duas linhas de ingrediente, ambas com fonte `client` e idade "agora".
    expect(secao('Compra').getAllByText(/client · agora/)).toHaveLength(2)
  })
})

describe('cenários', () => {
  test('os quatro aparecem e o vencedor está marcado', () => {
    montar()

    const cenarios = secao('Cenários')
    // Compra e venda em colunas próprias. O rótulo "compra imediata · venda imediata" numa
    // coluna estreita quebrava em duas linhas, e os números ao lado também.
    expect(cenarios.getAllByRole('row')).toHaveLength(5) // cabeçalho + 4 cenários
    const vencedor = cenarios.getByTitle('É o que a tabela mostra').closest('tr')!
    expect(within(vencedor).getAllByText('ordem')).toHaveLength(2)
  })
})

describe('edição de preço', () => {
  test('fixar o preço de venda publica a exceção com o item de saída', async () => {
    const user = userEvent.setup()
    const { onExcecao } = montar()

    await user.click(screen.getByRole('button', { name: 'Fixar preço de venda de T4_CLOTH' }))
    const campo = screen.getByLabelText('Fixar preço de venda de T4_CLOTH')
    await user.type(campo, '1200')
    // O botão do próprio campo — há um "Fixar" por ingrediente também.
    await user.click(within(campo.parentElement!).getByRole('button'))

    expect(onExcecao).toHaveBeenCalledWith('sx', 'T4_CLOTH', '1200')
  })

  test('campo vazio REMOVE a exceção em vez de gravar zero', async () => {
    // Apagar o número é "volta a usar o mercado", não "vale zero".
    const user = userEvent.setup()
    const { onExcecao } = montar()

    await user.click(screen.getByRole('button', { name: 'Fixar preço de venda de T4_CLOTH' }))
    const campo = screen.getByLabelText('Fixar preço de venda de T4_CLOTH')
    await user.click(within(campo.parentElement!).getByRole('button'))

    expect(onExcecao).toHaveBeenCalledWith('sx', 'T4_CLOTH', null)
  })
})

describe('comparação entre cidades', () => {
  test('lista o preço da saída em cada cidade, destacando a da linha', () => {
    montar()

    expect(screen.getByText('Caerleon')).toBeInTheDocument()
    expect(secao('Venda').getByText('1.500')).toBeInTheDocument()
  })
})

describe('o que saiu da tabela (task 4/20)', () => {
  test('custo por item, lucro por kg e lucro por foco ficam no painel', () => {
    const { detail } = montar()
    const resultado = secao('Resultado')

    expect(resultado.getByText('Custo por item')).toBeInTheDocument()
    expect(resultado.getByText(formatSilver(detail.row.averageUnitCost))).toBeInTheDocument()
    expect(resultado.getByText('Lucro por kg')).toBeInTheDocument()
    expect(resultado.getByText('Lucro por foco')).toBeInTheDocument()
  })

  test('a idade do dado mora no Resultado; a fonte, ao lado de cada preço', () => {
    montar()
    // "Fonte: média de 7, média de 5, média de 6, aodp" numa linha só era ruído: cada preço já
    // diz de onde veio, junto dele.
    expect(secao('Resultado').getByText('Dado mais velho')).toBeInTheDocument()
    expect(secao('Resultado').queryByText('Fonte')).not.toBeInTheDocument()
  })
})

describe('organização do painel (task 20, revista no uso)', () => {
  // Reportado com print: "ta muito bagunçado". Cinco seções soltas numa grade de três colunas
  // alinhavam por linha, e a mais alta de cada linha abria buraco nas vizinhas.

  test('o extrato fecha no lucro', () => {
    const { detail } = montar()
    const extrato = secao('Extrato')

    expect(extrato.getByText('Lucro')).toBeInTheDocument()
    expect(extrato.getByText(formatSilver(detail.row.profit))).toBeInTheDocument()
  })

  test('o preço de equilíbrio mora no Resultado, com os outros números derivados', () => {
    montar()

    expect(secao('Resultado').getByText('Preço de equilíbrio (por item)')).toBeInTheDocument()
    expect(secao('Extrato').queryByText('Preço de equilíbrio (por item)')).not.toBeInTheDocument()
  })

  test('a venda diz por quanto, onde, de que fonte e de quando é o preço usado', () => {
    montar()
    const venda = secao('Venda')

    expect(venda.getByText('Melhor venda')).toBeInTheDocument()
    expect(venda.getByText(/client · agora/)).toBeInTheDocument()
  })

  test('os campos de preço na mão começam fechados', async () => {
    // Três campos sempre abertos — um por ingrediente e um da venda — eram o que mais ocupava o
    // painel. Ficam a um clique.
    const user = userEvent.setup()
    montar()
    expect(screen.queryByPlaceholderText('preço na mão')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fixar preço de venda de T4_CLOTH' }))
    expect(screen.getByLabelText('Fixar preço de venda de T4_CLOTH')).toBeInTheDocument()
  })

  test('preço que já está fixado aparece aberto, com o valor', () => {
    // Fechado ele esconderia justamente o que o jogador declarou.
    montar(vi.fn(), '1200')
    expect(screen.getByLabelText('Fixar preço de venda de T4_CLOTH')).toHaveValue('1200')
  })
})
