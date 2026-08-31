export const UI_FRESHNESS_HOURS = 6
export function formatarSilver(value: string | number | null | undefined) {
  if (value == null || value === '') return '—'
  const raw = String(value).trim().replace(',', '.')
  const [integer = '0'] = raw.split('.')
  const sign = integer.startsWith('-') ? '-' : ''
  const digits = integer.replace(/^-/, '').replace(/^0+(?=\d)/, '') || '0'
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped} silver`
}
export function formatarIdade(
  observedAt: string | null | undefined,
  now = new Date(),
) {
  if (!observedAt) return 'Sem atualização'
  const delta = now.getTime() - new Date(observedAt).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Relógio fora de sincronia'
  const minutes = Math.floor(Math.max(0, delta) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const stale = hours >= UI_FRESHNESS_HOURS ? ' · desatualizado' : ''
  return `há ${hours} h${stale}`
}
export function formatarPct(value: string | number | null | undefined) {
  if (value == null || value === '') return '—'
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? `${parsed.toFixed(1).replace('.', ',')}%` : '—'
}

const LOCATION_LABELS: Record<string, string> = {
  '3005': 'Caerleon', '2004': 'Bridgewatch', '4002': 'Fort Sterling',
  '1002': 'Lymhurst', '1301': 'Lymhurst', '3008': 'Martlock',
  '0007': 'Thetford', '5003': 'Brecilien', '3003': 'Black Market',
  '1000-HellDen': 'Covil do Inferno',
}

export function formatarLocalidade(value: string | null | undefined) {
  if (!value) return '—'
  return LOCATION_LABELS[value] ?? 'Mercado'
}

export function formatarNomeJogador(name: string | null | undefined, uniqueName: string) {
  const base = (name || uniqueName).replace(/ do (Novato|Adepto|Perito|Mestre|Ancião)$/i, '')
  const match = uniqueName.match(/^T(\d+)(?:_[^@]+)?(?:@(\d+))?$/i)
  if (!match) return base
  const [, tier, enchantment] = match
  return `${base} T${tier}${enchantment && Number(enchantment) > 0 ? `.${enchantment}` : ''}`
}

export function formatarQualidade(value: number | null | undefined) {
  const labels = ['Normal', 'Bom', 'Excelente', 'Excepcional', 'Obra-prima']
  return value != null && value >= 1 && value <= labels.length ? labels[value - 1] : 'Qualidade desconhecida'
}

const CATEGORY_LABELS: Record<string, string> = {
  weapons: 'Armas', armors: 'Armaduras', artifacts: 'Artefatos', bags: 'Bolsas',
  capes: 'Capas', consumables: 'Consumíveis', crafting: 'Fabricação', farming: 'Cultivo',
  gathering: 'Coleta', head: 'Cabeça', offhands: 'Mão secundária', other: 'Outros',
  shoes: 'Calçados', vanity: 'Cosméticos', accessoires: 'Acessórios', sword: 'Espada',
  swords: 'Espadas', bow: 'Arco', bows: 'Arcos', axe: 'Machado', axes: 'Machados',
  dagger: 'Adaga', daggers: 'Adagas', staff: 'Cajado', staffs: 'Cajados',
  spear: 'Lança', spears: 'Lanças', mace: 'Maça', maces: 'Maças', avalon: 'Avalon',
  crystal: 'Cristal', morgana: 'Morgana', keeper: 'Guardião', heretic: 'Herege',
  undead: 'Morto-vivo', demon: 'Demônio', bridgewatch: 'Bridgewatch', caerleon: 'Caerleon',
  fortsterling: 'Fort Sterling', lymhurst: 'Lymhurst', martlock: 'Martlock',
  thetford: 'Thetford', brecilien: 'Brecilien', smuggler: 'Contrabandista',
}

export function formatarCategoria(value: string) {
  return value.split('_').map((part) => CATEGORY_LABELS[part.toLowerCase()] ?? part.charAt(0).toUpperCase() + part.slice(1)).join(' · ')
}
