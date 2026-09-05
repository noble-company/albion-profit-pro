import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import {
  FilterNumber,
  FilterPanel,
  FilterSelect,
  FilterSortSelect,
  FilterToggle,
} from './FilterPanel'

test('FilterPanel mostra título/descrição e dispara onClear', async () => {
  const user = userEvent.setup()
  const onClear = vi.fn()
  render(
    <FilterPanel
      title="Configure"
      description="Ajuste os filtros"
      onClear={onClear}
    >
      <p>conteúdo</p>
    </FilterPanel>,
  )
  expect(screen.getByRole('heading', { name: 'Configure' })).toBeInTheDocument()
  expect(screen.getByText('Ajuste os filtros')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
  expect(onClear).toHaveBeenCalledTimes(1)
})

test('FilterSelect emite o valor escolhido; usa labels quando dados', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <FilterSelect
      label="Qualidade"
      value=""
      onChange={onChange}
      options={['1', '2']}
      labels={['Normal', 'Bom']}
    />,
  )
  expect(screen.getByRole('option', { name: 'Normal' })).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Qualidade'), '2')
  expect(onChange).toHaveBeenCalledWith('2')
})

test('FilterSelect aplica sufixo quando não há labels', () => {
  render(
    <FilterSelect
      label="Frescor máximo"
      value=""
      onChange={vi.fn()}
      options={['6', '12']}
      suffix="h"
    />,
  )
  expect(screen.getByRole('option', { name: '12h' })).toBeInTheDocument()
})

test('FilterToggle reflete o estado e emite o novo valor', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <FilterToggle
      label="Conta Premium"
      description="Imposto reduzido"
      checked={false}
      onChange={onChange}
    />,
  )
  const toggle = screen.getByRole('switch')
  expect(toggle).not.toBeChecked()
  await user.click(toggle)
  expect(onChange).toHaveBeenCalledWith(true)
})

test('FilterNumber propaga o texto digitado', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <FilterNumber
      label="Lucro mínimo"
      value=""
      onChange={onChange}
      placeholder="0"
    />,
  )
  await user.type(screen.getByLabelText('Lucro mínimo'), '5')
  expect(onChange).toHaveBeenLastCalledWith('5')
})

test('FilterSortSelect lista as seis ordens e emite a seleção', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<FilterSortSelect value="profit_desc" onChange={onChange} />)
  const select = screen.getByLabelText('Ordenar por')
  expect(select.querySelectorAll('option')).toHaveLength(6)
  await user.selectOptions(select, 'roi_asc')
  expect(onChange).toHaveBeenCalledWith('roi_asc')
})
