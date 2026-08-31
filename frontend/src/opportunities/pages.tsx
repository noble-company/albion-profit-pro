import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { RequireRealm } from '@/components/AppShell'
import { Carregando, EstadoErro } from '@/components/ui/states'
import { useServer } from '@/app/ServerContext'
import {
  formatarCategoria,
  formatarIdade,
  formatarLocalidade,
  formatarNomeJogador,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { useFlipOpportunities } from './hooks'
import { getCategories, type Category } from './service'

const cities = [
  { ids: ['3005'], name: 'Caerleon' },
  { ids: ['2004'], name: 'Bridgewatch' },
  { ids: ['4002'], name: 'Fort Sterling' },
  // O grupo de Lymhurst inclui o mercado principal e o cluster do portal.
  { ids: ['1002', '1301'], name: 'Lymhurst' },
  { ids: ['3008'], name: 'Martlock' },
  { ids: ['0007'], name: 'Thetford' },
  { ids: ['5003'], name: 'Brecilien' },
  { ids: ['3003'], name: 'Black Market' },
] as const

function updateParam(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params)
  if (value) next.set(key, value)
  else next.delete(key)
  next.delete('offset')
  return next
}

function DashboardContent() {
  const { realm } = useServer()
  const [params, setParams] = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])
  useEffect(() => {
    const controller = new AbortController()
    void getCategories(controller.signal)
      .then(setCategories)
      .catch(() => setCategories([]))
    return () => controller.abort()
  }, [])
  const query = useMemo(
    () => ({
      category: params.get('category') || undefined,
      subcategory: params.get('subcategory') || undefined,
      subcategory2: params.get('subcategory2') || undefined,
      subcategory3: params.get('subcategory3') || undefined,
      locations: params.getAll('location_id'),
      tier: params.get('tier') ? Number(params.get('tier')) : undefined,
      enchantment: params.get('enchantment')
        ? Number(params.get('enchantment'))
        : undefined,
      quality: params.get('quality')
        ? Number(params.get('quality'))
        : undefined,
      maxAgeHours: params.get('freshness')
        ? Number(params.get('freshness'))
        : 6,
      requireComplete: params.get('coverage') === 'complete',
      limit: 25,
      offset: Math.max(0, Number(params.get('offset') || 0)),
      minProfit: params.get('min_profit') || undefined,
      minRoi: params.get('min_roi') || undefined,
      profitOnly: params.get('profit_only') === 'true',
      premium: params.get('premium') !== 'false',
      buyOrder: params.get('buy_order') === 'true',
      sellOrder: params.get('sell_order') === 'true',
      sort: params.get('sort') || 'profit_desc',
    }),
    [params],
  )
  const result = useFlipOpportunities(realm, query)
  const rows = useMemo(() => {
    const source = result.data?.opportunities ?? []
    const sorted = [...source]
    const value = (row: (typeof source)[number]) => {
      if (query.sort.startsWith('roi'))
        return Number(row.roi ?? Number.NEGATIVE_INFINITY)
      if (query.sort.startsWith('freshness'))
        return Date.parse(row.oldest_observed_at ?? '') || 0
      return Number(row.profit ?? Number.NEGATIVE_INFINITY)
    }
    sorted.sort((a, b) => {
      const difference = value(a) - value(b)
      return query.sort.endsWith('asc') ? difference : -difference
    })
    return sorted
  }, [query.sort, result.data?.opportunities])
  if (!realm)
    return (
      <RequireRealm>
        <DashboardIntro />
      </RequireRealm>
    )
  const totalProfit = rows.reduce(
    (sum, row) => sum + Number(row.profit ?? 0),
    0,
  )
  const page = query.offset / query.limit + 1
  const set = (key: string, value: string) =>
    setParams(updateParam(params, key, value))
  const clearFilters = () => setParams(new URLSearchParams())
  const toggleCity = (cityIds: readonly string[]) => {
    const next = new URLSearchParams(params)
    const selected = next.getAll('location_id')
    next.delete('location_id')
    const allSelected = cityIds.every((id) => selected.includes(id))
    const updated = allSelected
      ? selected.filter((value) => !cityIds.includes(value))
      : [...selected, ...cityIds.filter((id) => !selected.includes(id))]
    updated.forEach((value) => next.append('location_id', value))
    next.delete('offset')
    setParams(next)
  }
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-400">
            Market Flip · {realm}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Encontre o próximo lucro
          </h1>
          <p className="mt-2 text-stone-400">
            Compre barato em uma cidade. Venda caro em outra.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs font-medium text-emerald-300 shadow-lg shadow-emerald-950/20">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Atualização automática · 30s
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Lucro na página"
          value={formatarSilver(String(totalProfit))}
          tone="emerald"
        />
        <Kpi
          label="Ofertas encontradas"
          value={String(result.data?.total ?? '—')}
          tone="amber"
        />
        <Kpi
          label="Última observação"
          value={
            rows[0]?.oldest_observed_at
              ? formatarIdade(rows[0].oldest_observed_at)
              : '—'
          }
          tone="sky"
        />
      </div>
      <div className="opportunity-filters overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/70 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 px-5 py-4">
          <div>
            <h2 className="font-bold text-stone-100">
              Encontre sua rota de lucro
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Filtre o mercado e compare compra, venda, taxas e volume
              disponível.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-stone-700 bg-stone-950/50 px-3 py-2 text-sm font-semibold text-stone-300 transition hover:border-amber-400/60 hover:text-amber-300"
            onClick={clearFilters}
          >
            Limpar filtros
          </button>
        </div>
        <div className="space-y-6 p-5">
          <fieldset>
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="h-px w-5 bg-amber-400/60" /> Item
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CategorySelect
                label="Categoria"
                value={params.get('category') ?? ''}
                onChange={(v) => set('category', v)}
                options={[...new Set(categories.map((item) => item.category))]}
              />
              <CategorySelect
                label="Subcategoria"
                value={params.get('subcategory') ?? ''}
                onChange={(v) => set('subcategory', v)}
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
                onChange={(v) => set('subcategory2', v)}
                options={[
                  ...new Set(
                    categories
                      .filter(
                        (item) =>
                          (!query.category ||
                            item.category === query.category) &&
                          (!query.subcategory ||
                            item.subcategory === query.subcategory),
                      )
                      .map((item) => item.subcategory2)
                      .filter(Boolean) as string[],
                  ),
                ]}
              />
              <Select
                label="Tier"
                value={params.get('tier') ?? ''}
                onChange={(v) => set('tier', v)}
                options={['1', '2', '3', '4', '5', '6', '7', '8']}
              />
              <Select
                label="Qualidade"
                value={params.get('quality') ?? ''}
                onChange={(v) => set('quality', v)}
                options={['1', '2', '3', '4', '5']}
                labels={[
                  'Normal',
                  'Bom',
                  'Excelente',
                  'Excepcional',
                  'Obra-prima',
                ]}
              />
              <Select
                label="Encantamento"
                value={params.get('enchantment') ?? ''}
                onChange={(v) => set('enchantment', v)}
                options={['0', '1', '2', '3', '4']}
              />
              <Select
                label="Frescor máximo"
                value={params.get('freshness') ?? '6'}
                onChange={(v) => set('freshness', v)}
                options={['1', '2', '6', '12', '24']}
                suffix="h"
              />
            </div>
          </fieldset>
          <fieldset className="border-t border-stone-800 pt-5">
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="h-px w-5 bg-sky-400/60" /> Mercado e resultado
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="filter-field">
                Lucro mínimo
                <input
                  aria-label="Lucro mínimo"
                  inputMode="decimal"
                  value={params.get('min_profit') ?? ''}
                  onChange={(e) => set('min_profit', e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="filter-field">
                ROI mínimo
                <input
                  aria-label="ROI mínimo"
                  inputMode="decimal"
                  value={params.get('min_roi') ?? ''}
                  onChange={(e) => set('min_roi', e.target.value)}
                  placeholder="0%"
                />
              </label>
              <label className="filter-field sm:col-span-2">
                Ordenar por
                <select
                  aria-label="Ordenar por"
                  value={query.sort}
                  onChange={(e) => set('sort', e.target.value)}
                >
                  <option value="profit_desc">Lucro (maior → menor)</option>
                  <option value="profit_asc">Lucro (menor → maior)</option>
                  <option value="roi_desc">ROI (maior → menor)</option>
                  <option value="roi_asc">ROI (menor → maior)</option>
                  <option value="freshness_desc">
                    Atualização (mais recente)
                  </option>
                  <option value="freshness_asc">
                    Atualização (mais antiga)
                  </option>
                </select>
              </label>
            </div>
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                Cidades observadas
              </p>
              <div className="flex flex-wrap gap-2">
                {cities.map(({ ids, name }) => {
                  const selected = ids.every((id) =>
                    query.locations.includes(id),
                  )
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCity(ids)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${selected ? 'border-amber-300 bg-amber-300 text-stone-950 shadow-lg shadow-amber-950/20' : 'border-stone-700 bg-stone-950/50 text-stone-300 hover:border-amber-300/70 hover:text-amber-200'}`}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
          </fieldset>
          <fieldset className="border-t border-stone-800 pt-5">
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="h-px w-5 bg-violet-400/60" /> Estratégia
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Checkbox
                label="Conta Premium"
                description="Imposto de venda reduzido para 4%"
                checked={query.premium}
                onChange={(checked) => set('premium', checked ? '' : 'false')}
              />
              <Checkbox
                label="Pedido de compra"
                description="Inclui 2,5% para criar a ordem"
                checked={query.buyOrder}
                onChange={(checked) => set('buy_order', checked ? 'true' : '')}
              />
              <Checkbox
                label="Pedido de venda"
                description="Inclui 2,5% para criar a ordem"
                checked={query.sellOrder}
                onChange={(checked) => set('sell_order', checked ? 'true' : '')}
              />
              <Checkbox
                label="Cobertura completa"
                description="Oculta livros observados parcialmente"
                checked={query.requireComplete}
                onChange={(checked) =>
                  set('coverage', checked ? 'complete' : '')
                }
              />
              <Checkbox
                label="Apenas com lucro"
                description="Remove oportunidades negativas"
                checked={query.profitOnly}
                onChange={(checked) =>
                  set('profit_only', checked ? 'true' : '')
                }
              />
            </div>
          </fieldset>
        </div>
      </div>
      {result.loading && !result.data && (
        <Carregando label="Buscando oportunidades…" />
      )}
      {Boolean(result.error) && !result.data && (
        <EstadoErro title="Não foi possível carregar o Market Flip" />
      )}
      {!result.loading && !result.error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-700/80 bg-gradient-to-b from-stone-900/40 to-stone-950 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-700 bg-stone-900 text-xl text-stone-400">
            ⇄
          </div>
          <h2 className="mt-4 font-bold text-stone-200">
            Nenhuma oportunidade encontrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-stone-500">
            A ausência de dados não representa lucro zero. Ajuste os filtros,
            aumente o frescor ou aguarde novas coletas.
          </p>
        </div>
      )}
      {rows.length > 0 && <OpportunityTable rows={rows} />}
      {(result.data?.total ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-900/40 px-3 py-2 text-sm text-stone-400">
          <button
            className="button"
            disabled={query.offset === 0}
            onClick={() =>
              setParams(
                updateParam(
                  params,
                  'offset',
                  String(Math.max(0, query.offset - query.limit)),
                ),
              )
            }
          >
            Anterior
          </button>
          <span>
            Página {page} · {result.data?.total ?? 0} oportunidades
          </span>
          <button
            className="button"
            disabled={
              !result.data || query.offset + query.limit >= result.data.total
            }
            onClick={() =>
              setParams(
                updateParam(
                  params,
                  'offset',
                  String(query.offset + query.limit),
                ),
              )
            }
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  )
}

function DashboardIntro() {
  return (
    <section className="rounded-2xl border border-amber-400/20 bg-stone-900 p-8">
      <p className="text-sm uppercase tracking-widest text-amber-400">
        Market Flip
      </p>
      <h1 className="mt-2 text-3xl font-bold">
        Escolha um servidor para começar
      </h1>
      <p className="mt-3 text-stone-400">
        Selecione West, East ou Europa no menu superior para buscar
        oportunidades.
      </p>
    </section>
  )
}
function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'amber' | 'emerald' | 'sky'
}) {
  const tones = {
    amber: 'from-amber-400/15 text-amber-200 before:bg-amber-400',
    emerald: 'from-emerald-400/15 text-emerald-200 before:bg-emerald-400',
    sky: 'from-sky-400/15 text-sky-200 before:bg-sky-400',
  }
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-stone-800 bg-gradient-to-br ${tones[tone]} to-stone-900/80 p-5 shadow-lg shadow-black/10 before:absolute before:inset-y-0 before:left-0 before:w-1`}
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </article>
  )
}
function Checkbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`filter-toggle ${checked ? 'filter-toggle-active' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm text-stone-100">{label}</strong>
        <span className="mt-0.5 block text-xs font-normal leading-snug text-stone-500">
          {description}
        </span>
      </span>
    </label>
  )
}
function Select({
  label,
  value,
  onChange,
  options,
  suffix,
  labels,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  suffix?: string
  labels?: string[]
}) {
  return (
    <label className="filter-field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos</option>
        {options.map((option, index) => (
          <option key={option} value={option}>
            {labels?.[index] ?? (suffix ? `${option}${suffix}` : option)}
          </option>
        ))}
      </select>
    </label>
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
    <label className="filter-field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos</option>
        {[...options].sort().map((option) => (
          <option key={option} value={option}>
            {formatarCategoria(option)}
          </option>
        ))}
      </select>
    </label>
  )
}
function OpportunityTable({
  rows,
}: {
  rows: NonNullable<
    ReturnType<typeof useFlipOpportunities>['data']
  >['opportunities']
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900/70 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-stone-200">
            Melhores oportunidades
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Compra e venda calculadas com as taxas da estratégia selecionada
          </p>
        </div>
        <span className="rounded-full bg-stone-800 px-2.5 py-1 text-xs font-semibold text-stone-400">
          {rows.length} nesta página
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <caption className="sr-only">Oportunidades de Market Flip</caption>
          <thead className="bg-stone-900/80 text-[0.68rem] uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="p-4">Item</th>
              <th className="p-4">Qualidade</th>
              <th className="p-4">Compra unit.</th>
              <th className="p-4">Venda unit.</th>
              <th className="p-4">Investimento</th>
              <th className="p-4">Faturamento</th>
              <th className="p-4">Taxas</th>
              <th className="p-4">Qtd.</th>
              <th className="p-4">Lucro</th>
              <th className="p-4">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.item}-${row.quality_level}-${row.buy_location}-${row.sell_location}`}
                className="border-t border-stone-800 transition-colors hover:bg-stone-900"
              >
                <td className="p-4">
                  <Link
                    className="font-bold text-stone-100 transition hover:text-amber-300"
                    to={`/calculadora?item=${encodeURIComponent(row.item)}`}
                  >
                    {formatarNomeJogador(row.item_name, row.item)}
                  </Link>
                </td>
                <td className="p-4 font-medium text-stone-300">
                  {formatarQualidade(row.quality_level)}
                </td>
                <td className="p-4">
                  <strong className="text-stone-100">
                    {formatarSilver(row.buy_price)}
                  </strong>
                  <div className="mt-0.5 text-xs font-medium text-sky-300">
                    {formatarLocalidade(row.buy_location)}
                  </div>
                </td>
                <td className="p-4">
                  <strong className="text-stone-100">
                    {formatarSilver(row.sell_price)}
                  </strong>
                  <div className="mt-0.5 text-xs font-medium text-violet-300">
                    {formatarLocalidade(row.sell_location)}
                  </div>
                </td>
                <td className="p-4 font-semibold text-amber-200">
                  {formatarSilver(
                    row.total_cost ??
                      (row.buy_price
                        ? String(Number(row.buy_price) * row.quantity)
                        : null),
                  )}
                </td>
                <td className="p-4 font-semibold text-sky-200">
                  {formatarSilver(
                    row.gross_revenue ??
                      (row.sell_price
                        ? String(Number(row.sell_price) * row.quantity)
                        : null),
                  )}
                </td>
                <td className="p-4 text-stone-400">
                  {row.gross_revenue &&
                  row.sell_price &&
                  row.buy_price &&
                  row.total_cost
                    ? formatarSilver(
                        String(
                          Number(row.sell_price) * row.quantity -
                            Number(row.gross_revenue) +
                            (Number(row.total_cost) -
                              Number(row.buy_price) * row.quantity),
                        ),
                      )
                    : '—'}
                </td>
                <td className="p-4 font-semibold text-stone-300">
                  {row.quantity}
                </td>
                <td className="p-4">
                  <strong className="whitespace-nowrap rounded-lg border border-emerald-400/10 bg-emerald-400/10 px-2.5 py-1.5 text-emerald-300">
                    {formatarSilver(row.profit)}
                  </strong>
                </td>
                <td className="p-4 font-medium text-emerald-300">
                  {formatarPct(row.roi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function MarketFlipPage() {
  return <DashboardContent />
}
