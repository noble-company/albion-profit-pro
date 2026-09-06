import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { RankingCoverage } from './RankingCoverage'

test('mostra a razão de cobertura e o aviso de estimativa (W6)', () => {
  render(
    <RankingCoverage
      coverage={{
        priced_recipes: 4100,
        evaluated_recipes: 5600,
        total_recipes: 5623,
        computed_at: new Date().toISOString(),
        stale: false,
      }}
    />,
  )
  expect(
    screen.getByText(/4\.100 receitas com preço · 5\.600 avaliadas de 5\.623/),
  ).toBeInTheDocument()
  expect(screen.getByText(/Ranking recalculado/)).toBeInTheDocument()
  expect(
    screen.getByText(/Valores da lista são estimativa/),
  ).toBeInTheDocument()
})

test('ranking desatualizado usa o tom de atenção e o rótulo', () => {
  const { container } = render(
    <RankingCoverage
      coverage={{
        priced_recipes: 10,
        evaluated_recipes: 20,
        total_recipes: 30,
        computed_at: null,
        stale: true,
      }}
    />,
  )
  expect(container.firstElementChild?.className).toContain('text-warning')
  expect(screen.getByText(/Ranking ainda não calculado/)).toBeInTheDocument()
  expect(screen.getByText(/desatualizado/)).toBeInTheDocument()
})
