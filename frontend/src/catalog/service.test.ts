import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'

import { server } from '@/test/msw/server'

import { getRecipeCatalog } from './service'

/**
 * Reportado no uso da task 4/21: o campo novo do catálogo (`shop_subcategory2`) entrou, a API
 * reiniciou, o F5 veio — e o seletor do refino continuou mostrando "Outros (110)".
 *
 * O servidor manda `Cache-Control: private, max-age=300`. Dentro desses 5 minutos o navegador
 * devolve o corpo guardado **sem perguntar ao servidor**, então o `ETag` novo (que já muda com o
 * formato, desde a task 4/17) nunca chegava a ser comparado. A revalidação pede `no-cache`: sempre
 * condicional, 304 barato quando nada mudou — e a tela continua abrindo pelo IndexedDB.
 */
test('a revalidação do catálogo sempre pergunta ao servidor, mesmo dentro do max-age', async () => {
  let modo: RequestCache | undefined
  server.use(
    http.get('*/catalog/recipes', ({ request }) => {
      modo = request.cache
      return HttpResponse.json({ version: 'v1', kind: 'refining', items: [], recipes: [] })
    }),
  )

  await getRecipeCatalog('refining')

  expect(modo).toBe('no-cache')
})
