import type { Cidade } from '@/lib/locations'

/**
 * Decisões puras da tela do scanner, fora do componente.
 *
 * Moram aqui e não em `ScannerPage.tsx` porque arquivo de componente que também exporta função
 * perde o *fast refresh* do Vite (`react-refresh/only-export-components`): cada edição recarregaria
 * a tela inteira em vez de trocar só o componente. E, como funções puras, são testáveis sem montar
 * a página — que precisaria de catálogo, snapshot e Worker de mentira.
 */

/**
 * **Recalcular não é carregar.** Trocar a tabela pelo estado de carregando a cada recálculo
 * perde a rolagem, fecha a linha aberta e — com 2,7 s de cálculo no craft — lê como travamento.
 * Só a primeira carga esconde a tabela; depois dela, as linhas do cenário anterior continuam
 * sendo a melhor informação que existe até a conta nova chegar.
 */
export function estadoDaTela({
  dadosCarregando,
  calculando,
  temLinhas,
}: {
  dadosCarregando: boolean
  calculando: boolean
  temLinhas: boolean
}): 'carregando' | 'recalculando' | 'pronto' {
  if (dadosCarregando) return 'carregando'
  // Sem nenhuma linha ainda, mostrar a tabela escreveria "0 linhas" — uma afirmação sobre o
  // mercado que a conta inacabada não autoriza.
  if (calculando) return temLinhas ? 'recalculando' : 'carregando'
  return 'pronto'
}

/**
 * As cidades que disputam a melhor venda. Nenhuma marcada = todas. Cidade da URL que não existe
 * mais é ignorada; se nenhuma marcada sobreviver, vale todas — uma tabela vazia sem nada na tela
 * explicando por quê seria pior que ignorar um link velho.
 */
export function cidadesDeVendaPara(
  marcadas: readonly string[],
  cidades: readonly Cidade[],
): string[] {
  const validas = cidades.filter((c) => marcadas.includes(c.id)).map((c) => c.id)
  return validas.length > 0 ? validas : cidades.map((c) => c.id)
}
