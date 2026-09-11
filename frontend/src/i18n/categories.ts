/**
 * Tradução das categorias/subcategorias do catálogo (pt-BR). Fica no cliente de propósito:
 * o contrato HTTP é inglês-only (task 3.5/07) — a API devolve o slug cru
 * (`shop_category` etc.). Antes isto morava em `lib/formatters.ts` misturado com lógica de
 * formato de número; a task 3.5/19 separou.
 */
const CATEGORY_LABELS: Record<string, string> = {
  weapons: 'Armas',
  armors: 'Armaduras',
  artifacts: 'Artefatos',
  artefacts: 'Artefatos',
  bags: 'Bolsas',
  capes: 'Capas',
  consumables: 'Consumíveis',
  crafting: 'Fabricação',
  farming: 'Cultivo',
  furniture: 'Mobília',
  gathering: 'Coleta',
  head: 'Cabeça',
  mounts: 'Montarias',
  offhands: 'Mão secundária',
  other: 'Outros',
  shoes: 'Calçados',
  vanity: 'Cosméticos',
  accessoires: 'Acessórios',
  sword: 'Espada',
  swords: 'Espadas',
  bow: 'Arco',
  bows: 'Arcos',
  axe: 'Machado',
  axes: 'Machados',
  dagger: 'Adaga',
  daggers: 'Adagas',
  staff: 'Cajado',
  staffs: 'Cajados',
  spear: 'Lança',
  spears: 'Lanças',
  mace: 'Maça',
  maces: 'Maças',
  avalon: 'Avalon',
  crystal: 'Cristal',
  morgana: 'Morgana',
  keeper: 'Guardião',
  heretic: 'Herege',
  undead: 'Morto-vivo',
  demon: 'Demônio',
  bridgewatch: 'Bridgewatch',
  caerleon: 'Caerleon',
  fortsterling: 'Fort Sterling',
  lymhurst: 'Lymhurst',
  martlock: 'Martlock',
  thetford: 'Thetford',
  brecilien: 'Brecilien',
  smuggler: 'Contrabandista',
}

export function traduzirCategoria(value: string): string {
  return value
    .split('_')
    .map(
      (part) =>
        CATEGORY_LABELS[part.toLowerCase()] ??
        part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' · ')
}

/**
 * Rótulo de um código **inteiro** do mercado do jogo, para o seletor do scanner (task 4/21).
 *
 * Separado de `traduzirCategoria` de propósito: aquele monta o rótulo pedaço a pedaço e sempre
 * devolve alguma coisa — `cloth_armor` vira "Cloth · Armor". Aqui a ausência é `undefined`, e o
 * teste do seletor usa isso para exigir um rótulo em português para todo código do dump.
 *
 * Os códigos de subcategoria não se repetem com significados diferentes entre categorias
 * (`weapons` é "Armas" tanto no topo quanto dentro de Artefatos), então o mapa pode ser plano.
 */
const SHOP_LABELS: Record<string, string> = {
  // --- categorias, com os mesmos nomes de `CATEGORY_LABELS` ---
  weapons: 'Armas',
  armors: 'Armaduras',
  head: 'Cabeça',
  shoes: 'Calçados',
  offhands: 'Mão secundária',
  capes: 'Capas',
  bags: 'Bolsas',
  mounts: 'Montarias',
  consumables: 'Consumíveis',
  gathering: 'Coleta',
  crafting: 'Fabricação',
  artefacts: 'Artefatos',
  farming: 'Cultivo',
  furniture: 'Mobília',
  vanity: 'Cosméticos',
  other: 'Outros',

  // --- armas ---
  bow: 'Arcos',
  crossbow: 'Bestas',
  axe: 'Machados',
  dagger: 'Adagas',
  hammer: 'Martelos',
  knuckles: 'Manoplas',
  mace: 'Maças',
  quarterstaff: 'Bordões',
  spear: 'Lanças',
  sword: 'Espadas',
  arcanestaff: 'Cajados arcanos',
  cursestaff: 'Cajados amaldiçoados',
  firestaff: 'Cajados de fogo',
  froststaff: 'Cajados de gelo',
  holystaff: 'Cajados sagrados',
  naturestaff: 'Cajados da natureza',
  shapeshifterstaff: 'Cajados metamorfos',

  // --- armadura, cabeça e calçados ---
  cloth_armor: 'Tecido',
  leather_armor: 'Couro',
  plate_armor: 'Placa',
  cloth_helmet: 'Tecido',
  leather_helmet: 'Couro',
  plate_helmet: 'Placa',
  cloth_shoes: 'Tecido',
  leather_shoes: 'Couro',
  plate_shoes: 'Placa',

  // --- mão secundária ---
  booktype: 'Livros',
  torchtype: 'Tochas',
  shieldtype: 'Escudos',

  // --- capas ---
  accessoires_capes_capes: 'Capas comuns',
  accessoires_capes_bridgewatch: 'Bridgewatch',
  accessoires_capes_fortsterling: 'Fort Sterling',
  accessoires_capes_lymhurst: 'Lymhurst',
  accessoires_capes_martlock: 'Martlock',
  accessoires_capes_thetford: 'Thetford',
  accessoires_capes_caerleon: 'Caerleon',
  accessoires_capes_brecilien: 'Brecilien',
  accessoires_capes_heretic: 'Herege',
  accessoires_capes_undead: 'Morto-vivo',
  accessoires_capes_keeper: 'Guardião',
  accessoires_capes_morgana: 'Morgana',
  accessoires_capes_avalon: 'Avalon',
  accessoires_capes_demon: 'Demônio',
  accessoires_capes_smuggler: 'Contrabandista',

  // --- bolsas e montarias ---
  satchels: 'Sacolas',
  basemounts: 'Montarias básicas',
  raremounts: 'Montarias raras',
  battle_mount: 'Montarias de batalha',

  // --- consumíveis ---
  food: 'Comida',
  potions: 'Poções',
  tomes: 'Tomos',
  silverbag: 'Bolsas de prata',

  // --- coleta (ferramentas e equipamento de coleta) ---
  fish: 'Pesca',
  fiber: 'Fibra',
  hide: 'Pele',
  ore: 'Minério',
  rock: 'Pedra',
  wood: 'Madeira',
  tracking: 'Rastreamento',

  // --- fabricação ---
  resources: 'Recursos',
  refinedresources: 'Recursos refinados',
  tokens: 'Tokens',
  cityresources: 'Recursos das cidades',
  alchemy: 'Alquimia',

  // --- artefatos ---
  fragments: 'Fragmentos',
  favor: 'Favor',

  // --- cultivo ---
  farm: 'Fazenda',
  herbgarden: 'Horta',
  pasture: 'Pasto',
  kennel: 'Canil',
  farmingproducts: 'Produtos de fazenda',

  // --- mobília ---
  repairkit: 'Kits de reparo',
  chest: 'Baús',
  house: 'Casa',
  island: 'Ilha',
  world: 'Mundo',

  // --- cosméticos ---
  avatar: 'Avatares',
  avatarring: 'Molduras de avatar',
  killemotes: 'Emotes de abate',

  // --- outros ---
  lootitem: 'Espólio',
  guilds: 'Guildas',
  labourers: 'Trabalhadores',
  luxurygoods: 'Artigos de luxo',
  maps: 'Mapas',
  hardcoreexpeditions: 'Expedições hardcore',
  questitems: 'Itens de missão',
  killtrophy: 'Troféus',
  trash: 'Lixo',

  // --- famílias do refino (`shop_subcategory2` de `crafting/refinedresources`) ---
  cloth: 'Tecido',
  leather: 'Couro',
  metalbars: 'Barras de metal',
  stoneblock: 'Blocos de pedra',
  planks: 'Tábuas',
}

export function rotuloDeCategoria(codigo: string): string | undefined {
  return SHOP_LABELS[codigo]
}
