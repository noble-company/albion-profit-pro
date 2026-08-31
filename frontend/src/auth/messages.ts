import { ApiError } from '@/api/errors'

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Não foi possível comunicar com a API.'
  if (error.status === 429)
    return 'Muitas tentativas. Aguarde um minuto e tente novamente.'
  if (error.detail === 'REGISTER_USER_ALREADY_EXISTS')
    return 'Este e-mail já está cadastrado.'
  if (error.detail === 'REGISTER_INVALID_PASSWORD')
    return 'A senha foi rejeitada pelo backend.'
  if (error.status === 400 || error.status === 401)
    return 'E-mail ou senha inválidos.'
  if (error.kind === 'aborted') return 'A requisição foi cancelada.'
  return 'Não foi possível concluir a autenticação.'
}
