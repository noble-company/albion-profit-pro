import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { components } from '@/api/schema'
import { money } from '@/lib/money'

import type { ScannerRow } from './engine'
import { CELULA_FIXA, ScannerTable, type ScannerColumn } from './ScannerTable'
import { DEFAULT_SORT, type SortState } from './sorting'

/**
 * Task 4/10. O que importa: a tabela é **virtualizada, não paginada**. A distinção é o
 * coração da fase — a página do servidor virava o universo, e ordenar sobre ela mentia
 * (`F08`). Aqui o conjunto inteiro está em memória; só o DOM é recortado.
 */

type CatalogItem = components['schemas']['CatalogItemOut']

function row(nome: string, profit: string | null): ScannerRow {
  return {
    outputItem: nome,
    locationId: '1002',
    productionKind: 'refining',
    tier: 4,
    enchantmentLevel: 0,
    state: profit === null ? 'missing_output_price' : 'priced',
    acquisitionMode: null,
    saleMode: null,
    totalCost: null,
    averageUnitCost: null,
    grossRevenue: null,
    salesTax: null,
    totalFees: null,
    netRevenue: null,
    profit: profit === null ? null : money(profit),
    roi: null,
    profitPerWeight: null,
    profitPerFocus: null,
    saleUnitPrice: null,
    saleObservedAt: null,
    saleSource: null,
    executions: 1,
    producedQuantity: 1,
    focusConsumed: 0,
    oldestObservedAt: profit === null ? null : 1_757_000_000,
    sources: [],
    ingredients: [],
  }
}

const columns: ScannerColumn[] = [
  { key: 'item', header: 'Item', width: '12rem', cell: (r) => r.outputItem },
  {
    key: 'profit',
    header: 'Lucro',
    sortField: 'profit',
    numeric: true,
    width: '7rem',
    weight: 'primary',
    cell: (r) => r.profit?.toString() ?? '—',
  },
]

const items = new Map<string, CatalogItem>()

function renderTable(
  rows: ScannerRow[],
  sort: SortState = DEFAULT_SORT,
  onSortChange = vi.fn(),
) {
  const result = render(
    <div style={{ height: 400 }}>
      <ScannerTable
        rows={rows}
        columns={columns}
        items={items}
        sort={sort}
        onSortChange={onSortChange}
      />
    </div>,
  )
  return { ...result, onSortChange }
}

/**
 * **Virtualização não é testada aqui, de propósito.** `@tanstack/react-virtual` mede o
 * viewport com layout real; jsdom não faz layout, então o virtualizador conclui que não há
 * área visível e renderiza zero linhas — nem `ResizeObserver` stubado nem `initialRect`
 * mudam isso. Um teste de contagem aqui passaria contando o cabeçalho e não observaria nada
 * (a lição do `W3`: guard que passa fácil demais está medindo outra coisa).
 *
 * O que cobre a regressão de verdade:
 * - `src/test/scanner-nao-pagina.test.ts` — guard textual contra a volta da paginação;
 * - a verificação no navegador da task 11, contando nós do DOM com layout real.
 *
 * Pelo mesmo motivo, o conteúdo das células é testado onde ele é puro: nas definições de
 * coluna (`cell(row, item)`), na task 11.
 */

describe('ordenação', () => {
  test('clicar no cabeçalho pede ordenação — a tabela não reordena por conta própria', () => {
    // A tabela é burra de propósito: quem ordena é a tela, sobre o conjunto inteiro. Se ela
    // ordenasse localmente, ordenaria só o que está renderizado.
    const { onSortChange } = renderTable([row('a', '10')], {
      field: 'roi',
      direction: 'desc',
    })

    return userEvent.click(screen.getByRole('button', { name: /Lucro/ })).then(() => {
      expect(onSortChange).toHaveBeenCalledWith({ field: 'profit', direction: 'desc' })
    })
  })

  test('clicar de novo no campo já ativo inverte a direção', async () => {
    const { onSortChange } = renderTable([row('a', '10')], {
      field: 'profit',
      direction: 'desc',
    })

    await userEvent.click(screen.getByRole('button', { name: /Lucro/ }))

    expect(onSortChange).toHaveBeenCalledWith({ field: 'profit', direction: 'asc' })
  })

  test('a coluna ativa anuncia a direção para leitor de tela', () => {
    renderTable([row('a', '10')], { field: 'profit', direction: 'desc' })

    const cabecalhos = screen.getAllByRole('columnheader')
    const lucro = cabecalhos.find((c) => c.textContent?.includes('Lucro'))
    expect(lucro).toHaveAttribute('aria-sort', 'descending')
  })
})

describe('cabeçalho', () => {
  test('o cabeçalho fica DENTRO da área que rola, e gruda no topo', () => {
    // Com 15 colunas a tabela rola na horizontal. Com o cabeçalho fora do contêiner que rola,
    // as linhas andam para o lado e ele fica parado — a partir do primeiro pixel de rolagem
    // cada rótulo passa a descrever a coluna do vizinho. Dentro da área rolável ele acompanha
    // na horizontal; `sticky` é o que o mantém visível na vertical.
    const { container } = renderTable([row('a', '10')])

    const cabecalho = screen.getByRole('row')
    const areaRolavel = container.querySelector('.overflow-auto')

    expect(areaRolavel).not.toBeNull()
    expect(areaRolavel?.contains(cabecalho)).toBe(true)
    expect(cabecalho.className).toMatch(/\bsticky\b/)
  })
})

describe('coluna de identidade', () => {
  test('a primeira coluna gruda na esquerda ao rolar', () => {
    // Com 15 colunas, rolar até "Lucro/foco" tira o nome do item da tela e o número perde o
    // dono. A célula do corpo usa a MESMA constante (`CELULA_FIXA`) — em jsdom o virtualizador
    // não renderiza linha nenhuma (`W4`), então é o cabeçalho que prova a classe, e a constante
    // compartilhada é o que impede cabeçalho e corpo de divergirem.
    renderTable([row('a', '10')])

    const primeira = screen.getAllByRole('columnheader')[0]
    expect(primeira?.className).toContain(CELULA_FIXA)
  })
})

describe('estado vazio', () => {
  test('diz que a ausência é do filtro, não do mercado', () => {
    renderTable([])

    expect(
      screen.getByText('Nenhuma receita corresponde aos filtros'),
    ).toBeInTheDocument()
    expect(screen.getByText(/é o filtro, não o mercado/)).toBeInTheDocument()
  })
})

describe('cabeçalho com dois alvos de ordenação (task 4/20)', () => {
  // "Lucro" e "%" moram na mesma coluna: a célula mostra prata e ROI juntos, e o jogador tem
  // que conseguir ordenar por qualquer um dos dois.
  const comDoisAlvos: ScannerColumn[] = [
    { key: 'item', header: 'Item', width: '12rem', cell: (r) => r.outputItem },
    {
      key: 'lucro',
      header: 'Lucro',
      numeric: true,
      width: '7rem',
      sortTargets: [
        { field: 'profit', label: 'Lucro' },
        { field: 'roi', label: '%' },
      ],
      cell: (r) => r.profit?.toString() ?? '—',
    },
  ]

  function montar(sort: SortState = DEFAULT_SORT, onSortChange = vi.fn()) {
    render(
      <div style={{ height: 400 }}>
        <ScannerTable
          rows={[row('a', '10')]}
          columns={comDoisAlvos}
          items={items}
          sort={sort}
          onSortChange={onSortChange}
        />
      </div>,
    )
    return onSortChange
  }

  test('cada alvo ordena pelo seu próprio campo', async () => {
    const onSortChange = montar()

    await userEvent.click(screen.getByRole('button', { name: '%' }))
    expect(onSortChange).toHaveBeenLastCalledWith({ field: 'roi', direction: 'desc' })

    await userEvent.click(screen.getByRole('button', { name: 'Lucro' }))
    expect(onSortChange).toHaveBeenLastCalledWith({ field: 'profit', direction: 'desc' })
  })

  test('a coluna anuncia a direção quando QUALQUER alvo dela está ativo', () => {
    montar({ field: 'roi', direction: 'asc' })
    expect(screen.getAllByRole('columnheader')[1]).toHaveAttribute('aria-sort', 'ascending')
  })
})

describe('cabeçalho legível (task 20, revista no uso)', () => {
  test('o rótulo ordenável fica em maiúsculas como os outros', () => {
    // O preflight do Tailwind zera `text-transform` em botão: "Investimento" e "Lucro" saíam em
    // minúsculas ao lado de "VENDA BRUTA", que não é botão.
    renderTable([row('a', '10')])
    expect(screen.getByRole('button', { name: /Lucro/ })).toHaveClass('uppercase')
  })
})
