import { ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { RequireRealm } from '@/components/AppShell'
import { Carregando, EstadoErro } from '@/components/ui/states'
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
import { traduzirCategoria } from '@/i18n/categories'
import {
  formatarIdade,
  formatarNomeItem,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { useLocationName, useMarketToggles } from '@/lib/locations'
import * as money from '@/lib/money'

import { useCategories, useFlipOpportunities } from './hooks'
import { useOpportunityParams } from './useOpportunityParams'

function readFlipExtra(params: URLSearchParams) {
  return {
    category: params.get('category') || undefined,
    subcategory: params.get('subcategory') || undefined,
    subcategory2: params.get('subcategory2') || undefined,
    subcategory3: params.get('subcategory3') || undefined,
    buyOrder: params.get('buy_order') === 'true',
    sellOrder: params.get('sell_order') === 'true',
  }
}

function DashboardContent() {
  const { realm } = useServer()
  const categories = useCategories()
  const marketToggles = useMarketToggles()
  const locationName = useLocationName()
  const {
    params,
    query,
    sortParam,
    setFilter,
    setOffset,
    setLocations,
    reset,
  } = useOpportunityParams(readFlipExtra)

  const result = useFlipOpportunities(realm, query)
  // O servidor já ordena e pagina sobre o conjunto completo (F08) — nada de reordenar a
  // página aqui.
  const rows = result.data?.opportunities ?? []
  if (!realm)
    return (
      <RequireRealm>
        <DashboardIntro />
      </RequireRealm>
    )
  const totalProfit = money
    .add(...rows.map((row) => row.profit ?? '0'))
    .toString()

  const toggleCity = (cityIds: readonly string[]) => {
    const selected = query.locations
    const allSelected = cityIds.every((id) => selected.includes(id))
    setLocations(
      allSelected
        ? selected.filter((value) => !cityIds.includes(value))
        : [...selected, ...cityIds.filter((id) => !selected.includes(id))],
    )
  }

  const columns: OpportunityColumn[] = [
    {
      header: 'Item',
      cell: (row) => (
        <Link
          className="font-bold text-foreground transition hover:text-primary"
          to={`/calculadora?item=${encodeURIComponent(row.item)}`}
        >
          {formatarNomeItem(row.item_name, row.item)}
        </Link>
      ),
    },
    {
      header: 'Qualidade',
      cellClassName: 'p-4 font-medium text-foreground',
      cell: (row) => formatarQualidade(row.quality_level),
    },
    {
      header: 'Compra unit.',
      cell: (row) => (
        <>
          <strong className="text-foreground">
            {formatarSilver(row.buy_price)}
          </strong>
          <div className="mt-0.5 text-xs font-medium text-buy-side">
            {locationName(row.buy_location)}
          </div>
        </>
      ),
    },
    {
      header: 'Venda unit.',
      cell: (row) => (
        <>
          <strong className="text-foreground">
            {formatarSilver(row.sell_price)}
          </strong>
          <div className="mt-0.5 text-xs font-medium text-sell-side">
            {locationName(row.sell_location)}
          </div>
        </>
      ),
    },
    {
      header: 'Investimento',
      cellClassName: 'p-4 font-semibold text-primary',
      cell: (row) => formatarSilver(row.total_cost),
    },
    {
      header: 'Faturamento',
      cellClassName: 'p-4 font-semibold text-buy-side',
      cell: (row) => formatarSilver(row.gross_revenue),
    },
    {
      header: 'Taxas',
      cellClassName: 'p-4 text-foreground-muted',
      cell: (row) => formatarSilver(row.total_fees),
    },
    {
      header: 'Qtd.',
      cellClassName: 'p-4 font-semibold text-foreground',
      cell: (row) => row.quantity,
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
      cellClassName: 'p-4 font-medium text-profit',
      cell: (row) => formatarPct(row.roi),
    },
  ]

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Market Flip · {realm}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Encontre o próximo lucro
          </h1>
          <p className="mt-2 text-foreground-muted">
            Compre barato em uma cidade. Venda caro em outra.
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
          label="Lucro na página"
          value={formatarSilver(totalProfit)}
          tone="profit"
        />
        <KpiCard
          label="Ofertas encontradas"
          value={String(result.data?.total ?? '—')}
          tone="primary"
        />
        <KpiCard
          label="Última observação"
          value={
            rows[0]?.oldest_observed_at
              ? formatarIdade(rows[0].oldest_observed_at)
              : '—'
          }
          tone="info"
        />
      </div>
      <FilterPanel
        title="Encontre sua rota de lucro"
        description="Filtre o mercado e compare compra, venda, taxas e volume disponível."
        onClear={reset}
      >
        <FilterFieldset accent="primary" legend="Item">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CategorySelect
              label="Categoria"
              value={params.get('category') ?? ''}
              onChange={(v) => setFilter('category', v)}
              options={[...new Set(categories.map((item) => item.category))]}
            />
            <CategorySelect
              label="Subcategoria"
              value={params.get('subcategory') ?? ''}
              onChange={(v) => setFilter('subcategory', v)}
              options={[
                ...new Set(
                  categories
                    .filter(
                      (item) =>
                        !query.category || item.category === query.category,
                    )
                    .map((item) => item.subcategory)
                    .filter(Boolean) as string[],
                ),
              ]}
            />
            <CategorySelect
              label="Tipo"
              value={params.get('subcategory2') ?? ''}
              onChange={(v) => setFilter('subcategory2', v)}
              options={[
                ...new Set(
                  categories
                    .filter(
                      (item) =>
                        (!query.category || item.category === query.category) &&
                        (!query.subcategory ||
                          item.subcategory === query.subcategory),
                    )
                    .map((item) => item.subcategory2)
                    .filter(Boolean) as string[],
                ),
              ]}
            />
            <FilterSelect
              label="Tier"
              value={params.get('tier') ?? ''}
              onChange={(v) => setFilter('tier', v)}
              options={['1', '2', '3', '4', '5', '6', '7', '8']}
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
              label="Encantamento"
              value={params.get('enchantment') ?? ''}
              onChange={(v) => setFilter('enchantment', v)}
              options={['0', '1', '2', '3', '4']}
            />
            <FilterSelect
              label="Frescor máximo"
              value={params.get('freshness') ?? '6'}
              onChange={(v) => setFilter('freshness', v)}
              options={['1', '2', '6', '12', '24']}
              suffix="h"
            />
          </div>
        </FilterFieldset>
        <FilterFieldset accent="buy-side" legend="Mercado e resultado">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              className="sm:col-span-2"
            />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-foreground-subtle">
              Cidades observadas
            </p>
            <div className="flex flex-wrap gap-2">
              {marketToggles.map(({ ids, name }) => {
                const selected = ids.every((id) => query.locations.includes(id))
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleCity(ids)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${selected ? 'border-primary bg-primary text-on-primary shadow-lg shadow-black/20' : 'border-border-strong bg-background/50 text-foreground hover:border-primary/70 hover:text-primary'}`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        </FilterFieldset>
        <FilterFieldset accent="sell-side" legend="Estratégia">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <FilterToggle
              label="Conta Premium"
              description="Imposto de venda reduzido para 4%"
              checked={query.premium}
              onChange={(checked) =>
                setFilter('premium', checked ? '' : 'false')
              }
            />
            <FilterToggle
              label="Pedido de compra"
              description="Inclui 2,5% para criar a ordem"
              checked={query.buyOrder}
              onChange={(checked) =>
                setFilter('buy_order', checked ? 'true' : '')
              }
            />
            <FilterToggle
              label="Pedido de venda"
              description="Inclui 2,5% para criar a ordem"
              checked={query.sellOrder}
              onChange={(checked) =>
                setFilter('sell_order', checked ? 'true' : '')
              }
            />
            <FilterToggle
              label="Cobertura completa"
              description="Oculta livros observados parcialmente"
              checked={query.requireComplete}
              onChange={(checked) =>
                setFilter('coverage', checked ? 'complete' : '')
              }
            />
            <FilterToggle
              label="Apenas com lucro"
              description="Remove oportunidades negativas"
              checked={query.profitOnly}
              onChange={(checked) =>
                setFilter('profit_only', checked ? '' : 'false')
              }
            />
          </div>
        </FilterFieldset>
      </FilterPanel>
      {result.loading && !result.data && (
        <Carregando label="Buscando oportunidades…" />
      )}
      {Boolean(result.error) && !result.data && (
        <EstadoErro title="Não foi possível carregar o Market Flip" />
      )}
      {!result.loading && !result.error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong/80 bg-gradient-to-b from-surface/40 to-background px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-surface text-foreground-muted">
            <ArrowLeftRight className="size-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-bold text-foreground">
            Nenhuma oportunidade encontrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-foreground-subtle">
            A ausência de dados não representa lucro zero. Ajuste os filtros,
            aumente o frescor ou aguarde novas coletas.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <OpportunityTable
          title="Melhores oportunidades"
          description="Compra e venda calculadas com as taxas da estratégia selecionada"
          caption="Oportunidades de Market Flip"
          rows={rows}
          columns={columns}
          rowKey={(row) =>
            `${row.item}-${row.quality_level}-${row.buy_location}-${row.sell_location}`
          }
        />
      )}
      <Pagination
        offset={query.offset}
        limit={query.limit}
        total={result.data?.total ?? 0}
        onOffsetChange={setOffset}
      />
    </section>
  )
}

function DashboardIntro() {
  return (
    <section className="rounded-2xl border border-primary/20 bg-surface p-8">
      <p className="text-sm uppercase tracking-widest text-primary">
        Market Flip
      </p>
      <h1 className="mt-2 text-3xl font-bold">
        Escolha um servidor para começar
      </h1>
      <p className="mt-3 text-foreground-muted">
        Selecione West, East ou Europa no menu superior para buscar
        oportunidades.
      </p>
    </section>
  )
}

function CategorySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className={fieldLabel}>
      {label}
      <select
        aria-label={label}
        className={fieldControl}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos</option>
        {[...options].sort().map((option) => (
          <option key={option} value={option}>
            {traduzirCategoria(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function MarketFlipPage() {
  return <DashboardContent />
}
