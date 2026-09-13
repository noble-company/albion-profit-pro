/**
 * O custo de foco que o jogador **realmente** paga (task 4/17).
 *
 * `crafting_focus` vem do `ITEM DUMP.json` e é o custo de quem nunca especializou nada. O
 * Painel do Destino reduz esse custo, e muito: com o refino maxado o jogo cobra **6,25%** do
 * valor do dump. A coluna `Lucro/foco` — a métrica que decide o dia de quem refina, porque foco
 * é o recurso escasso — errava por até 16× para o jogador especializado.
 *
 *     custo = base × 0,5 ^ (FCE / 10000)
 *
 * Cada **10.000 pontos de eficiência (FCE) divide o custo pela metade**. Cada nó do painel dá
 * dois tipos de ponto por nível:
 *
 * - **amplo** — vale para tudo o que o ramo cobre;
 * - **específico** — vale só para o item daquele nó, e é sempre muito maior.
 *
 * É essa forma que produz o "um pouco nos outros, muito no específico" do jogo. Confirmado no
 * painel do usuário: `Tecelão de Fibras Adepto` no nível 100 anuncia `+3.000 ao refinar fibras`
 * (100 × 30) e `+25.000 ao refinar Cânhamo` (100 × 250).
 *
 * **Só refino por enquanto.** O craft usa a mesma fórmula, mas a árvore tem outra forma (um nó
 * por linha de item, com os tiers desbloqueando dentro dele) e coeficientes por tipo de nó
 * (normal 30, artefato 15, cristal 2,15). O modelo de dados já comporta; ver a spec da task 17.
 */

/** Um nó de refino dá isto ao **ramo inteiro**, por nível. */
const AMPLO_POR_NIVEL = 30

/** E isto ao **próprio tier**, por nível. */
const ESPECIFICO_POR_NIVEL = 250

/** Cada 10.000 pontos divide o custo pela metade. */
const PONTOS_PARA_METADE = 10_000

/** Tiers com nó de refino no painel. Abaixo de T4 não existe especialização. */
export const TIERS_DE_REFINO = [4, 5, 6, 7, 8] as const

/**
 * Os cinco ramos de refino, na grafia do jogo — são as `@craftingcategory` dos **produtos
 * refinados** no dump: `T5_CLOTH` é `fiber`, `T5_METALBAR` é `ore`. Por isso a chave do nó sai
 * do dado e não de um mapa escrito à mão, que apodreceria no primeiro patch.
 */
export const RAMOS_DE_REFINO = ['fiber', 'hide', 'ore', 'wood', 'rock'] as const

export type RamoDeRefino = (typeof RAMOS_DE_REFINO)[number]

/** `node_key` → nível (0–100). Nó ausente é nível zero. */
export type DestinyBoard = Map<string, number>

/**
 * A chave é opaca para o servidor de propósito: quem conhece a forma da árvore é o cliente, e
 * ela não é uniforme (refino é por tier, craft é por linha).
 */
export function refineNodeKey(ramo: string, tier: number): string {
  return `refine:${ramo}:${tier}`
}

function nivel(board: DestinyBoard, key: string): number {
  const valor = board.get(key)
  return valor === undefined || !Number.isFinite(valor) ? 0 : valor
}

/**
 * Eficiência acumulada ao refinar um tier de um ramo: o amplo de **todos** os tiers daquele
 * ramo, mais o específico do tier que está sendo refinado.
 */
export function refiningEfficiency(
  ramo: string,
  tier: number,
  board: DestinyBoard,
): number {
  let amplo = 0
  for (const outro of TIERS_DE_REFINO) {
    amplo += nivel(board, refineNodeKey(ramo, outro)) * AMPLO_POR_NIVEL
  }
  return amplo + nivel(board, refineNodeKey(ramo, tier)) * ESPECIFICO_POR_NIVEL
}

/**
 * O custo de foco com a eficiência aplicada.
 *
 * Não usa `decimal.js`: foco não é dinheiro. A regra `F09` existe porque silver precisa bater
 * string a string com o servidor; foco é um número de exibição, e a base da conta é uma
 * potência não-decimal (`0,5^x`) que Decimal também aproximaria.
 */
export function focusCostFor(baseFocus: number, efficiency: number): number {
  if (efficiency <= 0) return baseFocus
  return baseFocus * Math.pow(0.5, efficiency / PONTOS_PARA_METADE)
}
