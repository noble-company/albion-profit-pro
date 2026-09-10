import { ItemImage } from '@/components/ItemImage'
import { formatarNomeCurto } from '@/lib/formatters'
import { formatPercent, formatQuantity, formatSilver } from '@/lib/money'

import { CardDeCompra } from './CardDeCompra'
import type { ScannerRow } from './engine'
import type { ScannerColumn } from './ScannerTable'
import { idadeDaCotacao, TRACO } from './tela'

/**
 * Colunas do scanner (task 4/11, enxugadas na 4/20).
 *
 * Cada `cell` é **pura** — é por isso que elas são testáveis, e é onde o conteúdo da tabela é
 * verificado: a virtualização não pode ser exercitada em jsdom (`W4`), mas isto pode.
 *
 * **Oito colunas, na ordem em que o jogador decide:** o que é, quanto custa, quanto entra,
 * quanto sobra, onde vende, o que compra, quanto foco gasta, quanto sai. O resto — custo por
 * item, lucro por kg e por foco, estratégia, fonte, comparação entre cidades — mora no painel
 * expandido. Antes eram até 16 colunas, e a tabela rolava para o lado.
 */

/**
 * Largura de um card da coluna Compra. A coluna inteira é `maxIngredientes × isto`: as linhas
 * são grids independentes que compartilham o mesmo `grid-template-columns`, então a largura tem
 * que ser fixa por tabela — largura por conteúdo desalinharia cada linha da de cima.
 */
const LARGURA_CARD_REM = 5.25

const MOTIVO: Record<string, string> = {
  missing_ingredient_price: 'sem preço de ingrediente',
  missing_output_price: 'sem preço de venda',
  no_price: 'sem preço',
}

export function motivoSemPreco(row: ScannerRow): string | null {
  return row.state === 'priced' ? null : (MOTIVO[row.state] ?? 'sem preço')
}

type NomeItem = (uniqueName: string) => string

export interface OpcoesDeColuna {
  agora?: Date
  /**
   * O maior número de ingredientes entre as receitas da tela. Define a largura da coluna Compra:
   * 2 no refino, até 4 no craft.
   */
  maxIngredientes?: number
}

export function buildColumns(
  locationName: (id: string) => string,
  nomeItem: NomeItem,
  { agora = new Date(), maxIngredientes = 2 }: OpcoesDeColuna = {},
): ScannerColumn[] {
  return [
    {
      key: 'item',
      header: 'Item',
      sortField: 'tier',
      width: 'minmax(12rem, 1.2fr)',
      cell: (row, item) => (
        <span className="flex min-w-0 items-center gap-2">
          <ItemImage uniqueName={row.outputItem} size={64} className="size-7 shrink-0" />
          {/* O nome já traz o `T4.2`, para recurso e equipamento. Sem selo de qualidade: não há
              controle de qualidade na barra, e a tabela inteira diria "Normal" em toda linha. */}
          <span className="truncate font-medium">
            {formatarNomeCurto(item?.name_pt ?? item?.name_en, row.outputItem)}
          </span>
        </span>
      ),
    },
    {
      key: 'investimento',
      header: 'Investimento',
      sortField: 'totalCost',
      numeric: true,
      width: '7.5rem',
      cell: (row) => (row.totalCost ? formatSilver(row.totalCost) : TRACO),
    },
    {
      key: 'vendaBruta',
      header: 'Venda bruta',
      numeric: true,
      width: '7.5rem',
      cell: (row) => (row.grossRevenue ? formatSilver(row.grossRevenue) : TRACO),
    },
    {
      key: 'lucro',
      header: 'Lucro',
      numeric: true,
      width: '7.5rem',
      weight: 'primary',
      // Prata e ROI dividem a célula, e cada um ordena por si. Duas colunas para dois números
      // que se leem juntos custariam largura que a tabela não tem.
      sortTargets: [
        { field: 'profit', label: 'Lucro' },
        { field: 'roi', label: '%' },
      ],
      cell: (row) => {
        const motivo = motivoSemPreco(row)
        if (motivo) {
          return (
            <span className="text-xs font-normal text-foreground-subtle">{motivo}</span>
          )
        }
        const cor = row.profit!.isNegative() ? 'text-danger' : 'text-profit'
        return (
          <span className="flex flex-col items-end leading-tight">
            <span className={cor}>{formatSilver(row.profit)}</span>
            <span className={`text-[0.6875rem] font-normal ${cor}`}>
              {row.roi ? formatPercent(row.roi) : TRACO}
            </span>
          </span>
        )
      },
    },
    {
      key: 'venda',
      header: 'Venda',
      width: '8.5rem',
      // Onde e por quanto. Com a cidade fora da linha (task 19), "Venda bruta" sozinha não
      // diria nenhum dos dois — é o card "MARTLOCK · P. VENDA 72" do app de referência.
      cell: (row) => {
        if (row.saleUnitPrice === null) {
          return <span className="text-foreground-subtle">{TRACO}</span>
        }
        const idade = idadeDaCotacao(row.saleObservedAt, agora)
        return (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs text-buy-side">
              {locationName(row.locationId)}
            </span>
            <span className="flex min-w-0 items-baseline gap-1 text-xs">
              <span className="tabular-nums text-foreground">
                {formatQuantity(row.saleUnitPrice, 0)}
              </span>
              <span className="truncate text-foreground-subtle">{idade ?? 'preço fixo'}</span>
            </span>
          </span>
        )
      },
    },
    {
      key: 'compra',
      header: 'Compra',
      width: `${Math.max(1, maxIngredientes) * LARGURA_CARD_REM}rem`,
      cell: (row) =>
        row.ingredients.length === 0 ? (
          TRACO
        ) : (
          <ul className="flex min-w-0 gap-1">
            {row.ingredients.map((ingrediente) => (
              <CardDeCompra
                key={ingrediente.item}
                ingrediente={ingrediente}
                nomeItem={nomeItem}
                agora={agora}
                largura={`${LARGURA_CARD_REM - 0.25}rem`}
              />
            ))}
          </ul>
        ),
    },
    {
      key: 'foco',
      header: 'Foco',
      numeric: true,
      width: '4.5rem',
      weight: 'tertiary',
      // Zero não é "0 de foco" — é não usar foco.
      cell: (row) =>
        row.focusConsumed > 0 ? row.focusConsumed.toLocaleString('pt-BR') : TRACO,
    },
    {
      key: 'rendimento',
      header: 'Rendimento',
      numeric: true,
      width: '5.5rem',
      // Quantos itens saem no fim da sessão — as receitas compradas mais as que o retorno
      // paga. A pergunta é "vou terminar com quanto?", e ela não é a quantidade que se compra.
      cell: (row) => row.producedQuantity.toLocaleString('pt-BR'),
    },
  ]
}
