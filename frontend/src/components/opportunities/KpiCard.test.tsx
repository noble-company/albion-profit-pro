import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { KpiCard } from './KpiCard'

test('mostra rótulo e valor', () => {
  render(<KpiCard label="Lucro na página" value="1.234 silver" tone="profit" />)
  expect(screen.getByText('Lucro na página')).toBeInTheDocument()
  expect(screen.getByText('1.234 silver')).toBeInTheDocument()
})

test('o tom escolhe a cor semântica, não um nome de cor cru', () => {
  const { container } = render(
    <KpiCard label="Ofertas" value="12" tone="primary" />,
  )
  const article = container.querySelector('article')
  expect(article?.className).toContain('text-primary')
  expect(article?.className).not.toMatch(/amber|emerald|sky/)
})
