import { describe, expect, test } from 'vitest'

import { rotuloDeCategoria } from '@/i18n/categories'
import { money } from '@/lib/money'

import {
  arvoreDeCategorias,
  TODAS_AS_CATEGORIAS,
  MIN_LETRAS_DA_BUSCA,
  ORDEM_DO_CRAFT,
  ORDEM_DO_REFINO,
  ORDEM_DOS_CONSUMIVEIS,
  recorteDaReceita,
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

  test('"Todas" calcula tudo que se vende, sem cortar em 15', () => {
    // Pedido no uso: "faltou uma opção todos". O Top corta em 15; aqui a lista vem inteira.
    expect(TODAS_AS_CATEGORIAS).toBe('all')
    const { modo, receitas } = saidas({ ...NADA, categoria: TODAS_AS_CATEGORIAS })

    expect(modo).toBe('todas')
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

describe('Comida & Poções (task 13)', () => {
  // Fora da ordem do jogo de propósito: guisado antes de sopa, fúria antes de cura.
  const itens = [
    item('T4_MEAL_STEW', {
      name_pt: 'Guisado de Cabra',
      shop_category: 'consumables',
      shop_subcategory: 'food',
      shop_subcategory2: 'stews',
    }),
    item('T4_MEAL_SOUP', {
      name_pt: 'Sopa de Cenoura',
      shop_category: 'consumables',
      shop_subcategory: 'food',
      shop_subcategory2: 'soups',
    }),
    item('T4_POTION_BERSERK', {
      name_pt: 'Poção de Fúria',
      shop_category: 'consumables',
      shop_subcategory: 'potions',
      shop_subcategory2: 'berserk',
    }),
    item('T4_POTION_HEAL@1', {
      name_pt: 'Poção de Cura',
      enchantment_level: 1,
      shop_category: 'consumables',
      shop_subcategory: 'potions',
      shop_subcategory2: 'heal',
    }),
    item('T4_BUTTER', {
      name_pt: 'Manteiga de Cabra',
      shop_category: 'farming',
      shop_subcategory: 'farmingproducts',
      shop_subcategory2: 'butter',
    }),
    item('T1_FISHSAUCE_LEVEL1', {
      name_pt: 'Molho de Peixe Básico',
      shop_category: 'crafting',
      shop_subcategory: 'fish',
      shop_subcategory2: 'other',
    }),
    item('T5_CONSUMABLE_FIREWORKS_YELLOW', {
      name_pt: 'Fogos de Artifício Amarelos',
      shop_category: 'consumables',
      shop_subcategory: 'other',
      shop_subcategory2: 'firework',
    }),
    // Ficam no craft: arma e extrato arcano (a alquimia não entrou na aba).
    item('T4_MAIN_SWORD', {
      name_pt: 'Espada Larga do Adepto',
      shop_category: 'weapons',
      shop_subcategory: 'sword',
    }),
    item('T1_ALCHEMY_EXTRACT_LEVEL1', {
      name_pt: 'Extratos Arcanos Básicos',
      shop_category: 'crafting',
      shop_subcategory: 'alchemy',
      shop_subcategory2: 'extract',
    }),
  ]
  const receitas = itens.map((i) => receita(i.unique_name))
  const mapa = new Map(itens.map((i) => [i.unique_name, i]))
  const DA_ABA = [
    'T1_FISHSAUCE_LEVEL1',
    'T4_BUTTER',
    'T4_MEAL_SOUP',
    'T4_MEAL_STEW',
    'T4_POTION_BERSERK',
    'T4_POTION_HEAL@1',
    'T5_CONSUMABLE_FIREWORKS_YELLOW',
  ]

  test('a árvore da aba: Comida, Poções, Insumos e Outros, com as famílias na ordem do jogo', () => {
    const arvore = arvoreDeCategorias(receitas, mapa, 'consumables')

    expect(arvore.map((no) => no.codigo)).toEqual(['food', 'potions', 'insumos', 'other'])
    // O bloco `shopcategories` do dump: sopas (200) antes de guisados (700), cura antes de fúria.
    expect(arvore[0]!.filhos.map((no) => no.codigo)).toEqual(['soups', 'stews'])
    expect(arvore[1]!.filhos.map((no) => no.codigo)).toEqual(['heal', 'berserk'])
    // `fishsauce`, não `fish`: o mapa de rótulos é plano e `fish` já é "Pesca" na Coleta.
    expect(arvore[2]).toMatchObject({ codigo: 'insumos', rotulo: 'Insumos', receitas: 2 })
    expect(arvore[2]!.filhos.map((no) => [no.codigo, no.rotulo])).toEqual([
      ['fishsauce', 'Molho de peixe'],
      ['farmingproducts', 'Produtos de fazenda'],
    ])
    expect(arvore[3]!.filhos.map((no) => no.codigo)).toEqual(['firework'])
  })

  test('o craft não mostra mais consumíveis nem os insumos da cozinha', () => {
    const arvore = arvoreDeCategorias(receitas, mapa, 'crafting')

    expect(arvore.map((no) => no.codigo)).toEqual(['weapons', 'crafting'])
    // A alquimia continua no craft; o molho de peixe, que também é `crafting`, saiu.
    expect(arvore[1]!.filhos.map((no) => no.codigo)).toEqual(['alchemy'])
  })

  test('Top, Todas e busca de cada tela só alcançam as receitas dela', () => {
    const top = (tela: 'crafting' | 'consumables') =>
      receitasDaSelecao(receitas, mapa, tela, { ...NADA, top: true }, '').receitas.sort()

    expect(top('consumables')).toEqual(DA_ABA)
    expect(top('crafting')).toEqual(['T1_ALCHEMY_EXTRACT_LEVEL1', 'T4_MAIN_SWORD'])
    expect(
      receitasDaSelecao(receitas, mapa, 'consumables', { ...NADA, categoria: TODAS_AS_CATEGORIAS }, '')
        .receitas.sort(),
    ).toEqual(DA_ABA)

    expect(receitasDaSelecao(receitas, mapa, 'crafting', NADA, 'poção').receitas).toEqual([])
    expect(
      receitasDaSelecao(receitas, mapa, 'consumables', NADA, 'poção').receitas.sort(),
    ).toEqual(['T4_POTION_BERSERK', 'T4_POTION_HEAL@1'])
  })

  test('categoria e família recortam o que é calculado', () => {
    const saidas = (selecao: Selecao) =>
      receitasDaSelecao(receitas, mapa, 'consumables', selecao, '').receitas.sort()

    expect(saidas({ ...NADA, categoria: 'potions' })).toEqual([
      'T4_POTION_BERSERK',
      'T4_POTION_HEAL@1',
    ])
    expect(saidas({ ...NADA, categoria: 'insumos', subcategoria: 'fishsauce' })).toEqual([
      'T1_FISHSAUCE_LEVEL1',
    ])
  })

  test('todo código da árvore da aba tem rótulo em português', () => {
    const codigos = ORDEM_DOS_CONSUMIVEIS.flatMap(([categoria, familias]) => [
      categoria,
      ...familias,
    ])

    expect(codigos.filter((codigo) => !rotuloDeCategoria(codigo))).toEqual([])
  })
})

describe('o recorte de uma receita só (task 14)', () => {
  // A Calculadora pede o preço da categoria do item, pela mesma regra do servidor
  // (`_na_categoria`). O realm inteiro seriam 187 KB a cada 30 s para cotar uma receita.
  test('refino: a família', () => {
    const tecido = item('T4_CLOTH', {
      shop_category: 'crafting',
      shop_subcategory: 'refinedresources',
      shop_subcategory2: 'cloth',
    })
    expect(recorteDaReceita(tecido, 'refining')).toEqual({
      kind: 'refining',
      category: 'cloth',
      subcategory: null,
    })
  })

  test('craft: categoria e subcategoria do dump — inclusive o que mora na aba de Comida & Poções', () => {
    const pocao = item('T4_POTION_HEAL', {
      shop_category: 'consumables',
      shop_subcategory: 'potions',
      shop_subcategory2: 'heal',
    })
    expect(recorteDaReceita(pocao, 'crafting')).toEqual({
      kind: 'crafting',
      category: 'consumables',
      subcategory: 'potions',
    })
  })

  test('item sem categoria no dump mora em Outros, dos dois lados', () => {
    expect(recorteDaReceita(item('T4_RANDOM_DUNGEON_TOKEN_2'), 'crafting')).toEqual({
      kind: 'crafting',
      category: 'other',
      subcategory: 'other',
    })
    expect(recorteDaReceita(undefined, 'refining')).toEqual({
      kind: 'refining',
      category: 'other',
      subcategory: null,
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
