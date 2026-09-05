import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Opportunity } from '@/opportunities/service'

import { OpportunityTable, type OpportunityColumn } from './OpportunityTable'

const rows: Opportunity[] = [
  {
    kind: 'flip',
    item: 'T4_BAG',
    item_name: 'Bolsa T4',
    quantity: 1,
    profit: '120',
  },
  {
    kind: 'flip',
    item: 'T5_BAG',
    item_name: 'Bolsa T5',
    quantity: 1,
    profit: '340',
  },
]

const columns: OpportunityColumn[] = [
  { header: 'Item', cell: (row) => row.item_name },
  { header: 'Lucro', cell: (row) => row.profit },
]

test('renderiza cabeçalhos, linhas e a contagem da página', () => {
  render(
    <OpportunityTable
      title="Ranking atual"
      description="mais lucrativo por receita"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.item}
    />,
  )
  expect(screen.getByRole('columnheader', { name: 'Item' })).toBeInTheDocument()
  expect(screen.getByText('Bolsa T4')).toBeInTheDocument()
  expect(screen.getByText('Bolsa T5')).toBeInTheDocument()
  expect(screen.getByText('2 nesta página')).toBeInTheDocument()
  expect(screen.getAllByRole('row')).toHaveLength(3) // 1 head + 2 body
})

test('a coluna é definida pelo chamador — um cell interativo funciona', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  render(
    <OpportunityTable
      title="Ranking"
      description="x"
      rows={rows}
      columns={[
        { header: 'Item', cell: (row) => row.item_name },
        {
          header: 'Detalhes',
          cell: (row) => (
            <button
              type="button"
              onClick={() => {
                onOpen(row.item)
              }}
            >
              Analisar
            </button>
          ),
        },
      ]}
      rowKey={(row) => row.item}
    />,
  )
  const firstRow = screen.getByText('Bolsa T4').closest('tr')!
  await user.click(within(firstRow).getByRole('button', { name: 'Analisar' }))
  expect(onOpen).toHaveBeenCalledWith('T4_BAG')
})

test('coluna numérica alinha à direita com tabular-nums (task 14 §1)', () => {
  render(
    <OpportunityTable
      title="x"
      description="y"
      rows={rows}
      columns={[
        { header: 'Item', cell: (row) => row.item_name },
        { header: 'Lucro', numeric: true, cell: (row) => row.profit },
      ]}
      rowKey={(row) => row.item}
    />,
  )
  const lucro = screen.getByText('120').closest('td')!
  expect(lucro.className).toContain('text-right')
  expect(lucro.className).toContain('tabular-nums')
  const item = screen.getByText('Bolsa T4').closest('td')!
  expect(item.className).toContain('text-left')
})

test('coluna sticky recebe position:sticky e um deslocamento de borda', () => {
  render(
    <OpportunityTable
      title="x"
      description="y"
      rows={rows}
      columns={[
        {
          header: 'Item',
          sticky: 'left',
          width: '13rem',
          cell: (r) => r.item_name,
        },
        {
          header: 'Lucro',
          sticky: 'right',
          width: '7rem',
          cell: (r) => r.profit,
        },
        { header: 'ROI', sticky: 'right', width: '5rem', cell: () => '10%' },
      ]}
      rowKey={(row) => row.item}
    />,
  )
  const item = screen.getByText('Bolsa T4').closest('td')!
  expect(item.className).toContain('sticky')
  expect(item.style.left).toBe('0px')
  // ROI é a última sticky-right → cola em right:0; Lucro fica deslocada pela largura da ROI.
  const roi = screen.getAllByText('10%')[0]!.closest('td')!
  const lucro = screen.getByText('120').closest('td')!
  expect(roi.style.right).toBe('0px')
  expect(lucro.style.right).toBe('calc(5rem)')
})

test('linhas têm a densidade da §1 (h-11, px-3)', () => {
  render(
    <OpportunityTable
      title="x"
      description="y"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.item}
    />,
  )
  const cell = screen.getByText('Bolsa T4').closest('td')!
  expect(cell.className).toContain('h-11')
  expect(cell.className).toContain('px-3')
  expect(cell.className).not.toContain('p-4')
})

test('loading mostra o skeleton no formato da tabela, não as linhas', () => {
  render(
    <OpportunityTable
      title="x"
      description="y"
      rows={[]}
      columns={columns}
      rowKey={(row) => row.item}
      loading
    />,
  )
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText('…')).toBeInTheDocument() // contagem não finge um número
})
