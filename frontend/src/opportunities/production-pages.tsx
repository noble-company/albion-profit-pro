import { useMutation } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { RequireRealm } from '@/components/AppShell'
import { EstadoErro, EstadoVazio } from '@/components/ui/states'
import { DetailDrawer } from '@/components/opportunities/DetailDrawer'
import {
  fieldControl,
  fieldLabel,
  FilterFieldset,
  FilterNumber,
  FilterPanel,
  FilterSelect,
  FilterSortSelect,
  FilterToggle,
} from '@/components/opportunities/FilterPanel'
import { KpiCard } from '@/components/opportunities/KpiCard'
import {
  OpportunityTable,
  type OpportunityColumn,
} from '@/components/opportunities/OpportunityTable'
import { Pagination } from '@/components/opportunities/Pagination'
import { RankingCoverage } from '@/components/opportunities/RankingCoverage'
import { WarningBadges } from '@/components/opportunities/WarningBadges'
import { simulateCraft } from '@/craft/service'
import {
  formatarIdade,
  formatarNomeItem,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { MODE_LABELS } from '@/lib/craft-labels'
import { useLocationName } from '@/lib/locations'
import * as money from '@/lib/money'
import { applyProjection } from '@/lib/ranking-projection'
import { usePageVisible } from '@/lib/usePageVisible'
import { useLocations } from '@/prices/hooks'

import { useProductionOpportunities } from './hooks'
import { readProductionExtra } from './production-params'
import type { Opportunity, ProductionKind } from './service'
import { useOpportunityParams } from './useOpportunityParams'

type PageConfig = {
  kind: ProductionKind
  eyebrow: string
  title: string
  description: string
}

const KINDS: ReadonlyArray<{
  kind: ProductionKind
  label: string
  path: string
}> = [
  { kind: 'refining', label: 'Refino', path: '/refino' },
  { kind: 'crafting', label: 'Craft', path: '/craft' },
]

/** Alterna entre Refino e Craft carregando os filtros da URL (task 3.5/22 item 6). */
function KindToggle({ current }: { current: ProductionKind }) {
  const location = useLocation()
  return (
    <div
      role="tablist"
      aria-label="Tipo de produção"
      className="inline-flex rounded-lg border border-border-strong bg-background/50 p-0.5"
    >
      {KINDS.map((option) => {
        const active = option.kind === current
        return (
          <Link
            key={option.kind}
            role="tab"
            aria-selected={active}
            to={{ pathname: option.path, search: location.search }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-primary text-on-primary shadow'
                : 'text-foreground-subtle hover:text-foreground'
            }`}
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}

function ProductionRankingPage({ config }: { config: PageConfig }) {
  const { realm } = useServer()
  const allLocations = useLocations()
  const locations = allLocations.filter((row) => row.kind === 'city')
  const locationName = useLocationName()
  const pageVisible = usePageVisible()
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const detailMutation = useMutation({ mutationFn: simulateCraft })
  const { params, query, sortParam, setFilter, setOffset, reset } =
    useOpportunityParams(readProductionExtra)

  // Camada "e se" (task 23): premium/retorno/estação/foco NÃO entram na query do servidor —
  // ficam de fora da chave do TanStack, então mexer neles não dispara refetch.
  const {
    premium,
    returnRate,
    stationCostPerExecution,
    useFocus,
    ...serverQuery
  } = query
  const projectionParams = useMemo(
    () => ({ premium, returnRate, stationCostPerExecution, useFocus }),
    [premium, returnRate, stationCostPerExecution, useFocus],
  )

  const result = useProductionOpportunities(config.kind, realm, serverQuery, {
    pausePolling: selected != null,
  })
  // O servidor ordena e pagina sobre o ranking completo (F08); o cliente recalcula os
  // valores da página quando os controles "e se" mudam — sem requisição.
  const rows = useMemo(
    () =>
      (result.data?.opportunities ?? []).map((row) =>
        applyProjection(row, projectionParams),
      ),
    [result.data?.opportunities, projectionParams],
  )
  const coverage = result.data?.coverage

  if (!realm) {
    return (
      <RequireRealm>
        <span />
      </RequireRealm>
    )
  }

  const best = rows[0]

  const openDetail = (row: Opportunity) => {
    if (!row.buy_location) return
    setSelected(row)
    // useMutation zera data/error ao entrar em 'pending' — a linha anterior nunca aparece.
    detailMutation.mutate({
      server: realm,
      output_item: row.item,
      location_id: row.buy_location,
      quantity: 1,
      // Reflete o filtro de qualidade da tela (item 5), não um valor fixo.
      output_quality: query.quality ?? row.quality_level ?? 1,
      scope: 'all',
      return_rate: query.returnRate,
      station_fee_per_100_nutrition: query.stationCostPerExecution,
      use_focus: query.useFocus,
      premium: query.premium,
      sales_tax_rate: null,
      setup_fee_rate: null,
      ingredient_overrides: {},
      manual_prices: {},
    })
  }

  const columns: OpportunityColumn[] = [
    {
      header: 'Saída',
      sticky: 'left',
      width: '13rem',
      className: 'whitespace-normal',
      cell: (row) => (
        <div>
          <strong className="text-foreground">
            {formatarNomeItem(row.item_name, row.item)}
          </strong>
          <div className="mt-0.5 text-xs font-normal text-foreground-subtle">
            {formatarQualidade(row.quality_level)}
          </div>
          <WarningBadges warnings={row.warnings} className="mt-1" />
        </div>
      ),
    },
    {
      header: 'Receita',
      width: '15rem',
      className: 'whitespace-normal text-xs',
      cell: (row) => {
        const ingredients = row.ingredients ?? []
        if (ingredients.length === 0) return '—'
        return (
          <ul className="space-y-0.5">
            {ingredients.map((ingredient) => {
              const hasReturn = money.isPositive(
                ingredient.expected_return_quantity,
              )
              return (
                <li key={ingredient.item}>
                  {formatarNomeItem(ingredient.item_name, ingredient.item)}{' '}
                  <span className="tabular-nums">
                    ×{ingredient.purchase_quantity}
                  </span>
                  {hasReturn && (
                    <span className="text-profit">
                      {' '}
                      · retorno{' '}
                      {money.formatQuantity(
                        ingredient.expected_return_quantity,
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )
      },
    },
    {
      header: 'Cidade',
      className: 'font-medium text-buy-side',
      cell: (row) => locationName(row.buy_location),
    },
    {
      header: 'Cenário',
      className: 'text-xs text-foreground',
      cell: (row) =>
        `${MODE_LABELS[row.acquisition_mode ?? ''] ?? '—'} → ${MODE_LABELS[row.sale_mode ?? ''] ?? '—'}`,
    },
    {
      header: 'Custo',
      numeric: true,
      cell: (row) => formatarSilver(row.total_cost),
    },
    {
      header: 'Venda bruta',
      numeric: true,
      cell: (row) => formatarSilver(row.gross_revenue),
    },
    {
      header: 'Estação',
      numeric: true,
      weight: 'tertiary',
      cell: (row) => formatarSilver(row.station_cost),
    },
    {
      header: 'Lucro',
      numeric: true,
      weight: 'primary',
      sticky: 'right',
      width: '7rem',
      className: 'text-profit',
      cell: (row) => formatarSilver(row.profit),
    },
    {
      header: 'ROI',
      numeric: true,
      weight: 'primary',
      sticky: 'right',
      width: '5.5rem',
      className: 'text-profit',
      cell: (row) => formatarPct(row.roi),
    },
    {
      header: 'Detalhes',
      sticky: 'right',
      width: '6rem',
      cell: (row) => (
        <button
          type="button"
          className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:border-primary hover:bg-primary/20"
          onClick={() => openDetail(row)}
        >
          Analisar
        </button>
      ),
    },
  ]

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            {config.eyebrow} · {realm}
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
            {config.title}
          </h1>
          <p className="mt-2 max-w-2xl text-foreground-muted">
            {config.description}
          </p>
        </div>
        {pageVisible && (
          <div className="flex items-center gap-2 rounded-full border border-profit/20 bg-profit/5 px-3 py-1.5 text-xs font-medium text-profit shadow-lg shadow-black/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
            </span>
            Atualização automática · 30s
          </div>
        )}
      </header>

      <KindToggle current={config.kind} />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Oportunidades encontradas"
          value={String(result.data?.total ?? '—')}
          tone="primary"
        />
        <KpiCard
          label="Melhor lucro"
          value={formatarSilver(best?.profit ?? null)}
          tone="profit"
        />
        <KpiCard
          label="Última observação"
          value={
            best?.oldest_observed_at
              ? formatarIdade(best.oldest_observed_at)
              : '—'
          }
          tone="info"
        />
      </div>

      {coverage && <RankingCoverage coverage={coverage} />}

      <FilterPanel
        title="Configure seu cenário"
        description="Os resultados são recalculados com os valores escolhidos abaixo."
        onClear={reset}
      >
        <FilterFieldset accent="primary" legend="Mercado">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className={fieldLabel}>
              Cidade
              <select
                aria-label="Cidade"
                className={fieldControl}
                value={query.locations[0] ?? ''}
                onChange={(event) =>
                  setFilter('location_id', event.target.value)
                }
              >
                <option value="">Todas</option>
                {locations.map((location) => (
                  <option
                    key={location.location_id}
                    value={location.location_id}
                  >
                    {locationName(location.location_id)}
                  </option>
                ))}
              </select>
            </label>
            <FilterSelect
              label="Tier"
              value={params.get('tier') ?? ''}
              onChange={(v) => setFilter('tier', v)}
              options={['2', '3', '4', '5', '6', '7', '8']}
            />
            <FilterSelect
              label="Encantamento"
              value={params.get('enchantment') ?? ''}
              onChange={(v) => setFilter('enchantment', v)}
              options={['0', '1', '2', '3', '4']}
            />
            <FilterSelect
              label="Qualidade"
              value={params.get('quality') ?? ''}
              onChange={(v) => setFilter('quality', v)}
              options={['1', '2', '3', '4', '5']}
              labels={[
                'Normal',
                'Bom',
                'Excelente',
                'Excepcional',
                'Obra-prima',
              ]}
            />
            <FilterSelect
              label="Frescor máximo"
              value={params.get('freshness') ?? '6'}
              onChange={(v) => setFilter('freshness', v)}
              options={['1', '2', '6']}
              suffix="h"
            />
            <FilterNumber
              label="Retorno de recurso (%)"
              value={params.get('return_rate') ?? '0'}
              onChange={(v) => setFilter('return_rate', v)}
            />
          </div>
        </FilterFieldset>

        <FilterFieldset accent="buy-side" legend="Custos e metas">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterNumber
              label="Estação por execução"
              value={params.get('station_cost') ?? '0'}
              onChange={(v) => setFilter('station_cost', v)}
            />
            <FilterNumber
              label="Lucro mínimo"
              value={params.get('min_profit') ?? ''}
              onChange={(v) => setFilter('min_profit', v)}
              placeholder="0"
            />
            <FilterNumber
              label="ROI mínimo"
              value={params.get('min_roi') ?? ''}
              onChange={(v) => setFilter('min_roi', v)}
              placeholder="0%"
            />
            <FilterSortSelect
              value={sortParam}
              onChange={(v) => setFilter('sort', v)}
            />
          </div>
        </FilterFieldset>

        <FilterFieldset accent="sell-side" legend="Preferências">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterToggle
              label="Conta Premium"
              description="Imposto de venda reduzido para 4%"
              checked={query.premium}
              onChange={(checked) =>
                setFilter('premium', checked ? '' : 'false')
              }
            />
            <FilterToggle
              label="Usar foco"
              description="Inclui o consumo de foco da receita"
              checked={query.useFocus}
              onChange={(checked) => setFilter('focus', checked ? 'true' : '')}
            />
            <FilterToggle
              label="Cobertura completa"
              description="Oculta resultados com dados parciais"
              checked={query.requireComplete}
              onChange={(checked) =>
                setFilter('coverage', checked ? 'complete' : '')
              }
            />
            <FilterToggle
              label="Apenas com lucro"
              description="Remove resultados com lucro negativo"
              checked={query.profitOnly}
              onChange={(checked) =>
                setFilter('profit_only', checked ? '' : 'false')
              }
            />
          </div>
        </FilterFieldset>
      </FilterPanel>

      {Boolean(result.error) && !result.data ? (
        <EstadoErro
          title={`Não foi possível carregar ${config.eyebrow.toLowerCase()}`}
        />
      ) : !result.loading && rows.length === 0 ? (
        <EstadoVazio
          title="Nenhuma oportunidade encontrada"
          icon={<TrendingUp className="size-6" />}
        >
          Não há receita com preços suficientes para estes filtros. Isso não
          representa lucro zero. Experimente aumentar o frescor ou limpar os
          filtros.
        </EstadoVazio>
      ) : (
        <OpportunityTable
          title="Ranking atual"
          description="Cenário mais lucrativo encontrado para cada receita"
          caption="Ranking de produção"
          rows={rows}
          columns={columns}
          loading={result.loading && !result.data}
          minWidth="76rem"
          rowKey={(row) =>
            `${row.kind}-${row.item}-${row.quality_level}-${row.buy_location}`
          }
        />
      )}
      <Pagination
        offset={query.offset}
        limit={query.limit}
        total={result.data?.total ?? 0}
        onOffsetChange={setOffset}
      />

      <DetailDrawer
        row={selected}
        result={detailMutation.data ?? null}
        loading={detailMutation.isPending}
        error={detailMutation.error}
        open={selected != null}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
      />
    </section>
  )
}

export function RefiningRankingPage() {
  return (
    <ProductionRankingPage
      config={{
        kind: 'refining',
        eyebrow: 'Refino',
        title: 'O que vale a pena refinar',
        description:
          'Compare custo dos recursos, retorno, estação e venda do material refinado.',
      }}
    />
  )
}

export function CraftingRankingPage() {
  return (
    <ProductionRankingPage
      config={{
        kind: 'crafting',
        eyebrow: 'Craft',
        title: 'O que vale a pena fabricar',
        description:
          'Encontre itens craftáveis com maior lucro usando os preços atuais do mercado.',
      }}
    />
  )
}
