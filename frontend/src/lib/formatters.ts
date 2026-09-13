import { formatPercent, formatSilver } from './money'

export const UI_FRESHNESS_HOURS = 6

// Dinheiro é formatado pelo módulo decimal (F09) — o cliente não converte silver para
// `number`. `formatarSilver`/`formatarPct` são os nomes públicos usados por todo o app.
export const formatarSilver = formatSilver
export const formatarPct = formatPercent

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

// Nome de item (T4_SWORD@1 -> "Espada T4.1"), não de jogador (F11, task 3.5/19). Localização
// e categoria saíram daqui: `useLocationName` (@/lib/locations) e `traduzirCategoria`
// (@/i18n/categories).
export function formatarNomeItem(
  name: string | null | undefined,
  uniqueName: string,
) {
  return juntarNome(partesDoNomeItem(name, uniqueName))
}

/**
 * Nome e grau (`T4.1`) separados (pedido no uso, 2026-09-12). Colado no fim do nome, o grau era
 * cortado junto com ele — "Elmo de Soldado T..." escondia o que distingue uma linha da outra. A
 * tabela mostra o grau embaixo; o resto do app continua com o nome inteiro, montado daqui.
 */
export interface NomeEmPartes {
  nome: string
  /** `null` = o código não tem tier (`UNIQUE_…`) */
  grau: string | null
}

function juntarNome({ nome, grau }: NomeEmPartes): string {
  return grau ? `${nome} ${grau}` : nome
}

function grauDe(tier: string, enchantment: string | undefined): string {
  return `T${tier}${enchantment && Number(enchantment) > 0 ? `.${enchantment}` : ''}`
}

export function partesDoNomeItem(
  name: string | null | undefined,
  uniqueName: string,
): NomeEmPartes {
  const nome = (name || uniqueName).replace(/ do (Novato|Adepto|Perito|Mestre|Ancião)$/i, '')
  const match = uniqueName.match(/^T(\d+)(?:_[^@]+)?(?:@(\d+))?$/i)
  if (!match) return { nome, grau: null }
  const [, tier, enchantment] = match
  return { nome, grau: grauDe(tier!, enchantment) }
}

/**
 * Substantivo curto por família de recurso — bruto e refinado.
 *
 * O nome do jogo diz a espécie e o adjetivo de encantamento ("Minério de Titânio
 * Excepcional"), e **os dois já estão ditos** pelo tier e pelo `.3` que vêm logo depois. Numa
 * tabela de 15 colunas isso é a diferença entre ler a linha e não ler.
 *
 * A chave é a família no `unique_name`, não o texto localizado: `T5_ORE_LEVEL3@3` → `ORE`.
 * Assim o encurtamento não depende de idioma nem de como a Sandbox escreve o nome no próximo
 * patch. Cobre exatamente 248 itens — todo o refino e nada além dele (medido no banco).
 *
 * **Só para tabela.** Onde o item é o assunto — autocomplete, tela de Preços, gaveta de
 * detalhe — vale `formatarNomeItem`: ali o nome do jogo é o que a pessoa digitou e o que ela
 * confere. Encurtar equipamento nunca: "Espada" serve para dezenas de armas diferentes,
 * enquanto "Minério" é sempre a mesma coisa dentro do tier.
 */
const RECURSO_CURTO: Record<string, string> = {
  ORE: 'Minério',
  METALBAR: 'Barra',
  WOOD: 'Madeira',
  PLANKS: 'Tábua',
  FIBER: 'Fibra',
  CLOTH: 'Tecido',
  HIDE: 'Pelego',
  LEATHER: 'Couro',
  ROCK: 'Pedra',
  STONEBLOCK: 'Bloco',
}

export function formatarNomeCurto(
  name: string | null | undefined,
  uniqueName: string,
) {
  return juntarNome(partesDoNomeCurto(name, uniqueName))
}

/** `formatarNomeCurto` em partes — a coluna Item da tabela mostra o grau embaixo do nome. */
export function partesDoNomeCurto(
  name: string | null | undefined,
  uniqueName: string,
): NomeEmPartes {
  const match = uniqueName.match(/^T(\d+)_([A-Z]+)(?:_LEVEL\d+)?(?:@(\d+))?$/i)
  const familia = match?.[2]
  const curto = familia ? RECURSO_CURTO[familia.toUpperCase()] : undefined
  if (!match || !curto) return partesDoNomeItem(name, uniqueName)

  const [, tier, , enchantment] = match
  return { nome: curto, grau: grauDe(tier!, enchantment) }
}

export function formatarQualidade(value: number | null | undefined) {
  const labels = ['Normal', 'Bom', 'Excelente', 'Excepcional', 'Obra-prima']
  return value != null && value >= 1 && value <= labels.length
    ? labels[value - 1]
    : 'Qualidade desconhecida'
}
