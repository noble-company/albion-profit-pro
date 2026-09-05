import { useMutation } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { useState } from 'react'

import { useServer } from '@/app/ServerContext'
import { RequireRealm } from '@/components/AppShell'
import { Carregando, EstadoErro } from '@/components/ui/states'
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
import { WarningBadges } from '@/components/opportunities/WarningBadges'
import { simulateCraft } from '@/craft/service'
import {
  formatarIdade,
  formatarNomeItem,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { useLocationName } from '@/lib/locations'
import * as money from '@/lib/money'
import { useLocations } from '@/prices/hooks'

import { MODE_LABELS } from './labels'
import { useProductionOpportunities } from './hooks'
import type { Opportunity, ProductionKind } from './service'
import { useOpportunityParams } from './useOpportunityParams'

type PageConfig = {
  kind: ProductionKind
  eyebrow: string
  title: string
  description: string
}

function percentageToRate(value: string) {
  if (!value) return '0'
  const numeric = Number(value.replace(',', '.'))
  return Number.isFinite(numeric) ? String(numeric / 100) : '0'
}

function readProductionExtra(params: URLSearchParams) {
  return {
    returnRate: percentageToRate(params.get('return_rate') || '0'),
    stationCostPerExecution: params.get('station_cost') || '0',
    useFocus: params.get('focus') === 'true',
  }
}

function formatQuantity(value: string | number) {
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : '—'
}

function ProductionRankingPage({ config }: { config: PageConfig }) {
  const { realm } = useServer()
  const allLocations = useLocations()
  const locations = allLocations.filter((row) => row.kind === 'city')
  const locationName = useLocationName()
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const detailMutation = useMutation({ mutationFn: simulateCraft })
  const { params, query, sortParam, setFilter, setOffset, reset } =
    useOpportunityParams(readProductionExtra)

  const result = useProductionOpportunities(config.kind, realm, query, {
    pausePolling: selected != null,
  })
  // O servidor ordena e pagina sobre o ranking completo (F08).
  const rows = result.data?.opportunities ?? []

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
      output_quality: row.quality_level ?? 1,
      scope: 'all',
      return_rate: query.returnRate,
      station_cost_per_execution: query.stationCostPerExecution,
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
      cell: (row) => (
        <>
          <strong className="text-foreground">
            {formatarNomeItem(row.item_name, row.item)}
          </strong>
          <div className="mt-1 text-xs text-foreground-subtle">
            {formatarQualidade(row.quality_level)}
          </div>
          <WarningBadges warnings={row.warnings} className="mt-1" />
        </>
      ),
    },
    {
      header: 'Entradas',
      cellClassName: 'p-4 text-xs',
      cell: (row) =>
        (row.ingredients ?? []).length > 0
          ? (row.ingredients ?? []).map((ingredient) => (
              <div key={ingredient.item}>
                {formatarNomeItem(ingredient.item_name, ingredient.item)} ×{' '}
                {ingredient.purchase_quantity}
              </div>
            ))
          : '—',
    },
    {
      header: 'Cidade',
      cellClassName: 'p-4 font-medium text-buy-side',
      cell: (row) => locationName(row.buy_location),
    },
    {
      header: 'Cenário',
      cellClassName: 'p-4 text-xs text-foreground',
      cell: (row) =>
        `${MODE_LABELS[row.acquisition_mode ?? ''] ?? '—'} → ${MODE_LABELS[row.sale_mode ?? ''] ?? '—'}`,
    },
    {
      header: 'Custo',
      cellClassName: 'p-4 font-semibold text-foreground',
      cell: (row) => formatarSilver(row.total_cost),
    },
    {
      header: 'Venda bruta',
      cellClassName: 'p-4 font-semibold text-buy-side',
      cell: (row) => formatarSilver(row.gross_revenue),
    },
    {
      header: 'Retorno',
      cellClassName: 'p-4 text-xs',
      cell: (row) =>
        (row.ingredients ?? []).some((ingredient) =>
          money.isPositive(ingredient.expected_return_quantity),
        )
          ? (row.ingredients ?? [])
              .filter((ingredient) =>
                money.isPositive(ingredient.expected_return_quantity),
              )
              .map((ingredient) => (
                <div key={ingredient.item}>
                  {formatarNomeItem(ingredient.item_name, ingredient.item)} ×{' '}
                  {formatQuantity(ingredient.expected_return_quantity)}
                </div>
              ))
          : '—',
    },
    {
      header: 'Estação',
      cell: (row) => formatarSilver(row.station_cost),
    },
    {
      header: 'Lucro',
      cell: (row) => (
        <strong className="whitespace-nowrap rounded-lg border border-profit/10 bg-profit/10 px-2.5 py-1.5 text-profit">
          {formatarSilver(row.profit)}
        </strong>
      ),
    },
    {
      header: 'ROI',
      cellClassName: 'p-4 text-profit',
      cell: (row) => formatarPct(row.roi),
    },
    {
      header: 'Detalhes',
      cell: (row) => (
        <button
          type="button"
          className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:border-primary hover:bg-primary/20"
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
        <div className="flex items-center gap-2 rounded-full border border-profit/20 bg-profit/5 px-3 py-1.5 text-xs font-medium text-profit shadow-lg shadow-black/20">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
          </span>
          Atualização automática · 30s
        </div>
      </header>

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

      {result.data?.coverage && (
        <p
          className={`text-xs ${
            result.data.coverage.stale
              ? 'text-primary'
              : 'text-foreground-subtle'
          }`}
        >
          Ranking cobre {result.data.coverage.priced_recipes} receitas com preço
          de {result.data.coverage.evaluated_recipes} avaliadas ·{' '}
          {result.data.coverage.total_recipes} receitas no total
          {result.data.coverage.computed_at
            ? ` · recalculado ${formatarIdade(result.data.coverage.computed_at)}`
            : ' · ainda não calculado'}
          {result.data.coverage.stale ? ' · desatualizado' : ''}
        </p>
      )}

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
              options={['1', '2', '6', '12', '24']}
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

      {result.loading && !result.data && (
        <Carregando
          label={`Calculando ranking de ${config.eyebrow.toLowerCase()}…`}
        />
      )}
      {Boolean(result.error) && !result.data && (
        <EstadoErro
          title={`Não foi possível carregar ${config.eyebrow.toLowerCase()}`}
        />
      )}
      {!result.loading && !result.error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong/80 bg-gradient-to-b from-surface/40 to-background px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-surface text-foreground-muted">
            <TrendingUp className="size-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-bold text-foreground">
            Nenhuma oportunidade encontrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-foreground-subtle">
            Não há receita com preços suficientes para estes filtros. Isso não
            representa lucro zero. Experimente aumentar o frescor ou limpar os
            filtros.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <OpportunityTable
          title="Ranking atual"
          description="Cenário mais lucrativo encontrado para cada receita"
          caption="Ranking de produção"
          rows={rows}
          columns={columns}
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

      {selected && (
        <DetailDrawer
          row={selected}
          result={detailMutation.data ?? null}
          loading={detailMutation.isPending}
          error={detailMutation.error}
          onClose={() => setSelected(null)}
        />
      )}
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
