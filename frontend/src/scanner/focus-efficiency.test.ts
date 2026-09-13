import { describe, expect, test } from 'vitest'

import {
  focusCostFor,
  refineNodeKey,
  refiningEfficiency,
  RAMOS_DE_REFINO,
  type DestinyBoard,
} from './focus-efficiency'

/**
 * Task 4/17. O custo de foco que o jogo cobra depende do Painel do Destino, e o `crafting_focus`
 * do dump é o de quem nunca especializou nada. Os números aqui vêm das capturas do painel do
 * usuário, não de suposição.
 */

const painel = (nodes: Record<string, number>): DestinyBoard => new Map(Object.entries(nodes))

describe('eficiência de custo de foco no refino', () => {
  test('o nó de um tier dá 30 ao ramo inteiro e 250 ao próprio tier', () => {
    // `Tecelão de Fibras Adepto` no nível 100 mostra, no Sumário de Recompensas do jogo:
    // "+3.000 ao refinar fibras" (100 × 30) e "+25.000 ao refinar Cânhamo" (100 × 250).
    const board = painel({ 'refine:fiber:4': 100 })

    expect(refiningEfficiency('fiber', 4, board)).toBe(28_000)
    // Refinando OUTRO tier da mesma família, só o amplo conta.
    expect(refiningEfficiency('fiber', 6, board)).toBe(3_000)
    // Outra família não é afetada — subir fibra não ajuda a fundir minério.
    expect(refiningEfficiency('ore', 4, board)).toBe(0)
  })

  test('os cinco tiers somam o amplo entre si', () => {
    const board = painel({
      'refine:fiber:4': 100,
      'refine:fiber:5': 100,
      'refine:fiber:6': 100,
      'refine:fiber:7': 100,
      'refine:fiber:8': 100,
    })

    // 5 × 100 × 30 = 15.000 de amplo, + 250 × 100 do tier = 40.000 no total.
    expect(refiningEfficiency('fiber', 5, board)).toBe(40_000)
  })
})

describe('o custo em si', () => {
  test('cada 10.000 de eficiência divide o custo pela metade', () => {
    expect(focusCostFor(100, 0)).toBe(100)
    expect(focusCostFor(100, 10_000)).toBe(50)
    expect(focusCostFor(100, 20_000)).toBe(25)
    // 40.000 é o teto do refino: 6,25% do custo base.
    expect(focusCostFor(100, 40_000)).toBe(6.25)
  })

  test('o caso do painel real: tecido T4 sai de 54 para ~7,8 de foco', () => {
    // 54 × 0,5^2,8 = 7,75… — o jogador com `Tecelão de Fibras Adepto` em 100 paga isso, e a
    // tela mostrava 54. Sete vezes de diferença numa métrica que decide o dia dele.
    const custo = focusCostFor(54, refiningEfficiency('fiber', 4, painel({ 'refine:fiber:4': 100 })))

    expect(custo).toBeCloseTo(7.75, 2)
  })

  test('painel vazio não muda nada', () => {
    // Quem não preencheu vê o custo base — nunca um desconto que não conquistou.
    expect(focusCostFor(503, refiningEfficiency('fiber', 8, painel({})))).toBe(503)
  })
})

describe('chaves e ramos', () => {
  test('a chave do nó é estável e legível', () => {
    expect(refineNodeKey('fiber', 4)).toBe('refine:fiber:4')
  })

  test('os cinco ramos de refino são os do jogo', () => {
    // São as `@craftingcategory` dos produtos refinados no dump: `T5_CLOTH` é `fiber`.
    expect(RAMOS_DE_REFINO).toEqual(['fiber', 'hide', 'ore', 'wood', 'rock'])
  })
})
