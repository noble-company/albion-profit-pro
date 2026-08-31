export type ApiErrorKind = 'http' | 'network' | 'aborted'

export type ApiErrorDetail = string | Array<Record<string, unknown>> | null

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  readonly detail: ApiErrorDetail
  readonly retryable: boolean

  constructor(
    message: string,
    options: {
      kind: ApiErrorKind
      status?: number
      detail?: ApiErrorDetail
      cause?: unknown
    },
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = options.kind
    this.status = options.status
    this.detail = options.detail ?? null
    this.retryable =
      options.kind === 'network' ||
      options.kind === 'aborted' ||
      (options.status !== undefined &&
        [408, 425, 429, 500, 502, 503, 504].includes(options.status))
  }
}

export function normalizeDetail(value: unknown): ApiErrorDetail {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null,
    )
  }
  return null
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  let detail: ApiErrorDetail = null
  try {
    const payload: unknown = await response.clone().json()
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'detail' in payload
    ) {
      detail = normalizeDetail(payload.detail)
    }
  } catch {
    // Non-JSON errors are still represented by their HTTP status.
  }

  const suffix = typeof detail === 'string' ? `: ${detail}` : ''
  return new ApiError(`Erro HTTP ${response.status}${suffix}`, {
    kind: 'http',
    status: response.status,
    detail,
  })
}

export function normalizeRequestError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('Requisição cancelada', {
      kind: 'aborted',
      cause: error,
    })
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new ApiError('Requisição cancelada', {
      kind: 'aborted',
      cause: error,
    })
  }
  return new ApiError('Falha de rede ao comunicar com a API', {
    kind: 'network',
    cause: error,
  })
}

export function isRetryableApiError(error: unknown): boolean {
  return error instanceof ApiError && error.retryable
}
