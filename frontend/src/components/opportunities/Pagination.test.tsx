import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { Pagination } from './Pagination'

test('não renderiza nada sem resultado', () => {
  const { container } = render(
    <Pagination offset={0} limit={25} total={0} onOffsetChange={vi.fn()} />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('na primeira página o "Anterior" fica desabilitado', () => {
  render(
    <Pagination offset={0} limit={25} total={100} onOffsetChange={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Próxima' })).toBeEnabled()
  expect(screen.getByText('Página 1 de 4')).toBeInTheDocument()
})

test('na última página o "Próxima" fica desabilitado', () => {
  render(
    <Pagination offset={75} limit={25} total={100} onOffsetChange={vi.fn()} />,
  )
  expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled()
  expect(screen.getByText('Página 4 de 4')).toBeInTheDocument()
})

test('avançar/voltar pedem o novo offset — nunca menos que zero', async () => {
  const user = userEvent.setup()
  const onOffsetChange = vi.fn()
  render(
    <Pagination
      offset={25}
      limit={25}
      total={100}
      onOffsetChange={onOffsetChange}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Próxima' }))
  expect(onOffsetChange).toHaveBeenLastCalledWith(50)
  await user.click(screen.getByRole('button', { name: 'Anterior' }))
  expect(onOffsetChange).toHaveBeenLastCalledWith(0)
})
