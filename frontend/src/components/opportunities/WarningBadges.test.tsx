import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { WARNING_LABELS } from '@/design/confidence'

import { WarningBadges } from './WarningBadges'

test('não renderiza nada sem avisos', () => {
  const { container } = render(<WarningBadges warnings={[]} />)
  expect(container).toBeEmptyDOMElement()
  const nullCase = render(<WarningBadges warnings={null} />)
  expect(nullCase.container).toBeEmptyDOMElement()
})

test('usa o vocabulário de confiança da task 14, não um mapa local', () => {
  render(
    <WarningBadges
      warnings={['order_not_guaranteed', 'insufficient_depth']}
    />,
  )
  expect(screen.getByText('Ordem não garantida')).toBeInTheDocument()
  expect(screen.getByText('Profundidade insuficiente')).toBeInTheDocument()
  // ...e esses textos vêm de fato do vocabulário da task 14, não de um literal local:
  expect(WARNING_LABELS['order_not_guaranteed']).toBe('Ordem não garantida')
  expect(WARNING_LABELS['insufficient_depth']).toBe(
    'Profundidade insuficiente',
  )
})

test('aviso desconhecido cai no próprio identificador', () => {
  render(<WarningBadges warnings={['algo_novo_do_backend']} />)
  expect(screen.getByText('algo_novo_do_backend')).toBeInTheDocument()
})

test('modo compacto mantém o texto acessível e usa o rótulo no hover', () => {
  render(<WarningBadges warnings={['stale_data']} compact />)
  const label = screen.getByText('Preço desatualizado')
  expect(label).toHaveClass('sr-only')
  expect(label.parentElement).toHaveAttribute('title', 'Preço desatualizado')
})
