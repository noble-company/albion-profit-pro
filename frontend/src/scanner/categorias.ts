import type { CatalogKind } from '@/catalog/service'
import { rotuloDeCategoria } from '@/i18n/categories'
import { compare } from '@/lib/money'

import type { ScannerCatalog, ScannerRow } from './engine'
import { casaBusca } from './filters'
import type { RecorteDoSnapshot } from './usePriceSnapshot'

/**
 * O que a tela calcula (task 4/21).
 *
 * A tela abre **vazia** e calcula só o que o jogador escolheu: uma categoria, o Top 15, ou o que
 * casa com a busca. Foi a resposta à lentidão do craft no lugar da paginação pelo Postgres — que
 * não pagina por lucro sem o servidor calcular o lucro. O lento nunca foi baixar: é calcular
 * 5.523 receitas × 8 cidades (2,7 s no Worker). Uma subcategoria tem por volta de 100.
 */

type CatalogItem = ScannerCatalog['items'][number]
type CatalogRecipe = ScannerCatalog['recipes'][number]

/**
 * As três telas do scanner. Comida & Poções (task 13) não tem catálogo próprio: lê o de craft e
 * fica com o que é de cozinha — que, por isso mesmo, sai do Craft.
 */
export type TelaDoScanner = 'refining' | 'crafting' | 'consumables'

export function catalogoDaTela(tela: TelaDoScanner): Exclude<CatalogKind, null> {
  return tela === 'refining' ? 'refining' : 'crafting'
}

export const TOP_RECEITAS = 15

/**
 * "Todas" no seletor — `cat=all`, no mesmo espírito do `sell_in=all` de antes. A lista inteira, sem
 * o corte do Top. No craft são 5.523 receitas e segundos de cálculo, e o cabeçalho diz isso. `all`
 * não existe como código no bloco `shopcategories` do dump, então não colide com categoria real.
 */
export const TODAS_AS_CATEGORIAS = 'all'

/**
 * Menos que isso a busca não seleciona. Uma letra casa milhares de receitas e traria de volta os
 * 2,7 s de antes, a cada tecla.
 */
export const MIN_LETRAS_DA_BUSCA = 3

/**
 * A ordem do mercado do jogo — o bloco `shopcategories` do `ITEM DUMP.json`, pelo `@value`. Quem
 * joga procura "Armas" onde o jogo põe "Armas"; ordem alfabética seria uma segunda convenção.
 * Categoria e subcategoria que não aparecem aqui (patch novo) vão para o fim, com o código cru.
 */
export const ORDEM_DO_CRAFT: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    'weapons',
    [
      'bow',
      'crossbow',
      'axe',
      'dagger',
      'hammer',
      'knuckles',
      'mace',
      'quarterstaff',
      'spear',
      'sword',
      'arcanestaff',
      'cursestaff',
      'firestaff',
      'froststaff',
      'holystaff',
      'naturestaff',
      'shapeshifterstaff',
      'other',
    ],
  ],
  ['armors', ['cloth_armor', 'leather_armor', 'plate_armor', 'other']],
  ['head', ['cloth_helmet', 'leather_helmet', 'plate_helmet', 'other']],
  ['shoes', ['cloth_shoes', 'leather_shoes', 'plate_shoes', 'other']],
  ['offhands', ['booktype', 'torchtype', 'shieldtype', 'other']],
  [
    'capes',
    [
      'accessoires_capes_capes',
      'accessoires_capes_bridgewatch',
      'accessoires_capes_fortsterling',
      'accessoires_capes_lymhurst',
      'accessoires_capes_martlock',
      'accessoires_capes_thetford',
      'accessoires_capes_caerleon',
      'accessoires_capes_brecilien',
      'accessoires_capes_heretic',
      'accessoires_capes_undead',
      'accessoires_capes_keeper',
      'accessoires_capes_morgana',
      'accessoires_capes_avalon',
      'accessoires_capes_demon',
      'accessoires_capes_smuggler',
      'other',
    ],
  ],
  ['bags', ['bags', 'satchels', 'other']],
  ['mounts', ['basemounts', 'raremounts', 'battle_mount']],
  ['consumables', ['food', 'potions', 'tomes', 'other', 'silverbag']],
  ['gathering', ['fish', 'fiber', 'hide', 'ore', 'rock', 'wood', 'tracking']],
  ['crafting', ['resources', 'refinedresources', 'tokens', 'cityresources', 'fish', 'alchemy']],
  ['artefacts', ['weapons', 'armors', 'head', 'shoes', 'offhands', 'fragments', 'capes', 'favor']],
  ['farming', ['farm', 'herbgarden', 'pasture', 'kennel', 'farmingproducts']],
  ['furniture', ['repairkit', 'chest', 'house', 'island', 'world', 'other']],
  [
    'vanity',
    [
      'avatar',
      'avatarring',
      'mounts',
      'weapons',
      'armors',
      'head',
      'shoes',
      'offhands',
      'capes',
      'killemotes',
    ],
  ],
  [
    'other',
    [
      'lootitem',
      'guilds',
      'labourers',
      'tokens',
      'luxurygoods',
      'maps',
      'hardcoreexpeditions',
      'questitems',
      'killtrophy',
      'trash',
      'other',
    ],
  ],
]

/**
 * As famílias do refino, na ordem do jogo. Todo produto refinado é `crafting/refinedresources`
 * nos dois primeiros níveis — só o `shop_subcategory2` separa tecido de couro.
 */
export const ORDEM_DO_REFINO: readonly string[] = [
  'cloth',
  'leather',
  'metalbars',
  'stoneblock',
  'planks',
]

const OUTROS = 'other'

const CONSUMIVEIS = 'consumables'

/** A categoria sintética dos insumos — como `all`, não existe no bloco `shopcategories`. */
export const CATEGORIA_DOS_INSUMOS = 'insumos'

/**
 * Os insumos da cozinha que moram na aba (decisão de 2026-09-12): `[código da aba, shop_category,
 * shop_subcategory]`. O código é da aba e não do dump porque o mapa de rótulos é plano, e `fish`
 * já é "Pesca" na Coleta. Espelho de `INSUMOS` em `backend/src/prices/snapshot.py`.
 */
export const INSUMOS: ReadonlyArray<readonly [string, string, string]> = [
  ['fishsauce', 'crafting', 'fish'],
  ['farmingproducts', 'farming', 'farmingproducts'],
]

/**
 * A árvore de Comida & Poções. Comida e Poções seguem o `shopsubcategory2` do bloco
 * `shopcategories` do dump, pelo `@value` — a mesma regra de `ORDEM_DO_CRAFT`.
 */
export const ORDEM_DOS_CONSUMIVEIS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    'food',
    [
      'soups',
      'salads',
      'pies',
      'roasts',
      'omelettes',
      'stews',
      'sandwiches',
      'grilledfish',
      'event',
      'other',
    ],
  ],
  [
    'potions',
    [
      'heal',
      'energy',
      'gigantify',
      'resistance',
      'slowfield',
      'poison',
      'invisibility',
      'calming',
      'cleanse',
      'acid',
      'berserk',
      'lava',
      'gather',
      'tornado',
      'lifeward',
      'focus',
      'event',
      'other',
    ],
  ],
  [CATEGORIA_DOS_INSUMOS, INSUMOS.map(([codigo]) => codigo)],
  ['other', ['firework']],
]

/**
 * O que não se vende no mercado não entra em lugar nenhum: nem na árvore, nem no Top 15, nem na
 * busca. A regra é pelo **nome**, não pela categoria (decisão de 2026-09-10): `capes/other` mistura
 * 54 capas `UNIQUE_` com 9 capas de facção normais, e esconder a subcategoria perderia as nove.
 */
export function receitaEscondida(outputItem: string): boolean {
  const nome = outputItem.split('@')[0] ?? outputItem
  return (
    nome.startsWith('UNIQUE_') || nome.startsWith('QUESTITEM_') || nome.endsWith('_NONTRADABLE')
  )
}

/**
 * O recorte do snapshot para **uma** receita (task 14): a categoria do item, pela regra do
 * catálogo em que ela mora — a mesma de `_na_categoria` no servidor. A Calculadora cota uma
 * receita; o realm inteiro seriam 187 KB a cada 30 s.
 */
export function recorteDaReceita(
  item: CatalogItem | undefined,
  kind: 'refining' | 'crafting',
): RecorteDoSnapshot {
  if (kind === 'refining') {
    return { kind, category: item?.shop_subcategory2 ?? OUTROS, subcategory: null }
  }
  return {
    kind,
    category: item?.shop_category ?? OUTROS,
    subcategory: item?.shop_subcategory ?? OUTROS,
  }
}

/** O código de insumo da aba, se o item é um. */
function insumoDo(item: CatalogItem | undefined): string | undefined {
  return INSUMOS.find(
    ([, categoria, subcategoria]) =>
      item?.shop_category === categoria && item?.shop_subcategory === subcategoria,
  )?.[0]
}

/**
 * Onde uma receita mora na árvore: `[categoria, subcategoria]`, ou `[família, null]` no refino.
 * Item sem categoria no dump (os tokens de dungeon aleatória) vai para Outros em vez de sumir.
 * `null` = a receita é de outra tela: o que é de cozinha mora só em Comida & Poções (task 13).
 */
function lugarDaReceita(
  item: CatalogItem | undefined,
  tela: TelaDoScanner,
): [string, string | null] | null {
  if (tela === 'refining') return [item?.shop_subcategory2 ?? OUTROS, null]

  const insumo = insumoDo(item)
  const daCozinha = item?.shop_category === CONSUMIVEIS || insumo !== undefined
  if (tela === 'crafting') {
    return daCozinha ? null : [item?.shop_category ?? OUTROS, item?.shop_subcategory ?? OUTROS]
  }

  if (!daCozinha) return null
  if (insumo !== undefined) return [CATEGORIA_DOS_INSUMOS, insumo]
  return [item?.shop_subcategory ?? OUTROS, item?.shop_subcategory2 ?? OUTROS]
}

export interface NoDaArvore {
  codigo: string
  rotulo: string
  /** receitas que se vendem debaixo deste nó */
  receitas: number
  filhos: NoDaArvore[]
}

const rotulo = (codigo: string) => rotuloDeCategoria(codigo) ?? codigo

function ordenar(nos: NoDaArvore[], ordem: readonly string[]): NoDaArvore[] {
  const posicao = (codigo: string) => {
    const indice = ordem.indexOf(codigo)
    return indice === -1 ? ordem.length : indice
  }
  return nos.sort(
    (a, b) => posicao(a.codigo) - posicao(b.codigo) || a.codigo.localeCompare(b.codigo),
  )
}

/** A árvore do seletor: só o que existe no catálogo aberto, contado, na ordem do jogo. */
export function arvoreDeCategorias(
  recipes: readonly CatalogRecipe[],
  itemsByName: ReadonlyMap<string, CatalogItem>,
  tela: TelaDoScanner,
): NoDaArvore[] {
  const contagem = new Map<string, { receitas: number; filhos: Map<string, number> }>()

  for (const receita of recipes) {
    if (receitaEscondida(receita.output_item)) continue
    const lugar = lugarDaReceita(itemsByName.get(receita.output_item), tela)
    if (lugar === null) continue
    const [categoria, subcategoria] = lugar
    const no = contagem.get(categoria) ?? { receitas: 0, filhos: new Map<string, number>() }
    no.receitas += 1
    if (subcategoria !== null) {
      no.filhos.set(subcategoria, (no.filhos.get(subcategoria) ?? 0) + 1)
    }
    contagem.set(categoria, no)
  }

  const ordem = tela === 'consumables' ? ORDEM_DOS_CONSUMIVEIS : ORDEM_DO_CRAFT
  const ordemDasSubcategorias = new Map(ordem)
  const ordemDoTopo = tela === 'refining' ? ORDEM_DO_REFINO : ordem.map(([c]) => c)

  const nos = [...contagem].map(([codigo, { receitas, filhos }]) => ({
    codigo,
    rotulo: rotulo(codigo),
    receitas,
    filhos: ordenar(
      [...filhos].map(([sub, quantas]) => ({
        codigo: sub,
        rotulo: rotulo(sub),
        receitas: quantas,
        filhos: [],
      })),
      ordemDasSubcategorias.get(codigo) ?? [],
    ),
  }))
  return ordenar(nos, ordemDoTopo)
}

/** O que está escolhido na barra. Categoria e Top são exclusivos na URL. */
export interface Selecao {
  categoria: string | null
  subcategoria: string | null
  top: boolean
}

export type ModoDaSelecao = 'nada' | 'todas' | 'categoria' | 'top' | 'busca'

export interface ReceitasDaSelecao {
  modo: ModoDaSelecao
  /** as `output_item` a calcular; vazia no modo `nada` */
  receitas: string[]
}

/**
 * Quais receitas o engine calcula. Precedência: **todas/categoria → Top → busca → nada**.
 *
 * A busca só seleciona quando não há categoria nem Top. Com uma categoria escolhida ela continua
 * filtrando o que aparece (`applyFilters`), mas não mexe no que é calculado — senão digitar
 * dentro de uma categoria recalcularia a cada tecla.
 */
export function receitasDaSelecao(
  recipes: readonly CatalogRecipe[],
  itemsByName: ReadonlyMap<string, CatalogItem>,
  tela: TelaDoScanner,
  selecao: Selecao,
  busca: string,
): ReceitasDaSelecao {
  const termo = busca.trim().toLocaleLowerCase('pt-BR')
  const modo: ModoDaSelecao =
    selecao.categoria === TODAS_AS_CATEGORIAS
      ? 'todas'
      : selecao.categoria
        ? 'categoria'
        : selecao.top
          ? 'top'
          : termo.length >= MIN_LETRAS_DA_BUSCA
            ? 'busca'
            : 'nada'
  if (modo === 'nada') return { modo, receitas: [] }

  const receitas: string[] = []
  for (const receita of recipes) {
    if (receitaEscondida(receita.output_item)) continue
    const item = itemsByName.get(receita.output_item)
    // Top, Todas e busca também só alcançam a tela aberta: poção não volta ao Craft pela busca.
    const lugar = lugarDaReceita(item, tela)
    if (lugar === null) continue

    if (modo === 'categoria') {
      const [categoria, subcategoria] = lugar
      if (categoria !== selecao.categoria) continue
      if (selecao.subcategoria && subcategoria !== selecao.subcategoria) continue
    } else if (modo === 'busca' && !casaBusca(item, receita.output_item, termo)) {
      continue
    }

    receitas.push(receita.output_item)
  }
  return { modo, receitas }
}

/**
 * As `n` de maior lucro, na ordem do lucro. Linha sem preço fica fora: sem lucro não há como
 * estar entre as mais lucrativas — e contá-la como zero seria uma afirmação sobre o mercado.
 */
export function topPorLucro(rows: readonly ScannerRow[], n: number): ScannerRow[] {
  return rows
    .filter((row) => row.profit !== null)
    .sort((a, b) => compare(b.profit!, a.profit!))
    .slice(0, n)
}
