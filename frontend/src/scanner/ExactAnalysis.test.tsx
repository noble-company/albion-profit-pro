import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'

import { money } from '@/lib/money'
import { createTestQueryClient, wrapperWithQueryClient } from '@/test/queryTestClient'
import { server } from '@/test/msw/server'

import { ExactAnalysis } from './ExactAnalysis'
import type { CraftRequest } from '@/craft/service'

/**
 * Task 4/11.5. A análise exata existe para **discordar** da estimativa quando o livro é raso.
 * Os testes aqui cuidam de que ela discorde do jeito certo: comparando o mesmo cenário, e
 * dizendo que a estimativa continua de pé quando a chamada falha.
 */

const REQUEST: CraftRequest = {
  server: 'west',
  output_item: 'T4_CLOTH',
  location_id: '1002',
  quantity: 100,
  output_quality: 1,
  scope: 'all',
  return_rate: '0',
  station_cost_per_execution: '0',
  use_focus: false,
  premium: true,
}

function cenario(
  acquisition: string,
  sale: string,
  profit: string,
  warnings: string[] = [],
) {
  return {
    acquisition_mode: acquisition,
    sale_mode: sale,
    costs: {
      ingredient_cost: '0',
      recipe_silver_cost: '0',
      station_cost: '0',
      upgrade_cost: '0',
      acquisition_setup_fee: '0',
      total_cost: '0',
    },
    revenue: {},
    profit,
    profit_per_unit: null,
    roi: null,
    warnings,
  }
}

function montar(cenarios: unknown[], estimativa = '1000') {
  server.use(
    http.post('http://localhost:8000/craft/simulate', () =>
      HttpResponse.json({
        server: 'west',
        output_item: 'T4_CLOTH',
        location_id: '1002',
        output_quality: 1,
        scope: 'all',
        requested_quantity: 100,
        executions: 100,
        produced_quantity: 100,
        surplus_quantity: 0,
        return_rate: '0',
        focus_consumed: 0,
        premium: true,
        sales_tax_rate: '0.04',
        setup_fee_rate: '0.025',
        recipe: {},
        ingredients: [],
        output_quotes: {},
        scenarios: cenarios,
      }),
    ),
  )

  return render(
    <ExactAnalysis
      request={REQUEST}
      estimativa={money(estimativa)}
      acquisitionMode="buy_order"
      saleMode="sell_order"
    />,
    { wrapper: wrapperWithQueryClient(createTestQueryClient()) },
  )
}

test('compara o MESMO cenário da linha, não o mais lucrativo do exato', async () => {
  // Pegar o melhor cenário do exato compararia laranja com maçã: a estimativa de um caminho
  // contra o número de outro, e a "diferença" seria pura ficção.
  const user = userEvent.setup()
  montar([
    cenario('immediate', 'immediate', '5000'), // mais lucrativo, mas NÃO é o da linha
    cenario('buy_order', 'sell_order', '700'),
  ])

  await user.click(screen.getByRole('button', { name: 'Analisar com o livro real' }))

  expect(await screen.findByText('700 silver')).toBeInTheDocument()
  // 700 exato contra 1.000 estimados: o livro raso custa 300.
  expect(screen.getByText('-300 silver')).toBeInTheDocument()
  expect(screen.queryByText('5.000 silver')).not.toBeInTheDocument()
})

test('os avisos do servidor aparecem — é neles que mora a razão da diferença', async () => {
  const user = userEvent.setup()
  montar([cenario('buy_order', 'sell_order', '700', ['profundidade_insuficiente'])])

  await user.click(screen.getByRole('button', { name: 'Analisar com o livro real' }))

  expect(await screen.findByText('Profundidade insuficiente')).toBeInTheDocument()
})

test('falha na chamada não invalida a estimativa, e a tela diz isso', async () => {
  const user = userEvent.setup()
  server.use(
    http.post('http://localhost:8000/craft/simulate', () =>
      HttpResponse.json({ detail: 'erro' }, { status: 500 }),
    ),
  )

  render(
    <ExactAnalysis
      request={REQUEST}
      estimativa={money('1000')}
      acquisitionMode="buy_order"
      saleMode="sell_order"
    />,
    { wrapper: wrapperWithQueryClient(createTestQueryClient()) },
  )

  await user.click(screen.getByRole('button', { name: 'Analisar com o livro real' }))

  expect(
    await screen.findByText(/A estimativa acima continua válida/),
  ).toBeInTheDocument()
})

test('cenário que o livro real não sustenta é dito, não escondido', async () => {
  const user = userEvent.setup()
  montar([cenario('immediate', 'immediate', '5000')]) // o da linha não veio

  await user.click(screen.getByRole('button', { name: 'Analisar com o livro real' }))

  expect(
    await screen.findByText(/não sustenta este cenário na quantidade pedida/),
  ).toBeInTheDocument()
})
