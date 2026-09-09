import * as money from '@/lib/money'

/**
 * Converte o percentual de retorno que o usuário digita (ex.: `36,7`) na taxa em [0,1] que a
 * camada "e se" consome.
 *
 * Divisão decimal via `@/lib/money` (task 3.6/01, `E01`): `Number(v) / 100` divergia do motor
 * Python — `Decimal('36.7') / 100 == Decimal('0.367')`, mas `36.7 / 100 === 0.367000000000005`.
 * O lixo se propagava por `ranking-projection.ts` até `profit`/`roi`, quebrando o contrato que
 * `F09` e os vetores dourados (task 3.5/23) existem pra garantir.
 *
 * Mantém a normalização de vírgula para ponto e o fallback `'0'` para entrada vazia ou não
 * numérica.
 */
export function percentageToRate(value: string): string {
  if (!value) return '0'
  const normalized = value.replace(',', '.')
  try {
    return money.divide(normalized, 100).toString()
  } catch {
    return '0'
  }
}

/** Filtros "e se" da produção lidos da URL (retorno/estação/foco). Função estável de módulo. */
export function readProductionExtra(params: URLSearchParams) {
  return {
    returnRate: percentageToRate(params.get('return_rate') || '0'),
    stationCostPerExecution: params.get('station_cost') || '0',
    useFocus: params.get('focus') === 'true',
  }
}
