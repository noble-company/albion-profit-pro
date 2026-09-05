import { http, HttpResponse } from 'msw'

import { requireBearer } from './auth'

export const handlers = [
  http.get('http://localhost:8000/health', () =>
    HttpResponse.json({ status: 'ok' }),
  ),
  // Rotas autenticadas que várias telas pedem de fundo (via useCategories/useLocations).
  // Defaults benignos e guardados por Authorization — um teste que precise de conteúdo
  // sobrescreve com server.use(). (task 3.5/16, item 4.)
  http.get(
    'http://localhost:8000/items/categories',
    ({ request }) => requireBearer(request) ?? HttpResponse.json([]),
  ),
  http.get(
    'http://localhost:8000/locations',
    ({ request }) => requireBearer(request) ?? HttpResponse.json([]),
  ),
]
