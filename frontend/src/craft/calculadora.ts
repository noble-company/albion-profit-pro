import type { RecipeCatalog } from '@/catalog/service'
import { compare } from '@/lib/money'
import type { ScannerRow } from '@/scanner/engine'

/**
 * O que é só da Calculadora (task 4/14).
 *
 * Ela é o scanner com uma receita só: o mesmo engine, os mesmos parâmetros de URL, o mesmo painel
 * de detalhe. O que muda é a pergunta — não "o que vale a pena", mas "onde vale a pena **isto**" —
 * e as três decisões abaixo são o que responde a ela.
 */

export interface ReceitaEncontrada {
  kind: 'refining' | 'crafting'
  catalog: RecipeCatalog
}

/**
 * O catálogo onde mora a receita do item. Refino e craft são catálogos separados (task 02), e o
 * autocomplete oferece os dois. Catálogo que ainda não chegou não é "item sem receita".
 */
export function receitaDoItem(
  item: string,
  refino: RecipeCatalog | null,
  craft: RecipeCatalog | null,
): ReceitaEncontrada | null {
  if (!item) return null
  if (refino?.recipes.some((receita) => receita.output_item === item)) {
    return { kind: 'refining', catalog: refino }
  }
  if (craft?.recipes.some((receita) => receita.output_item === item)) {
    return { kind: 'crafting', catalog: craft }
  }
  return null
}

/**
 * As cidades na ordem do lucro. Cidade sem preço vai para o fim **e continua na lista**, com o
 * motivo: sumir com ela diria que ali não se vende, quando só não se sabe (`X01`).
 */
export function linhasPorLucro(rows: readonly ScannerRow[]): ScannerRow[] {
  const comPreco = rows
    .filter((row) => row.profit !== null)
    .sort((a, b) => compare(b.profit!, a.profit!))
  return [...comPreco, ...rows.filter((row) => row.profit === null)]
}

/**
 * A cidade do detalhe: a que o jogador clicou, ou a melhor. Uma escolha que saiu de Vender em
 * volta para a melhor, em vez de deixar o detalhe apontando para uma cidade fora da conta.
 */
export function linhaEscolhida(
  rows: readonly ScannerRow[],
  locationId: string | null,
): ScannerRow | null {
  return rows.find((row) => row.locationId === locationId) ?? rows[0] ?? null
}
