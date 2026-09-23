import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Opportunity } from '@/opportunities/service'
import { ALTURA_DA_LINHA_REM, emEscala } from '@/scanner/altura'

import { OpportunityTable, type OpportunityColumn } from './OpportunityTable'

const rows: Opportunity[] = [
  { kind: 'flip', item: 'T4_BAG', item_name: 'Bolsa T4', quantity: 1, profit: '120' },
  { kind: 'flip', item: 'T5_BAG', item_name: 'Bolsa T5', quantity: 1, profit: '340' },
]

const columns: OpportunityColumn[] = [
  { key: 'item', header: 'Item', width: emEscala(12), cell: (row) => row.item_name },
  {
    key: 'profit',
    header: 'Lucro',
    width: emEscala(7),
    sortField: 'profit',
    numeric: true,
    cell: (row) => row.profit,
  },
]

function table(overrides: Partial<Parameters<typeof OpportunityTable>[0]> = {}) {
  return (
    <OpportunityTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.item}
      sort="profit"
      direction="desc"
      onSortChange={vi.fn()}
      {...overrides}
    />
  )
}

test('renderiza cabeçalhos e as linhas paginadas recebidas', () => {
  render(table())
  expect(screen.getByRole('columnheader', { name: /Item/ })).toBeInTheDocument()
  expect(screen.getByText('Bolsa T4')).toBeInTheDocument()
  expect(screen.getByText('Bolsa T5')).toBeInTheDocument()
  expect(screen.getAllByRole('row')).toHaveLength(3)
})

test('cabeçalho ordenável alterna a direção e delega ao servidor', async () => {
  const user = userEvent.setup()
  const onSortChange = vi.fn()
  render(table({ onSortChange }))

  const header = screen.getByRole('columnheader', { name: /Lucro/ })
  expect(header).toHaveAttribute('aria-sort', 'descending')
  await user.click(within(header).getByRole('button', { name: /Lucro/ }))
  expect(onSortChange).toHaveBeenCalledWith('profit', 'asc')
})

test('campo novo começa pela direção descendente', async () => {
  const user = userEvent.setup()
  const onSortChange = vi.fn()
  const age: OpportunityColumn = {
    key: 'age',
    header: 'Idade',
    width: emEscala(6),
    sortField: 'freshness',
    cell: () => 'agora',
  }
  render(table({ columns: [...columns, age], onSortChange }))
  await user.click(screen.getByRole('button', { name: /Idade/ }))
  expect(onSortChange).toHaveBeenCalledWith('freshness', 'desc')
})

test('coluna numérica alinha à direita com tabular-nums', () => {
  render(table())
  const lucro = screen.getByText('120').closest('td')!
  expect(lucro).toHaveClass('text-right', 'tabular-nums')
})

test('colunas fixas recebem os deslocamentos corretos', () => {
  const fixed: OpportunityColumn[] = [
    { ...columns[0]!, sticky: 'left' },
    { ...columns[1]!, sticky: 'right' },
    {
      key: 'roi',
      header: 'ROI',
      width: emEscala(5),
      sticky: 'right',
      cell: () => '10%',
    },
  ]
  render(table({ columns: fixed }))
  const item = screen.getByText('Bolsa T4').closest('td')!
  const roi = screen.getAllByText('10%')[0]!.closest('td')!
  const lucro = screen.getByText('120').closest('td')!
  expect(item).toHaveClass('sticky')
  expect(item.style.left).toBe('0px')
  expect(roi.style.right).toBe('0px')
  expect(lucro.style.right).toBe(`calc(${emEscala(5)})`)
})

test('altura da linha acompanha o seletor Tamanho', () => {
  render(table())
  const row = screen.getByText('Bolsa T4').closest('tr')!
  expect(row.style.height).toBe(emEscala(ALTURA_DA_LINHA_REM))
})

test('loading mostra o skeleton no formato da tabela', () => {
  render(table({ rows: [], loading: true }))
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})
