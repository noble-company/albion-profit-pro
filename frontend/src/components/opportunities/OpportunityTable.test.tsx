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
