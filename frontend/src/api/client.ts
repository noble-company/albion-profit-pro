import createClient from 'openapi-fetch'

import type { paths } from './schema'
import { errorFromResponse, normalizeRequestError } from './errors'
import { getAccessToken, notifyUnauthorized } from './session'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const apiClient = createClient<paths>({ baseUrl })

apiClient.use({
  onRequest({ request }) {
    const token = getAccessToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  async onResponse({ response }) {
    if (response.ok) return response
    const error = await errorFromResponse(response)
    if (response.status === 401) notifyUnauthorized()
    throw error
  },
})

export async function safeApiCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw normalizeRequestError(error)
  }
}
