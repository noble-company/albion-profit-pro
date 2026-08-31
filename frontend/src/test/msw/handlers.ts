import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('http://localhost:8000/health', () =>
    HttpResponse.json({ status: 'ok' }),
  ),
]
