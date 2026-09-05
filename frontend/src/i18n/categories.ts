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
  bags: 'Bolsas',
  capes: 'Capas',
  consumables: 'Consumíveis',
  crafting: 'Fabricação',
  farming: 'Cultivo',
  gathering: 'Coleta',
  head: 'Cabeça',
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
