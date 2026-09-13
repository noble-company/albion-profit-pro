import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ChevronRight, Inbox } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'

import type { components } from '@/api/schema'
import { useEscalaAtual } from '@/app/escala'
import { EstadoVazio } from '@/components/ui/states'

import { ALTURA_DA_LINHA_REM, alturaDaLinhaPx, emEscala } from './altura'
import type { ScannerRow } from './engine'
import { CAMPOS_ESTRUTURAIS, type SortField, type SortState } from './sorting'

/**
 * Tabela do scanner (task 4/10).
 *
 * **Virtualizada, não paginada.** Paginar aqui reintroduziria o problema da fase: a página
 * vira o universo, e ordenar/filtrar sobre ela mente (`F08`). O conjunto inteiro fica em
 * memória, já calculado; só as ~30 linhas visíveis existem no DOM.
 *
 * Densidade e hierarquia seguem `docs/13-linguagem-visual.md` §1-2: número à direita com
 * `tabular-nums`, cabeçalho fixo, lucro e ROI com peso primário. A linha é a exceção da §1:
 * `3.5rem`, para o nome em 2 linhas com o grau embaixo.
 */

type CatalogItem = components['schemas']['CatalogItemOut']

export interface ScannerColumn {
  key: string
  header: string
  /** ordena por este campo quando o cabeçalho é clicado; ausente = coluna não ordenável */
  sortField?: SortField
  /**
   * Vários alvos no mesmo cabeçalho (task 4/20) — "Lucro" e "%" dividem a coluna. Quando
   * presente, substitui `sortField`: cada rótulo vira um botão que ordena pelo seu campo.
   */
  sortTargets?: ReadonlyArray<{ field: SortField; label: string }>
  numeric?: boolean
  width: string
  weight?: 'primary' | 'tertiary'
  cell: (row: ScannerRow, item: CatalogItem | undefined) => ReactNode
}

/** O cabeçalho continua numa linha só — `h-11` da §1. A linha mora em `altura.ts`. */
const ALTURA_DO_CABECALHO_REM = 2.75
const OVERSCAN = 8

/**
 * A primeira coluna gruda na esquerda: com 15 colunas, rolar até "Lucro/foco" tirava o nome do
 * item da tela e o número perdia o dono.
 *
 * `-ml-3 pl-3` come o `px-3` da linha, para a célula encostar na borda ao grudar sem que o
 * texto pule 12 px. O `z-10` fica **abaixo** do `z-20` do cabeçalho, senão a célula fixa do
 * corpo passaria por cima dele ao rolar.
 */
export const CELULA_FIXA = 'sticky left-0 z-10 -ml-3 pl-3'

/**
 * Identidade da linha na tabela — a mesma chave do React e do estado de expansão.
 *
 * **Só o item.** Desde a task 19 a tabela tem uma linha por receita, e a cidade é um atributo
 * que muda: fixar o preço de venda empata todas as cidades e a "melhor" vira outra. Com a
 * cidade na chave, o painel aberto fechava na cara de quem acabou de clicar em Fixar.
 */
export function rowKey(row: ScannerRow): string {
  return row.outputItem
}

export function ScannerTable({
  rows,
  columns,
  items,
  sort,
  onSortChange,
  loading,
  emptyHint,
  expandedKey,
  onToggleRow,
  renderDetail,
}: {
  rows: ScannerRow[]
  columns: ScannerColumn[]
  items: Map<string, CatalogItem>
  sort: SortState
  onSortChange: (sort: SortState) => void
  loading?: boolean
  emptyHint?: ReactNode
  /** uma linha aberta por vez: o painel é grande, e dois abertos viram rolagem sem fim */
  expandedKey?: string | null
  onToggleRow?: (key: string) => void
  renderDetail?: (row: ScannerRow) => ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * A altura medida pertence à **linha**, não à posição dela.
   *
   * Sem isto, `@tanstack/react-virtual` guarda a medida com a chave padrão, que é o índice
   * (`defaultKeyExtractor = (index) => index`). Enquanto a lista não muda, índice e linha são a
   * mesma coisa e tudo funciona. Mas basta a ordenação mexer — e ela mexe sozinha, porque fixar
   * um preço muda o lucro e a tabela ordena por lucro — para a linha aberta trocar de posição
   * levando o painel junto e **deixando a altura para trás**: a posição nova diz "44 px", as
   * linhas seguintes sobem, e o painel fica por baixo delas. Foi exatamente o que apareceu ao
   * fixar um preço de venda com filtros ligados.
   */
  const getItemKey = useCallback(
    (index: number) => {
      const row = rows[index]
      return row ? rowKey(row) : index
    },
    [rows],
  )

  /** O Tamanho do conteúdo: o virtualizador fala em px e não lê o `--escala` do CSS. */
  const escala = useEscalaAtual()

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => alturaDaLinhaPx(escala),
    getItemKey,
    overscan: OVERSCAN,
    // Retângulo de partida, antes da primeira medição real: sem ele o primeiro frame sai com
    // a tabela vazia. (Não ajuda em jsdom, que não faz layout — lá o virtualizador não
    // renderiza linha nenhuma de qualquer jeito; ver ScannerTable.test.tsx.)
    initialRect: { width: 1200, height: 600 },
  })

  // Trocar o Tamanho muda a altura de toda linha, inclusive das que o virtualizador ainda não
  // mediu e guardou pela estimativa antiga.
  useEffect(() => {
    virtualizer.measure()
  }, [escala, virtualizer])

  const gridTemplate = useMemo(
    () => columns.map((column) => column.width).join(' '),
    [columns],
  )

  // Campo novo começa pelo lado útil: lucro do maior para o menor, tier do T2 ao T8.
  const toggleSort = (field: SortField) => {
    onSortChange(
      sort.field === field
        ? { field, direction: sort.direction === 'desc' ? 'asc' : 'desc' }
        : { field, direction: CAMPOS_ESTRUTURAIS.has(field) ? 'asc' : 'desc' },
    )
  }

  if (!loading && rows.length === 0) {
    return (
      <EstadoVazio
        title="Nenhuma receita corresponde aos filtros"
        icon={<Inbox className="size-6" />}
      >
        {emptyHint ??
          'Ajuste os filtros à esquerda. Ausência de resultado aqui é o filtro, não o mercado.'}
      </EstadoVazio>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {/* `w-max min-w-full`: a largura da tabela é a soma das colunas (a soma dos mínimos passa
            de 1900 px), mas nunca menor que a área visível — assim as colunas `1fr` ainda esticam
            numa tela larga. Quem define essa largura é o cabeçalho: as linhas são absolutas e não
            entram no cálculo intrínseco. */}
        <div className="w-max min-w-full">
          {/* Dentro da área rolável, e não fora: fora dela as linhas andavam para o lado e o
              cabeçalho ficava parado, e cada rótulo passava a descrever a coluna do vizinho.
              `sticky top-0` + `z-10` é o que segura a vertical — o `z` importa porque as linhas
              vêm depois no DOM e passariam por cima. */}
          <div
            role="row"
            className="sticky top-0 z-20 grid items-center gap-2 border-b border-border bg-surface-raised px-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle"
            style={{ gridTemplateColumns: gridTemplate, height: emEscala(ALTURA_DO_CABECALHO_REM) }}
          >
            {columns.map((column, index) => {
              const alvos =
                column.sortTargets ??
                (column.sortField ? [{ field: column.sortField, label: column.header }] : [])
              const active = alvos.some((alvo) => alvo.field === sort.field)
              const Icon = sort.direction === 'desc' ? ArrowDown : ArrowUp
              return (
                <div
                  key={column.key}
                  role="columnheader"
                  aria-sort={
                    active
                      ? sort.direction === 'desc'
                        ? 'descending'
                        : 'ascending'
                      : undefined
                  }
                  className={`${column.numeric ? 'text-right' : 'text-left'} ${
                    index === 0 ? `${CELULA_FIXA} bg-surface-raised` : ''
                  }`}
                >
                  {alvos.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      {alvos.map((alvo, i) => {
                        const ativo = alvo.field === sort.field
                        return (
                          <Fragment key={alvo.field}>
                            {i > 0 && (
                              <span aria-hidden="true" className="h-3 w-px bg-border-strong" />
                            )}
                            {/* `uppercase` explícito: o preflight do Tailwind zera
                                `text-transform` em botão, e o rótulo ordenável
                                saía em minúsculas ao lado dos outros. */}
                            <button
                              type="button"
                              onClick={() => toggleSort(alvo.field)}
                              className={`inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-foreground ${
                                ativo ? 'text-primary' : ''
                              }`}
                            >
                              {alvo.label}
                              {ativo && <Icon className="size-3" aria-hidden="true" />}
                            </button>
                          </Fragment>
                        )
                      })}
                    </span>
                  ) : (
                    column.header
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              const item = items.get(row.outputItem)
              const semPreco = row.state !== 'priced'
              const chave = rowKey(row)
              const aberta = expandedKey === chave

              return (
                <div
                  key={chave}
                  // `data-index` + `measureElement`: é assim que o virtualizador aprende a
                  // altura real de uma linha aberta. Sem altura fixa aqui, de propósito.
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div
                    role="row"
                    // `group`: a célula fixa tem fundo próprio (senão o conteúdo passaria por
                    // baixo dela), e sem isto ela ficaria de fora do realce da linha inteira.
                    className={`group grid w-full items-center gap-2 border-b border-border/60 px-3 text-sm transition-colors hover:bg-surface-raised ${
                      semPreco ? 'text-foreground-subtle' : 'text-foreground'
                    } ${aberta ? 'bg-surface-raised' : ''}`}
                    style={{
                      gridTemplateColumns: gridTemplate,
                      height: emEscala(ALTURA_DA_LINHA_REM),
                    }}
                  >
                    {columns.map((column, index) => (
                      <div
                        key={column.key}
                        role="cell"
                        className={`min-w-0 ${index === 0 ? '' : 'truncate'} ${
                          column.numeric ? 'text-right tabular-nums' : 'text-left'
                        } ${column.weight === 'primary' ? 'font-semibold' : ''} ${
                          column.weight === 'tertiary' ? 'text-foreground-subtle' : ''
                        } ${
                          index === 0
                            ? `${CELULA_FIXA} flex items-center gap-1 bg-surface group-hover:bg-surface-raised`
                            : ''
                        }`}
                      >
                        {index === 0 ? (
                          <>
                            {onToggleRow && (
                              <button
                                type="button"
                                aria-expanded={aberta}
                                aria-label={aberta ? 'Fechar detalhes' : 'Abrir detalhes'}
                                onClick={() => onToggleRow(chave)}
                                className="shrink-0 rounded p-0.5 text-foreground-subtle transition hover:text-foreground"
                              >
                                <ChevronRight
                                  className={`size-4 transition-transform ${
                                    aberta ? 'rotate-90' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                              </button>
                            )}
                            {/* Sem `truncate` aqui: ele forçava uma linha só, e o nome agora
                                quebra em até 2 (pedido no uso, 2026-09-12). Quem corta é a
                                própria célula, com `line-clamp-2`; `min-w-0` deixa encolher. */}
                            <span className="min-w-0 flex-1">
                              {column.cell(row, item)}
                            </span>
                          </>
                        ) : (
                          column.cell(row, item)
                        )}
                      </div>
                    ))}
                  </div>

                  {aberta && renderDetail && (
                    <div className="border-b border-border bg-surface-raised/40 px-3 py-3">
                      {renderDetail(row)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
