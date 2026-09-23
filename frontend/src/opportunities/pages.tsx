import { ArrowLeftRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { RequireRealm } from '@/components/AppShell'
import {
  FilterCheckbox,
  FilterChips,
  FilterGroup,
  FilterNumberField,
  FilterSearch,
  FilterSelectField,
} from '@/components/filters'
import { ItemImage } from '@/components/ItemImage'
import {
  OpportunityTable,
  type OpportunityColumn,
} from '@/components/opportunities/OpportunityTable'
import { Pagination } from '@/components/opportunities/Pagination'
import { WarningBadges } from '@/components/opportunities/WarningBadges'
import { SidebarSection } from '@/components/shell/SidebarSlot'
import { Button } from '@/components/ui/button'
import { EstadoErro, EstadoVazio } from '@/components/ui/states'
import { traduzirCategoria } from '@/i18n/categories'
import {
  formatarIdade,
  formatarPct,
  formatarQualidade,
  formatarSilver,
  partesDoNomeCurto,
} from '@/lib/formatters'
import { useLocationName, useMarketToggles } from '@/lib/locations'
import * as money from '@/lib/money'
import { usePageVisible } from '@/lib/usePageVisible'
import { emEscala } from '@/scanner/altura'
import { MIN_LETRAS_DA_BUSCA } from '@/scanner/categorias'

import { useCategories, useFlipOpportunities } from './hooks'
import { useOpportunityParams } from './useOpportunityParams'

const SEARCH_DEBOUNCE_MS = 300

function readFlipExtra(params: URLSearchParams) {
  return {
    item: params.get('item_id') || undefined,
    category: params.get('category') || undefined,
    subcategory: params.get('subcategory') || undefined,
    subcategory2: params.get('subcategory2') || undefined,
    subcategory3: params.get('subcategory3') || undefined,
    buyOrder: params.get('buy_order') === 'true',
    sellOrder: params.get('sell_order') === 'true',
  }
}

function selectOptions(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort()
    .map((value) => ({ value, label: traduzirCategoria(value) }))
}

function moneyTone(value: string | null | undefined): string {
  if (value == null || money.isZero(value)) return 'text-foreground'
  return money.isPositive(value) ? 'text-profit' : 'text-danger'
}

function DashboardContent() {
  const { realm } = useServer()
  const categories = useCategories()
  const marketToggles = useMarketToggles()
  const locationName = useLocationName()
  const { params, query, setFilter, setListFilter, setOffset, reset } =
    useOpportunityParams(readFlipExtra)
  const [searchText, setSearchText] = useState(params.get('item_id') ?? '')
  const pageVisible = usePageVisible()
  const result = useFlipOpportunities(realm, query)
  const rows = result.data?.opportunities ?? []

  useEffect(() => {
    const value = searchText.trim()
    const current = params.get('item_id') ?? ''
    if (value === current || value === '' || value.length < MIN_LETRAS_DA_BUSCA)
      return

    const timer = window.setTimeout(
      () => setFilter('item_id', value),
      SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [params, searchText, setFilter])

  const categoryOptions = useMemo(
    () => selectOptions(categories.map((item) => item.category)),
    [categories],
  )
  const subcategoryOptions = useMemo(
    () =>
      selectOptions(
        categories
          .filter((item) => !query.category || item.category === query.category)
          .map((item) => item.subcategory),
      ),
    [categories, query.category],
  )
  const typeOptions = useMemo(
    () =>
      selectOptions(
        categories
          .filter(
            (item) =>
              (!query.category || item.category === query.category) &&
              (!query.subcategory || item.subcategory === query.subcategory),
          )
          .map((item) => item.subcategory2),
      ),
    [categories, query.category, query.subcategory],
  )

  if (!realm) {
    return (
      <RequireRealm>
        <span />
      </RequireRealm>
    )
  }

  const toggleCity = (
    key: 'buy_in' | 'sell_in',
    selected: readonly string[],
    cityIds: readonly string[],
  ) => {
    const allSelected = cityIds.every((id) => selected.includes(id))
    setListFilter(
      key,
      allSelected
        ? selected.filter((value) => !cityIds.includes(value))
        : [...selected, ...cityIds.filter((id) => !selected.includes(id))],
    )
  }

  const toggleNumber = (
    key: 'tier' | 'enchantment' | 'quality',
    selected: readonly number[],
    value: number,
  ) =>
    setListFilter(
      key,
      selected.includes(value)
        ? selected.filter((candidate) => candidate !== value)
        : [...selected, value],
    )

  const columns: OpportunityColumn[] = [
    {
      key: 'item',
      header: 'Item',
      sticky: 'left',
      width: emEscala(14),
      className: 'whitespace-normal',
      cell: (row) => {
        const { nome, grau } = partesDoNomeCurto(row.item_name, row.item)
        return (
          <span className="flex min-w-0 items-center gap-2">
            <ItemImage
              uniqueName={row.item}
              quality={row.quality_level ?? undefined}
              size={64}
              className="size-9"
            />
            <Link
              className="flex min-w-0 flex-1 flex-col leading-tight transition hover:text-primary"
              title={grau ? `${nome} ${grau}` : nome}
              to={`/calculadora?item=${encodeURIComponent(row.item)}`}
            >
              <span className="line-clamp-2 font-medium">{nome}</span>
              <span className="text-2xs font-normal text-foreground-subtle">
                {[grau, formatarQualidade(row.quality_level)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Link>
            <WarningBadges
              warnings={row.warnings}
              compact
              className="shrink-0 flex-nowrap"
            />
          </span>
        )
      },
    },
    {
      key: 'route',
      header: 'Rota',
      width: emEscala(11),
      cell: (row) => (
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="truncate text-buy-side">
            {locationName(row.buy_location)}
          </span>
          <ArrowLeftRight
            className="size-3.5 shrink-0 text-foreground-subtle"
            aria-hidden="true"
          />
          <span className="truncate text-sell-side">
            {locationName(row.sell_location)}
          </span>
        </span>
      ),
    },
    {
      key: 'buy-price',
      header: 'Compra unit.',
      width: emEscala(7),
      numeric: true,
      cell: (row) => formatarSilver(row.buy_price),
    },
    {
      key: 'sell-price',
      header: 'Venda unit.',
      width: emEscala(7),
      numeric: true,
      cell: (row) => formatarSilver(row.sell_price),
    },
    {
      key: 'quantity',
      header: 'Qtd.',
      width: emEscala(4),
      numeric: true,
      cell: (row) => row.quantity,
    },
    {
      key: 'investment',
      header: 'Investimento',
      width: emEscala(8),
      numeric: true,
      cell: (row) => formatarSilver(row.total_cost),
    },
    {
      key: 'revenue',
      header: 'Faturamento',
      width: emEscala(8),
      numeric: true,
      cell: (row) => formatarSilver(row.gross_revenue),
    },
    {
      key: 'fees',
      header: 'Taxas',
      width: emEscala(6),
      numeric: true,
      weight: 'tertiary',
      cell: (row) => formatarSilver(row.total_fees),
    },
    {
      key: 'age',
      header: 'Idade',
      width: emEscala(7),
      numeric: true,
      sortField: 'freshness',
      cell: (row) => formatarIdade(row.oldest_observed_at),
    },
    {
      key: 'profit',
      header: 'Lucro',
      width: emEscala(7.5),
      numeric: true,
      weight: 'primary',
      sticky: 'right',
      sortField: 'profit',
      cell: (row) => (
        <span className={moneyTone(row.profit)}>
          {formatarSilver(row.profit)}
        </span>
      ),
    },
    {
      key: 'roi',
      header: 'ROI',
      width: emEscala(5.5),
      numeric: true,
      weight: 'primary',
      sticky: 'right',
      sortField: 'roi',
      cell: (row) => (
        <span className={moneyTone(row.roi)}>{formatarPct(row.roi)}</span>
      ),
    },
  ]

  const total = result.data?.total ?? 0
  const page = Math.floor(query.offset / query.limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / query.limit))
  const selectedBuyCities = marketToggles
    .filter(({ ids }) => ids.every((id) => query.buyLocations.includes(id)))
    .map(({ id }) => id)
  const selectedSellCities = marketToggles
    .filter(({ ids }) => ids.every((id) => query.sellLocations.includes(id)))
    .map(({ id }) => id)

  const changeSearch = (value: string) => {
    setSearchText(value)
    if (value.trim() === '') setFilter('item_id', '')
  }

  const clearFilters = () => {
    setSearchText('')
    reset()
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <SidebarSection title="Filtros">
        <div className="space-y-5">
          <FilterSearch
            value={searchText}
            onChange={changeSearch}
            placeholder="Buscar item…"
          />

          <FilterGroup legend="O que analisar">
            <FilterSelectField
              label="Categoria"
              value={params.get('category') ?? ''}
              onChange={(value) => setFilter('category', value)}
              options={categoryOptions}
              allLabel="Todas"
            />
            <FilterSelectField
              label="Subcategoria"
              value={params.get('subcategory') ?? ''}
              onChange={(value) => setFilter('subcategory', value)}
              options={subcategoryOptions}
              allLabel="Todas"
            />
            <FilterSelectField
              label="Tipo"
              value={params.get('subcategory2') ?? ''}
              onChange={(value) => setFilter('subcategory2', value)}
              options={typeOptions}
              allLabel="Todos"
            />
          </FilterGroup>

          <FilterGroup legend="Item">
            <FilterChips
              label="Tier"
              options={Array.from({ length: 8 }, (_, index) => index + 1)}
              selected={query.tiers}
              onToggle={(value) => toggleNumber('tier', query.tiers, value)}
              formatOption={(value) => `T${value}`}
            />
            <FilterChips
              label="Encantamento"
              options={Array.from({ length: 5 }, (_, index) => index)}
              selected={query.enchantments}
              onToggle={(value) =>
                toggleNumber('enchantment', query.enchantments, value)
              }
              formatOption={(value) => `.${value}`}
            />
            <FilterChips
              label="Qualidade"
              options={Array.from({ length: 5 }, (_, index) => index + 1)}
              selected={query.qualities}
              onToggle={(value) =>
                toggleNumber('quality', query.qualities, value)
              }
              formatOption={(value) =>
                formatarQualidade(value) ?? String(value)
              }
            />
          </FilterGroup>

          <FilterGroup legend="Mercado">
            <FilterChips
              label="Comprar em"
              options={marketToggles.map(({ id }) => id)}
              selected={selectedBuyCities}
              onToggle={(id) => {
                const city = marketToggles.find(
                  (candidate) => candidate.id === id,
                )
                if (city) toggleCity('buy_in', query.buyLocations, city.ids)
              }}
              formatOption={(id) =>
                marketToggles.find((candidate) => candidate.id === id)?.name ??
                id
              }
            />
            <FilterChips
              label="Vender em"
              options={marketToggles.map(({ id }) => id)}
              selected={selectedSellCities}
              onToggle={(id) => {
                const city = marketToggles.find(
                  (candidate) => candidate.id === id,
                )
                if (city) toggleCity('sell_in', query.sellLocations, city.ids)
              }}
              formatOption={(id) =>
                marketToggles.find((candidate) => candidate.id === id)?.name ??
                id
              }
            />
          </FilterGroup>

          <FilterGroup legend="Resultado">
            <FilterNumberField
              label="Lucro mínimo"
              value={params.get('min_profit') ?? ''}
              onChange={(value) => setFilter('min_profit', value)}
              placeholder="qualquer"
            />
            <FilterNumberField
              label="ROI mínimo"
              value={params.get('min_roi') ?? ''}
              onChange={(value) => setFilter('min_roi', value)}
              placeholder="qualquer"
              suffix="%"
            />
            <FilterSelectField
              label="Frescor máximo"
              value={String(query.maxAgeHours)}
              onChange={(value) => setFilter('freshness', value)}
              options={[1, 2, 6, 12, 24].map((hours) => ({
                value: String(hours),
                label: `${hours} h`,
              }))}
              allLabel={null}
            />
            <FilterCheckbox
              label="Apenas com lucro"
              description="Remove oportunidades negativas"
              checked={query.profitOnly}
              onChange={(checked) =>
                setFilter('profit_only', checked ? '' : 'false')
              }
            />
            <FilterCheckbox
              label="Cobertura completa"
              description="Oculta livros observados parcialmente"
              checked={query.requireComplete}
              onChange={(checked) =>
                setFilter('coverage', checked ? 'complete' : '')
              }
            />
          </FilterGroup>

          <FilterGroup legend="Estratégia">
            <FilterCheckbox
              label="Conta Premium"
              description="Imposto de venda reduzido para 4%"
              checked={query.premium}
              onChange={(checked) =>
                setFilter('premium', checked ? '' : 'false')
              }
            />
            <FilterCheckbox
              label="Pedido de compra"
              description="Inclui 2,5% para criar a ordem"
              checked={query.buyOrder}
              onChange={(checked) =>
                setFilter('buy_order', checked ? 'true' : '')
              }
            />
            <FilterCheckbox
              label="Pedido de venda"
              description="Inclui 2,5% para criar a ordem"
              checked={query.sellOrder}
              onChange={(checked) =>
                setFilter('sell_order', checked ? 'true' : '')
              }
            />
          </FilterGroup>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={clearFilters}
          >
            Limpar filtros
          </Button>
        </div>
      </SidebarSection>

      <header className="shrink-0">
        <h1 className="text-2xl font-black tracking-tight">Market Flip</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Compre barato em uma cidade e venda caro em outra.
        </p>
        <p className="mt-2 text-xs text-foreground-subtle">
          {result.loading && !result.data ? (
            'Carregando oportunidades…'
          ) : (
            <>
              <strong className="text-foreground">{total}</strong> oportunidades
              · página {page} de {totalPages}
              {pageVisible && ' · atualização a cada 30 s'}
            </>
          )}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {Boolean(result.error) && !result.data ? (
          <EstadoErro title="Não foi possível carregar o Market Flip" />
        ) : !result.loading && rows.length === 0 ? (
          <EstadoVazio
            title="Nenhuma oportunidade encontrada"
            icon={<ArrowLeftRight className="size-6" />}
          >
            A ausência de dados não representa lucro zero. Ajuste os filtros ao
            lado, aumente o frescor ou aguarde novas coletas.
          </EstadoVazio>
        ) : (
          <div className="min-h-0 flex-1">
            <OpportunityTable
              rows={rows}
              columns={columns}
              loading={result.loading && !result.data}
              sort={query.sort}
              direction={query.direction}
              onSortChange={(field, direction) =>
                setFilter('sort', `${field}_${direction}`)
              }
              rowKey={(row) =>
                `${row.item}-${row.quality_level}-${row.buy_location}-${row.sell_location}`
              }
            />
          </div>
        )}
        <Pagination
          offset={query.offset}
          limit={query.limit}
          total={total}
          onOffsetChange={setOffset}
        />
      </div>
    </div>
  )
}

export function MarketFlipPage() {
  return <DashboardContent />
}
