import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from '@/test/msw/server'
import { searchItems } from './service'

test('busca envia filtros do catálogo e aceita resultado encantado', async () => {
  let received = ''
  server.use(
    http.get('http://localhost:8000/items/search', ({ request }) => {
      received = new URL(request.url).search
      return HttpResponse.json([
        {
          unique_name: 'T4_CLOTH@2',
          albion_id: 1,
          name_pt: 'Pano',
          name_en: 'Cloth',
          tier: 4,
          enchantment_level: 2,
          shop_category: 'recurso',
          shop_subcategory: null,
          tem_receita: false,
        },
      ])
    }),
  )
  const result = await searchItems(
    'T4_CLOTH',
    { tier: 4, enchantment_level: 2, apenas_craftaveis: false },
    new AbortController().signal,
  )
  expect(result[0]?.unique_name).toBe('T4_CLOTH@2')
  expect(received).toContain('tier=4')
  expect(received).toContain('enchantment_level=2')
})
