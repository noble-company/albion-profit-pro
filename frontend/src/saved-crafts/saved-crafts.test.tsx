import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'

import { server } from '@/test/msw/server'

import { SavedCraftButton } from './SavedCraftButton'
import {
  createSavedCraft,
  deleteSavedCraft,
  getSavedCrafts,
  savedCraftFromScenario,
  type SavedCraft,
} from './service'

const SAVED: SavedCraft = {
  id: '2df1dc5f-ce9e-4bba-8b61-d432d55d1904',
  server: 'west',
  output_item: 'T4_2H_MACE',
  quantity: 37,
  output_quality: 3,
  created_at: '2026-09-14T12:00:00Z',
  updated_at: '2026-09-14T12:00:00Z',
}

describe('contrato de Meus Crafts', () => {
  test('lista pelo realm, cria com o cenário atual e exclui pelo id', async () => {
    const requests: Array<{ method: string; value: unknown }> = []
    server.use(
      http.get('http://localhost:8000/me/saved-crafts', ({ request }) => {
        requests.push({
          method: 'GET',
          value: new URL(request.url).searchParams.get('server'),
        })
        return HttpResponse.json([SAVED])
      }),
      http.post('http://localhost:8000/me/saved-crafts', async ({ request }) => {
        requests.push({ method: 'POST', value: await request.json() })
        return HttpResponse.json(SAVED, { status: 201 })
      }),
      http.delete(
        'http://localhost:8000/me/saved-crafts/:savedCraftId',
        ({ params }) => {
          requests.push({ method: 'DELETE', value: params.savedCraftId })
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )

    const input = savedCraftFromScenario('west', 'T4_2H_MACE', {
      quantity: 37,
      outputQuality: 3,
    })
    expect(await getSavedCrafts('west')).toEqual([SAVED])
    expect(await createSavedCraft(input)).toEqual(SAVED)
    await deleteSavedCraft(SAVED.id)

    expect(requests).toEqual([
      { method: 'GET', value: 'west' },
      {
        method: 'POST',
        value: {
          server: 'west',
          output_item: 'T4_2H_MACE',
          quantity: 37,
          output_quality: 3,
        },
      },
      { method: 'DELETE', value: SAVED.id },
    ])
  })
})

describe('estrela de Meus Crafts', () => {
  test('salva sem propagar o clique para a linha', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onRowClick = vi.fn()
    render(
      <div onClick={onRowClick}>
        <SavedCraftButton saved={false} pending={false} onSave={onSave} />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Salvar em Meus Crafts' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(onRowClick).not.toHaveBeenCalled()
  })

  test('bloqueia clique duplo enquanto salva e não exibe falso positivo', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<SavedCraftButton saved={false} pending onSave={onSave} />)

    const button = screen.getByRole('button', { name: 'Salvando em Meus Crafts' })
    expect(button).toBeDisabled()
    expect(screen.getByText('Salvando…')).toBeInTheDocument()
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument()
    await user.click(button)
    expect(onSave).not.toHaveBeenCalled()
  })

  test('registro já existente aparece preenchido e desabilitado, sem link morto', () => {
    render(<SavedCraftButton saved pending={false} onSave={vi.fn()} />)

    const button = screen.getByRole('button', {
      name: 'Receita salva em Meus Crafts',
    })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('fill-current')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
