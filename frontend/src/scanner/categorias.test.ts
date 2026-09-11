import { describe, expect, test } from 'vitest'

import { rotuloDeCategoria } from '@/i18n/categories'
import { money } from '@/lib/money'

import {
  arvoreDeCategorias,
  MIN_LETRAS_DA_BUSCA,
  ORDEM_DO_CRAFT,
  ORDEM_DO_REFINO,
  receitaEscondida,
  receitasDaSelecao,
  topPorLucro,
  type Selecao,
} from './categorias'
import type { ScannerCatalog, ScannerRow } from './engine'

/**
 * Task 4/21. A tela abre vazia e calcula só o que o jogador escolheu. O craft são 5.523 receitas
 * (2,7 s no Worker); uma subcategoria tem por volta de 100.
 */

type Item = ScannerCatalog['items'][number]
type Receita = ScannerCatalog['recipes'][number]

const item = (unique_name: string, extra: Partial<Item> = {}): Item => ({
  unique_name,
  enchantment_level: 0,
  ...extra,
})

const receita = (output_item: string, production_kind = 'crafting') =>
  ({
    output_item,
    production_kind,
    enchantment_level: 0,
    silver_cost: 0,
    crafting_focus: 0,
    amount_crafted: 1,
    ingredients: [],
    upgrade_resource: null,
  }) as Receita

// Fora da ordem do jogo de propósito: armadura antes de arma, espada antes de arco.
const ITENS = [
  item('T4_ARMOR_CLOTH_SET1', {
    name_pt: 'Robe de Erudito do Adepto',
    shop_category: 'armors',
    shop_subcategory: 'cloth_armor',
  }),
  item('T4_MAIN_SWORD', {
    name_pt: 'Espada Larga do Adepto',
    shop_category: 'weapons',
    shop_subcategory: 'sword',
  }),
  item('T4_2H_BOW', { name_pt: 'Arco do Adepto', shop_category: 'weapons', shop_subcategory: 'bow' }),
  item('UNIQUE_ARMOR_VANITY_WEDDING_TUXEDO', {
    name_pt: 'Smoking de Casamento',
    shop_category: 'armors',
    shop_subcategory: 'other',
  }),
  item('QUESTITEM_CARAVAN_TRADEPACK_CAERLEON_HEAVY', {
    shop_category: 'other',
    shop_subcategory: 'questitems',
  }),
  item('T3_VANITY_CONSUMABLE_FIREWORKS_RED_NONTRADABLE', {
    shop_category: 'consumables',
    shop_subcategory: 'other',
  }),
  // Os tokens de dungeon aleatória não têm categoria nenhuma no dump.
  item('T4_RANDOM_DUNGEON_TOKEN_2'),
]

const RECEITAS = ITENS.map((i) => receita(i.unique_name))
const MAPA = new Map(ITENS.map((i) => [i.unique_name, i]))

const NADA: Selecao = { categoria: null, subcategoria: null, top: false }

describe('o que não aparece (task 21)', () => {
  test('esconde o que não se vende: UNIQUE_, QUESTITEM_ e _NONTRADABLE', () => {
    expect(receitaEscondida('UNIQUE_HEAD_XMAS')).toBe(true)
    expect(receitaEscondida('QUESTITEM_EXP_TOKEN_D10_T6_EXP_HRD_KEEPER_MUSHROOM')).toBe(true)
    expect(receitaEscondida('T3_VANITY_CONSUMABLE_FIREWORKS_RED_NONTRADABLE')).toBe(true)
    // O sufixo de encantamento não disfarça o item.
    expect(receitaEscondida('T4_THING_NONTRADABLE@1')).toBe(true)

    expect(receitaEscondida('T4_MAIN_SWORD')).toBe(false)
    // Capa de facção comum mora em `capes/other`, junto das UNIQUE — e continua aparecendo.
    expect(receitaEscondida('T6_CAPE_CLOTH_KEEPER')).toBe(false)
  })
})

describe('a árvore de categorias (task 21)', () => {
  test('segue a ordem do mercado do jogo, não a ordem do catálogo', () => {
    const arvore = arvoreDeCategorias(RECEITAS, MAPA, 'crafting')

    expect(arvore.map((no) => no.codigo)).toEqual(['weapons', 'armors', 'other'])
    expect(arvore[0]!.filhos.map((no) => no.codigo)).toEqual(['bow', 'sword'])
  })

  test('categoria só com item escondido não aparece', () => {
    const codigos = arvoreDeCategorias(RECEITAS, MAPA, 'crafting').map((no) => no.codigo)

    expect(codigos).not.toContain('consumables')
    // E a subcategoria "Outros" das armaduras, que só tinha o smoking, também não.
    const armaduras = arvoreDeCategorias(RECEITAS, MAPA, 'crafting').find(
      (no) => no.codigo === 'armors',
    )!
    expect(armaduras.filhos.map((no) => no.codigo)).toEqual(['cloth_armor'])
  })

  test('item sem categoria vai para Outros em vez de sumir', () => {
    const outros = arvoreDeCategorias(RECEITAS, MAPA, 'crafting').find(
      (no) => no.codigo === 'other',
    )!
    expect(outros.receitas).toBe(1)
    expect(outros.filhos.map((no) => no.codigo)).toEqual(['other'])
  })

  test('cada nó conta as receitas e tem rótulo em português', () => {
    const [armas] = arvoreDeCategorias(RECEITAS, MAPA, 'crafting')

    expect(armas).toMatchObject({ codigo: 'weapons', rotulo: 'Armas', receitas: 2 })
    expect(armas!.filhos[0]).toMatchObject({ codigo: 'bow', rotulo: 'Arcos', receitas: 1 })
  })

  test('no refino, a árvore é a família, num nível só', () => {
    const itens = [
      item('T4_PLANKS', { shop_category: 'crafting', shop_subcategory: 'refinedresources', shop_subcategory2: 'planks' }),
      item('T4_CLOTH', { shop_category: 'crafting', shop_subcategory: 'refinedresources', shop_subcategory2: 'cloth' }),
      item('T5_CLOTH', { shop_category: 'crafting', shop_subcategory: 'refinedresources', shop_subcategory2: 'cloth' }),
    ]
    const arvore = arvoreDeCategorias(
      itens.map((i) => receita(i.unique_name, 'refining')),
      new Map(itens.map((i) => [i.unique_name, i])),
      'refining',
    )

    // Todo refinado é `crafting/refinedresources`: só o terceiro nível separa as famílias.
    expect(arvore.map((no) => [no.codigo, no.rotulo, no.receitas])).toEqual([
      ['cloth', 'Tecido', 2],
      ['planks', 'Tábuas', 1],
    ])
    expect(arvore.every((no) => no.filhos.length === 0)).toBe(true)
  })

  test('todo código da ordem oficial tem rótulo em português', () => {
    const codigos = [
      ...ORDEM_DO_CRAFT.flatMap(([categoria, subcategorias]) => [categoria, ...subcategorias]),
      ...ORDEM_DO_REFINO,
    ]
    const semRotulo = codigos.filter((codigo) => !rotuloDeCategoria(codigo))

    expect(semRotulo).toEqual([])
  })
})

describe('o que é calculado (task 21)', () => {
  const saidas = (selecao: Selecao, busca = '') =>
    receitasDaSelecao(RECEITAS, MAPA, 'crafting', selecao, busca)

  test('sem seleção nenhuma, nada é calculado', () => {
    expect(saidas(NADA)).toEqual({ modo: 'nada', receitas: [] })
  })

  test('busca curta demais não seleciona', () => {
    // Uma letra casaria milhares de receitas e voltaria aos 2,7 s de antes.
    const curta = 'es'.slice(0, MIN_LETRAS_DA_BUSCA - 1)
    expect(saidas(NADA, curta).modo).toBe('nada')
  })

  test('categoria calcula só as receitas dela; subcategoria recorta mais', () => {
    expect(saidas({ ...NADA, categoria: 'weapons' }).receitas.sort()).toEqual([
      'T4_2H_BOW',
      'T4_MAIN_SWORD',
    ])
    expect(saidas({ ...NADA, categoria: 'weapons', subcategoria: 'bow' })).toEqual({
      modo: 'categoria',
      receitas: ['T4_2H_BOW'],
    })
  })

  test('top calcula tudo que se vende', () => {
    const { modo, receitas } = saidas({ ...NADA, top: true })

    expect(modo).toBe('top')
    expect(receitas.sort()).toEqual([
      'T4_2H_BOW',
      'T4_ARMOR_CLOTH_SET1',
      'T4_MAIN_SWORD',
      'T4_RANDOM_DUNGEON_TOKEN_2',
    ])
  })

  test('a busca seleciona pelo nome, e não traz de volta o que é escondido', () => {
    expect(saidas(NADA, 'Espada')).toEqual({ modo: 'busca', receitas: ['T4_MAIN_SWORD'] })
    expect(saidas(NADA, 'smoking').receitas).toEqual([])
  })

  test('com categoria escolhida, a busca não muda o que é calculado — só o que é mostrado', () => {
    // Digitar dentro de uma categoria não pode recalcular a cada tecla.
    expect(saidas({ ...NADA, categoria: 'armors' }, 'espada')).toEqual({
      modo: 'categoria',
      receitas: ['T4_ARMOR_CLOTH_SET1'],
    })
  })
})

describe('top por lucro (task 21)', () => {
  const linha = (outputItem: string, lucro: string | null) =>
    ({ outputItem, profit: lucro === null ? null : money(lucro) }) as ScannerRow

  test('as de maior lucro, na ordem do lucro, sem as que não têm preço', () => {
    const linhas = [
      linha('A', '10'),
      linha('B', null),
      linha('C', '50'),
      linha('D', '-5'),
      linha('E', '30'),
    ]

    expect(topPorLucro(linhas, 2).map((l) => l.outputItem)).toEqual(['C', 'E'])
    expect(topPorLucro(linhas, 15).map((l) => l.outputItem)).toEqual(['C', 'E', 'A', 'D'])
  })
})
