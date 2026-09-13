import { describe, expect, test } from 'vitest'

import { money } from '@/lib/money'

import type { ScannerRow } from './engine'
import { DEFAULT_SORT, sortRows } from './sorting'

/**
 * Task 4/10. A regra que carrega peso aqui é: **linha sem preço vai sempre para o fim, nas duas
 * direções** — quando o campo ordenado é um número calculado. Ausência não é "o pior resultado";
 * ordená-la junto com número inventaria uma posição que o dado não sustenta.
 *
 * Task 4/19. A exceção é a ordem **estrutural** (tier, encantamento, nome): ali a posição não
 * depende de preço, e mandar `Couro T4.2` sem cotação para depois do T8 quebraria justamente a
 * leitura "como o mercado do jogo" que a ordem existe para dar.
 */

function row(nome: string, profit: string | null, extra: Partial<ScannerRow> = {}) {
  return {
    outputItem: nome,
    locationId: '1002',
    productionKind: 'refining',
    state: profit === null ? 'missing_output_price' : 'priced',
    profit: profit === null ? null : money(profit),
    roi: profit === null ? null : money(profit),
    profitPerWeight: null,
    profitPerFocus: null,
    totalCost: null,
    oldestObservedAt: profit === null ? null : 1_757_000_000,
    ingredients: [],
    tier: null,
    enchantmentLevel: 0,
    ...extra,
  } as ScannerRow
}

describe('sortRows', () => {
  test('padrão é tier crescente — a lista se lê como o mercado do jogo', () => {
    expect(DEFAULT_SORT).toEqual({ field: 'tier', direction: 'asc' })
  })

  test('tier ordena por tier, depois encantamento', () => {
    // Os códigos estão escolhidos para a ordem ALFABÉTICA contradizer a de encantamento
    // (`T4_A@2` < `T4_M@1` < `T4_Z`). A primeira versão deste teste usava `T4_CLOTH`,
    // `T4_CLOTH_LEVEL1@1`… e passava contra o código antigo: o desempate por código coincidia
    // com o encantamento, e o teste não distinguia nada.
    const linhas = [
      row('T5_B', '1', { tier: 5, enchantmentLevel: 0 }),
      row('T4_A@2', '1', { tier: 4, enchantmentLevel: 2 }),
      row('T2_Y', '1', { tier: 2, enchantmentLevel: 0 }),
      row('T4_Z', '1', { tier: 4, enchantmentLevel: 0 }),
      row('T4_M@1', '1', { tier: 4, enchantmentLevel: 1 }),
      row('T3_X', '1', { tier: 3, enchantmentLevel: 0 }),
    ]
    expect(
      sortRows(linhas, { field: 'tier', direction: 'asc' }).map((r) => r.outputItem),
    ).toEqual(['T2_Y', 'T3_X', 'T4_Z', 'T4_M@1', 'T4_A@2', 'T5_B'])
  })

  test('no mesmo tier.encanto, desempata pelo NOME EXIBIDO, não pelo código', () => {
    // Pelo código, `T4_A` viria antes de `T4_B`. Pelo nome que o jogador lê, é o contrário —
    // e é o nome que ele lê que define "ordem alfabética".
    const nomes: Record<string, string> = { T4_A: 'Tábua T4', T4_B: 'Couro T4' }
    const linhas = [
      row('T4_A', '1', { tier: 4, enchantmentLevel: 0 }),
      row('T4_B', '1', { tier: 4, enchantmentLevel: 0 }),
    ]
    expect(
      sortRows(linhas, { field: 'tier', direction: 'asc' }, (u) => nomes[u] ?? u).map(
        (r) => r.outputItem,
      ),
    ).toEqual(['T4_B', 'T4_A'])
  })

  test('em ordem de tier, linha sem preço fica na posição do tier dela', () => {
    const linhas = [
      row('T5', '10', { tier: 5 }),
      row('T4_SEM_PRECO', null, { tier: 4 }),
      row('T3', '10', { tier: 3 }),
    ]
    expect(
      sortRows(linhas, { field: 'tier', direction: 'asc' }).map((r) => r.outputItem),
    ).toEqual(['T3', 'T4_SEM_PRECO', 'T5'])
  })

  test('em ordem de lucro, a mesma linha sem preço continua indo para o fim', () => {
    // O par do teste acima: a exceção é da ordem estrutural, não uma regra nova para tudo.
    const linhas = [
      row('T5', '10', { tier: 5 }),
      row('T4_SEM_PRECO', null, { tier: 4 }),
      row('T3', '900', { tier: 3 }),
    ]
    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['T3', 'T5', 'T4_SEM_PRECO'])
  })

  test('ordena por lucro, decrescente', () => {
    const linhas = [row('a', '10'), row('b', '900'), row('c', '50')]
    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['b', 'c', 'a'])
  })

  test('linha sem preço fica no fim — inclusive ao inverter a direção', () => {
    const linhas = [row('semPreco', null), row('lucro', '10'), row('prejuizo', '-500')]

    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['lucro', 'prejuizo', 'semPreco'])

    // Crescente: prejuízo primeiro, mas a ausência NÃO sobe para o topo.
    expect(
      sortRows(linhas, { field: 'profit', direction: 'asc' }).map((r) => r.outputItem),
    ).toEqual(['prejuizo', 'lucro', 'semPreco'])
  })

  test('compara por decimal, não por string nem por float', () => {
    // Como string, '9' > '100'. Como float, 0.1+0.2 quebra. Nenhum dos dois pode acontecer.
    const linhas = [row('a', '9'), row('b', '100')]
    expect(
      sortRows(linhas, { field: 'profit', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['b', 'a'])
  })

  test('desempate estável por item e cidade', () => {
    const linhas = [
      row('z', '10', { locationId: '4002' }),
      row('a', '10', { locationId: '4002' }),
      row('a', '10', { locationId: '1002' }),
    ]
    const ordenado = sortRows(linhas, { field: 'profit', direction: 'desc' })
    expect(ordenado.map((r) => `${r.outputItem}|${r.locationId}`)).toEqual([
      'a|1002',
      'a|4002',
      'z|4002',
    ])
  })

  test('não muta o array de entrada', () => {
    const linhas = [row('a', '10'), row('b', '900')]
    const antes = linhas.map((r) => r.outputItem)
    sortRows(linhas, { field: 'profit', direction: 'desc' })
    expect(linhas.map((r) => r.outputItem)).toEqual(antes)
  })

  test('frescor ordena por idade da observação, com ausência no fim', () => {
    const linhas = [
      row('velho', '1', { oldestObservedAt: 1_000 }),
      row('novo', '1', { oldestObservedAt: 9_000 }),
      row('sem', null),
    ]
    expect(
      sortRows(linhas, { field: 'freshness', direction: 'desc' }).map((r) => r.outputItem),
    ).toEqual(['novo', 'velho', 'sem'])
  })
})
