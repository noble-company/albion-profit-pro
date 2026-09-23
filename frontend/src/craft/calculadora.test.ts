import { describe, expect, test } from 'vitest'

import type { RecipeCatalog } from '@/catalog/service'
import { money } from '@/lib/money'
import type { ScannerRow } from '@/scanner/engine'

import { linhaEscolhida, linhasPorLucro, receitaDoItem } from './calculadora'

/**
 * Task 4/14. A Calculadora é o scanner com uma receita só: as mesmas contas do engine, uma linha
 * por cidade, o detalhe da escolhida. O que é dela — e só dela — mora aqui.
 */

function catalogo(kind: 'refining' | 'crafting', saidas: string[]): RecipeCatalog {
  return {
    version: 'v1',
    kind,
    items: saidas.map((unique_name) => ({ unique_name, enchantment_level: 0 })),
    recipes: saidas.map((output_item) => ({
      output_item,
      production_kind: kind,
      enchantment_level: 0,
      silver_cost: '0',
      crafting_focus: 0,
      amount_crafted: 1,
      ingredients: [],
      upgrade_resource: null,
    })),
  }
}

const REFINO = catalogo('refining', ['T4_CLOTH'])
const CRAFT = catalogo('crafting', ['T4_MAIN_SWORD'])

describe('onde está a receita do item', () => {
  test('refino e craft têm catálogos separados; a Calculadora procura nos dois', () => {
    expect(receitaDoItem('T4_CLOTH', REFINO, CRAFT)).toEqual({ kind: 'refining', catalog: REFINO })
    expect(receitaDoItem('T4_MAIN_SWORD', REFINO, CRAFT)).toEqual({
      kind: 'crafting',
      catalog: CRAFT,
    })
  })

  test('item sem receita, ou catálogo que ainda não chegou, não inventa receita', () => {
    expect(receitaDoItem('T4_ORE', REFINO, CRAFT)).toBeNull()
    expect(receitaDoItem('T4_MAIN_SWORD', REFINO, null)).toBeNull()
    expect(receitaDoItem('', REFINO, CRAFT)).toBeNull()
  })
})

const linha = (locationId: string, lucro: string | null) =>
  ({
    outputItem: 'T4_MAIN_SWORD',
    locationId,
    state: lucro === null ? 'missing_output_price' : 'priced',
    profit: lucro === null ? null : money(lucro),
  }) as ScannerRow

describe('as cidades lado a lado', () => {
  test('na ordem do lucro; sem preço vai para o fim, e continua lá', () => {
    // Cidade sem preço não é "lucro zero": some da comparação só quem não existe (`X01`).
    const linhas = [linha('1002', '100'), linha('3005', null), linha('4002', '900'), linha('2004', '-50')]

    expect(linhasPorLucro(linhas).map((l) => l.locationId)).toEqual(['4002', '1002', '2004', '3005'])
  })

  test('o detalhe abre na melhor cidade; a escolhida pelo jogador vence a melhor', () => {
    const ordenadas = linhasPorLucro([linha('1002', '100'), linha('4002', '900')])

    expect(linhaEscolhida(ordenadas, null)?.locationId).toBe('4002')
    expect(linhaEscolhida(ordenadas, '1002')?.locationId).toBe('1002')
  })

  test('cidade escolhida que saiu de Vender em volta para a melhor', () => {
    const ordenadas = linhasPorLucro([linha('1002', '100'), linha('4002', '900')])

    expect(linhaEscolhida(ordenadas, '3005')?.locationId).toBe('4002')
    expect(linhaEscolhida([], '3005')).toBeNull()
  })
})
