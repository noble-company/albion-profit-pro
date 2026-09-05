/**
 * task 3.5/16: um handler MSW de rota autenticada precisa checar `Authorization: Bearer
 * <token>` de verdade — senão a suíte mente (um teste verde escondendo um 401 de produção).
 * Devolve a resposta 401 quando o header está ausente/malformado, ou `undefined` quando
 * pode seguir.
 */
export function requireBearer(request: Request): Response | undefined {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return new Response(null, { status: 401 })
  return undefined
}
