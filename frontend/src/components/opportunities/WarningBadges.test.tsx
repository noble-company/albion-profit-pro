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
      warnings={['ordem_nao_garantida', 'profundidade_insuficiente']}
    />,
  )
  expect(screen.getByText('Ordem não garantida')).toBeInTheDocument()
  expect(screen.getByText('Profundidade insuficiente')).toBeInTheDocument()
  // ...e esses textos vêm de fato do vocabulário da task 14, não de um literal local:
  expect(WARNING_LABELS['ordem_nao_garantida']).toBe('Ordem não garantida')
  expect(WARNING_LABELS['profundidade_insuficiente']).toBe(
    'Profundidade insuficiente',
  )
})

test('aviso desconhecido cai no próprio identificador', () => {
  render(<WarningBadges warnings={['algo_novo_do_backend']} />)
  expect(screen.getByText('algo_novo_do_backend')).toBeInTheDocument()
})
