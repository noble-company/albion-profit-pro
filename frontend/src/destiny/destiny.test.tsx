import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/test/render'
import { server } from '@/test/msw/server'

import { DestinyBoardPage } from './DestinyBoardPage'

/**
 * Task 4/17. O que importa aqui: a tela mostra o **efeito** do nível, e nada do que se digita
 * chega ao scanner antes de salvar — o número da tabela tem que refletir o painel guardado, não
 * um rascunho.
 */

function montarApi(nodes: Record<string, number> = {}) {
  const salvos: Record<string, number>[] = []
  server.use(
    http.get('http://localhost:8000/me/destiny-board', () =>
      HttpResponse.json({ nodes }),
    ),
    http.put('http://localhost:8000/me/destiny-board', async ({ request }) => {
      const body = (await request.json()) as { nodes: Record<string, number> }
      salvos.push(body.nodes)
      return HttpResponse.json({ nodes: body.nodes })
    }),
  )
  return salvos
}

test('mostra quanto do foco sobra, e não só o nível', async () => {
  // É o que separa "formulário" de "resposta": com fibra T4 em 100, refinar tecido T4 passa a
  // custar 14,4% do foco base — e o jogador vê isso na célula que ele acabou de preencher.
  montarApi({ 'refine:fiber:4': 100 })
  renderWithProviders(<DestinyBoardPage />)

  await waitFor(() =>
    expect(screen.getByLabelText('Fibra → Tecido T4')).toHaveValue('100'),
  )
  expect(screen.getByText('14.4% do foco')).toBeInTheDocument()
})

test('digitar não salva — o scanner só usa o que foi salvo', async () => {
  const user = userEvent.setup()
  const salvos = montarApi()
  renderWithProviders(<DestinyBoardPage />)

  await user.type(await screen.findByLabelText('Minério → Barra T6'), '40')

  expect(salvos).toHaveLength(0)
  expect(
    screen.getByText(/Alterações ainda não salvas/),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Salvar painel' }))

  await waitFor(() => expect(salvos).toEqual([{ 'refine:ore:6': 40 }]))
})

test('nível zerado some do painel em vez de virar zero gravado', async () => {
  const user = userEvent.setup()
  const salvos = montarApi({ 'refine:wood:5': 30 })
  renderWithProviders(<DestinyBoardPage />)

  const campo = await screen.findByLabelText('Madeira → Tábua T5')
  await waitFor(() => expect(campo).toHaveValue('30'))
  await user.clear(campo)
  await user.click(screen.getByRole('button', { name: 'Salvar painel' }))

  await waitFor(() => expect(salvos).toEqual([{}]))
})

test('valor fora da faixa é contido na entrada, não no servidor', async () => {
  // O painel do jogo vai até 100. Deixar 500 chegar ao engine daria um custo de foco que o
  // jogador não consegue reproduzir em lugar nenhum.
  const user = userEvent.setup()
  montarApi()
  renderWithProviders(<DestinyBoardPage />)

  const campo = await screen.findByLabelText('Fibra → Tecido T8')
  await user.type(campo, '500')

  expect(campo).toHaveValue('100')
})

test('falha ao salvar não apaga o que o jogador digitou', async () => {
  const user = userEvent.setup()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  server.use(
    http.get('http://localhost:8000/me/destiny-board', () => HttpResponse.json({ nodes: {} })),
    http.put('http://localhost:8000/me/destiny-board', () =>
      HttpResponse.json({ detail: 'erro' }, { status: 500 }),
    ),
  )
  renderWithProviders(<DestinyBoardPage />)

  await user.type(await screen.findByLabelText('Pedra → Bloco T7'), '77')
  await user.click(screen.getByRole('button', { name: 'Salvar painel' }))

  expect(await screen.findByText(/Não deu para salvar/)).toBeInTheDocument()
  expect(screen.getByLabelText('Pedra → Bloco T7')).toHaveValue('77')
  consoleError.mockRestore()
})

test('cada categoria é uma seção que abre e fecha', async () => {
  // Com 44 ramos no painel do jogo, uma lista plana vira rolagem infinita. A seção também é
  // o que deixa a tela crescer sem reescrita quando o craft entrar (task 12).
  const user = userEvent.setup()
  montarApi({ 'refine:fiber:4': 100 })
  renderWithProviders(<DestinyBoardPage />)

  const secao = await screen.findByRole('button', { name: /Refino/ })
  expect(secao).toHaveAttribute('aria-expanded', 'true')

  await user.click(secao)

  expect(secao).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByLabelText('Fibra → Tecido T4')).not.toBeInTheDocument()
})

test('a seção diz quantos nós já foram preenchidos, sem precisar abrir', async () => {
  // Fechada, a seção ainda precisa responder "eu já mexi aqui?" — senão o jogador abre uma por
  // uma para descobrir.
  montarApi({ 'refine:fiber:4': 100, 'refine:ore:7': 20 })
  renderWithProviders(<DestinyBoardPage />)

  expect(await screen.findByText('2 de 25 preenchidos')).toBeInTheDocument()
})
