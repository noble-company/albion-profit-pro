import { formatarIdade } from '@/lib/formatters'
import type { Cidade } from '@/lib/locations'

import type { ScannerRow } from './engine'
import type { PricingPolicy } from './pricing'

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
 * As cidades de um filtro — Vender em ou Comprar em (task 24). Nenhuma marcada = todas. Cidade da URL que não existe
 * mais é ignorada; se nenhuma marcada sobreviver, vale todas — uma tabela vazia sem nada na tela
 * explicando por quê seria pior que ignorar um link velho.
 */
export function cidadesFiltradas(
  marcadas: readonly string[],
  cidades: readonly Cidade[],
): string[] {
  const validas = cidades.filter((c) => marcadas.includes(c.id)).map((c) => c.id)
  return validas.length > 0 ? validas : cidades.map((c) => c.id)
}

/** Traço, nunca zero. Ausência de preço não é preço zero — é a microcópia da §5 virada em código. */
export const TRACO = '—'

/**
 * Idade de uma cotação para caber numa célula (task 4/20).
 *
 * `null` = preço digitado pelo jogador, que não tem idade — quem chama decide dizer "preço fixo".
 * Data impossível vira traço: foi um `new Date(Infinity).toISOString()` no meio do render que
 * derrubou a tela inteira no ErrorBoundary (task 11). Formatar é apresentação, e apresentação não
 * pode derrubar produto.
 */
export function idadeDaCotacao(observedAt: number | null, agora: Date): string | null {
  if (observedAt === null) return null
  if (!Number.isFinite(observedAt)) return TRACO
  return formatarIdade(new Date(observedAt * 1000).toISOString(), agora)
}

/**
 * Os preços na mão que vão para o "Analisar com o livro real" (task 20, revista no uso).
 *
 * Levava só os ingredientes fixados. A venda fixada ficava de fora, e a análise exata respondia
 * com o livro de venda de verdade — outra pergunta que a da estimativa da linha, que usou o preço
 * declarado. Só a venda **do item analisado** vai: a dos outros itens não é assunto dela.
 */
export function precosNaMaoPara(
  pricing: PricingPolicy,
  outputItem: string,
): Record<string, { offer: string; request: string }> {
  const precos: Record<string, { offer: string; request: string }> = Object.fromEntries(
    [...pricing.manual].map(([item, preco]) => [item, { offer: preco, request: preco }]),
  )
  const venda = pricing.manualSale.get(outputItem)
  if (venda !== undefined && venda !== '') {
    precos[outputItem] = { offer: venda, request: venda }
  }
  return precos
}

/**
 * O "Analisar com o livro real" só existe para venda num mercado (task 24).
 *
 * O livro de ordens é por cidade; a média não é um mercado. Com ela, o botão analisaria uma cidade
 * qualquer, e o número exato responderia outra pergunta que a estimativa da linha. Preço fixo pode:
 * a análise leva o preço declarado (`precosNaMaoPara`).
 */
export function podeAnalisar(row: Pick<ScannerRow, 'profit' | 'saleBasis'>): boolean {
  return row.profit !== null && row.saleBasis !== 'average'
}
