import { ItemImage } from '@/components/ItemImage'
import { formatarIdade, formatarNomeCurto } from '@/lib/formatters'
import { add, formatPercent, formatQuantity, formatSilver } from '@/lib/money'

import type { ScannerRow } from './engine'
import type { ScannerColumn } from './ScannerTable'

/**
 * Colunas do scanner (task 4/11).
 *
 * Cada `cell` é **pura** — é por isso que elas são testáveis, e é onde o conteúdo da tabela é
 * verificado: a virtualização não pode ser exercitada em jsdom (`W4`), mas isto pode.
 *
 * Hierarquia da §2 de `13-linguagem-visual.md`: item, lucro e ROI em meio segundo (peso
 * primário); custo e receita ao ler a linha; taxas e modo em terciário.
 */

/** Traço, nunca zero. Ausência de preço não é preço zero — é a microcópia da §5 virada em código. */
const TRACO = '—'

const MOTIVO: Record<string, string> = {
  missing_ingredient_price: 'sem preço de ingrediente',
  missing_output_price: 'sem preço de venda',
  no_price: 'sem preço',
}

export function motivoSemPreco(row: ScannerRow): string | null {
  return row.state === 'priced' ? null : (MOTIVO[row.state] ?? 'sem preço')
}

/**
 * Coluna de um dos slots de ingrediente (task 4/11.2).
 *
 * Duas colunas fixas cobrem o refino inteiro: **105 das 110 receitas têm exatamente 2
 * ingredientes**, as outras 5 (T2) têm 1 — e a segunda coluna simplesmente fica vazia. O craft
 * (1 a 4 ingredientes variados) **não** cabe aqui; a task 12 precisa de outra forma.
 *
 * A quantidade exibida é a **de compra**, já multiplicada pela quantidade pedida e com o
 * retorno aplicado: pedir 1000 tecidos T5 mostra `Fibra T5 ×3000`.
 */
function colunaIngrediente(slot: number, nomeItem: NomeItem): ScannerColumn {
  return {
    key: `ing${slot}`,
    header: `Ingrediente ${slot + 1}`,
    width: 'minmax(11rem, 1fr)',
    cell: (row) => {
      const ingrediente = row.ingredients[slot]
      if (!ingrediente) return <span className="text-foreground-subtle">{TRACO}</span>
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <ItemImage
            uniqueName={ingrediente.item}
            size={64}
            className="size-6 shrink-0"
          />
          {/* Só o NOME encolhe. Antes o truncamento pegava nome e quantidade juntos, e o que
              sumia era justamente o número que manda comprar. */}
          <span className="min-w-0 truncate">{nomeItem(ingrediente.item)}</span>
          <span className="shrink-0 tabular-nums text-foreground-subtle">
            ×{ingrediente.purchaseQuantity.toLocaleString('pt-BR')}
          </span>
        </span>
      )
    },
  }
}

/** Subtotal do slot: o investimento naquele ingrediente para a quantidade pedida. */
function colunaSubtotal(slot: number): ScannerColumn {
  return {
    key: `sub${slot}`,
    header: `Investimento ${slot + 1}`,
    numeric: true,
    width: '8rem',
    cell: (row) => {
      const ingrediente = row.ingredients[slot]
      if (!ingrediente) return TRACO
      return ingrediente.subtotal ? formatSilver(ingrediente.subtotal) : TRACO
    },
  }
}

type NomeItem = (uniqueName: string) => string

/** Como o número foi feito. `imediata` executa na hora; `ordem` depende de a fila andar. */
const MODO_CURTO: Record<string, string> = {
  immediate: 'imediata',
  buy_order: 'ordem',
  sell_order: 'ordem',
}

/**
 * Resumo de todos os ingredientes numa coluna (task 4/12).
 *
 * O refino tem 2 ingredientes em 105 das 110 receitas, e por isso as colunas fixas
 * `Ingrediente 1/2` funcionam lá. O craft tem **de 1 a 4**, variados: um par de colunas por
 * ingrediente daria oito colunas para mostrar quatro números, quase sempre vazias. O detalhe
 * completo — preço unitário, procedência, subtotal — já está no painel expandido.
 */
function colunaIngredientes(nomeItem: NomeItem): ScannerColumn {
  return {
    key: 'ingredientes',
    header: 'Ingredientes',
    width: 'minmax(16rem, 1.6fr)',
    cell: (row) =>
      row.ingredients.length === 0 ? (
        TRACO
      ) : (
        <span className="truncate">
          {row.ingredients
            .map(
              (ingrediente) =>
                `${nomeItem(ingrediente.item)} ×${ingrediente.purchaseQuantity.toLocaleString('pt-BR')}`,
            )
            .join(' · ')}
        </span>
      ),
  }
}

/** O investimento do craft é a soma dos ingredientes — no refino cada um tem sua coluna. */
function colunaInvestimentoTotal(): ScannerColumn {
  return {
    key: 'investimento',
    header: 'Investimento',
    numeric: true,
    width: '9rem',
    cell: (row) => {
      const comPreco = row.ingredients.filter((i) => i.subtotal !== null)
      if (comPreco.length === 0) return TRACO
      const soma = add(...comPreco.map((i) => i.subtotal!))
      const falta = comPreco.length < row.ingredients.length

      return (
        <span className={falta ? 'text-foreground-subtle' : ''}>
          {formatSilver(soma)}
          {/* Somar só o que tem preço e não dizer nada seria um total que parece completo.
              O aviso é o que impede a soma parcial de virar decisão. */}
          {falta && (
            <span
              className="ml-1 text-danger"
              title={`${row.ingredients.length - comPreco.length} ingrediente(s) sem preço`}
            >
              *
            </span>
          )}
        </span>
      )
    },
  }
}

export interface OpcoesDeColuna {
  agora?: Date
  /**
   * Só quando a estratégia está em "melhor cenário". Com a estratégia travada na barra, a
   * coluna repetiria o que o controle já diz — e largura de tabela é cara.
   */
  mostrarEstrategia?: boolean
  /** `refino` tem 2 ingredientes fixos; `craft` tem de 1 a 4 e resume numa coluna só. */
  modo?: 'refino' | 'craft'
}

export function buildColumns(
  locationName: (id: string) => string,
  nomeItem: NomeItem,
  { agora = new Date(), mostrarEstrategia = false, modo = 'refino' }: OpcoesDeColuna = {},
): ScannerColumn[] {
  return [
    {
      key: 'item',
      header: 'Item',
      sortField: 'item',
      width: 'minmax(13rem, 1.4fr)',
      cell: (row, item) => (
        <span className="flex min-w-0 items-center gap-2">
          <ItemImage
            uniqueName={row.outputItem}
            size={64}
            className="size-7 shrink-0"
          />
          <span className="truncate font-medium">
            {formatarNomeCurto(item?.name_pt ?? item?.name_en, row.outputItem)}
          </span>
        </span>
      ),
    },
    {
      key: 'cidade',
      header: 'Cidade',
      width: 'minmax(7rem, 0.8fr)',
      cell: (row) => (
        <span className="truncate text-buy-side">{locationName(row.locationId)}</span>
      ),
    },
    ...(modo === 'craft'
      ? [colunaIngredientes(nomeItem), colunaInvestimentoTotal()]
      : [
          colunaIngrediente(0, nomeItem),
          colunaSubtotal(0),
          colunaIngrediente(1, nomeItem),
          colunaSubtotal(1),
        ]),
    {
      key: 'rendimento',
      header: 'Rendimento',
      numeric: true,
      width: '7rem',
      // Quantos itens saem no fim da sessão — as receitas compradas mais as que o retorno
      // paga. A pergunta é "vou terminar com quanto?", e ela não é a quantidade que se compra.
      cell: (row) => row.producedQuantity.toLocaleString('pt-BR'),
    },
    {
      key: 'custo',
      header: 'Custo total',
      sortField: 'totalCost',
      numeric: true,
      width: '8rem',
      cell: (row) => (row.totalCost ? formatSilver(row.totalCost) : TRACO),
    },
    {
      key: 'custoMedio',
      header: 'Custo/item',
      sortField: 'averageUnitCost',
      numeric: true,
      width: '8rem',
      // Custo de PRODUZIR um item: compra, taxa de montagem, prata da receita e estação,
      // dividido pelo que saiu. Não é o preço de equilíbrio — vender exatamente por isto ainda
      // perde o imposto de venda, que incide sobre o preço e não sobre o custo.
      cell: (row) => (row.averageUnitCost ? formatSilver(row.averageUnitCost) : TRACO),
    },
    {
      key: 'receita',
      header: 'Venda bruta',
      numeric: true,
      width: '8rem',
      cell: (row) => (row.grossRevenue ? formatSilver(row.grossRevenue) : TRACO),
    },
    {
      key: 'lucro',
      header: 'Lucro',
      sortField: 'profit',
      numeric: true,
      width: '8rem',
      weight: 'primary',
      cell: (row) => {
        const motivo = motivoSemPreco(row)
        if (motivo) {
          return (
            <span className="text-xs font-normal text-foreground-subtle">{motivo}</span>
          )
        }
        return (
          <span className={row.profit!.isNegative() ? 'text-danger' : 'text-profit'}>
            {formatSilver(row.profit)}
          </span>
        )
      },
    },
    {
      key: 'roi',
      header: 'ROI',
      sortField: 'roi',
      numeric: true,
      width: '6rem',
      weight: 'primary',
      cell: (row) =>
        row.roi ? (
          <span className={row.roi.isNegative() ? 'text-danger' : 'text-profit'}>
            {formatPercent(row.roi)}
          </span>
        ) : (
          TRACO
        ),
    },
    {
      key: 'lucroPorPeso',
      header: 'Lucro/kg',
      sortField: 'profitPerWeight',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.profitPerWeight ? formatQuantity(row.profitPerWeight, 0) : TRACO,
    },
    {
      key: 'lucroPorFoco',
      header: 'Lucro/foco',
      sortField: 'profitPerFocus',
      numeric: true,
      width: '7rem',
      cell: (row) =>
        row.profitPerFocus ? formatQuantity(row.profitPerFocus, 1) : TRACO,
    },
    {
      key: 'foco',
      header: 'Foco',
      numeric: true,
      width: '6rem',
      weight: 'tertiary',
      // Sem isto a tela dizia quanto rende POR ponto de foco e não quantos pontos custa —
      // metade da informação (retorno do uso real, item 6).
      cell: (row) =>
        row.focusConsumed > 0 ? row.focusConsumed.toLocaleString('pt-BR') : TRACO,
    },
    ...(mostrarEstrategia
      ? [
          {
            key: 'estrategia',
            header: 'Compra → venda',
            width: '9rem',
            weight: 'tertiary' as const,
            // A premissa do número, na linha. "Lucro 658" esconde que ele supõe a ordem de
            // compra E a de venda sendo aceitas — é a expectativa falsa da leitura por cima.
            cell: (row: ScannerRow) =>
              row.acquisitionMode && row.saleMode
                ? `${MODO_CURTO[row.acquisitionMode]} → ${MODO_CURTO[row.saleMode]}`
                : TRACO,
          },
        ]
      : []),
    {
      key: 'idade',
      header: 'Dado de',
      sortField: 'freshness',
      numeric: true,
      width: '7rem',
      weight: 'tertiary',
      // `Number.isFinite` e não só `!== null`: uma data impossível chegando aqui viraria
      // `RangeError` dentro do `toISOString()`, no meio do render — e formatar é apresentação,
      // que não pode derrubar produto. Foi assim que a tela inteira caiu no boundary.
      cell: (row) =>
        row.oldestObservedAt === null || !Number.isFinite(row.oldestObservedAt)
          ? TRACO
          : formatarIdade(
              new Date(row.oldestObservedAt * 1000).toISOString(),
              agora,
            ),
    },
    {
      key: 'fonte',
      header: 'Fonte',
      width: '5rem',
      weight: 'tertiary',
      cell: (row) => (row.sources.length ? row.sources.join(', ') : TRACO),
    },
  ]
}
