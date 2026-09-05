import { ArrowLeftRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { RequireRealm } from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import { Carregando, EstadoErro } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { useServer } from '@/app/ServerContext'
import * as money from '@/lib/money'
import {
  formatarCategoria,
  formatarIdade,
  formatarLocalidade,
  formatarNomeJogador,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { useCategories, useFlipOpportunities } from './hooks'
import { parseSortParam } from './service'

// Chrome dos campos de filtro. O CSS à mão que vivia em index.css saiu na task 12; até as
// telas serem refeitas (tasks 21–24) o estilo mora aqui, em tokens.
const fieldLabel =
  'flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground-subtle'
const fieldControl =
  'min-h-11 rounded-lg border border-border-strong bg-background/75 px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none transition hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/30'

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
  const categories = useCategories()
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
      ...parseSortParam(params.get('sort')),
    }),
    [params],
  )
  const sortParam = params.get('sort') || 'profit_desc'
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
        <Kpi
          label="Lucro na página"
          value={formatarSilver(totalProfit)}
          tone="profit"
        />
        <Kpi
          label="Ofertas encontradas"
          value={String(result.data?.total ?? '—')}
          tone="primary"
        />
        <Kpi
          label="Última observação"
          value={
            rows[0]?.oldest_observed_at
              ? formatarIdade(rows[0].oldest_observed_at)
              : '—'
          }
          tone="info"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface/70 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-bold text-foreground">
              Encontre sua rota de lucro
            </h2>
            <p className="mt-0.5 text-xs text-foreground-subtle">
              Filtre o mercado e compare compra, venda, taxas e volume
              disponível.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
        <div className="space-y-6 p-5">
          <fieldset>
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-foreground-subtle">
              <span className="h-px w-5 bg-primary/60" /> Item
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
          <fieldset className="border-t border-border pt-5">
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-foreground-subtle">
              <span className="h-px w-5 bg-buy-side/60" /> Mercado e resultado
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className={fieldLabel}>
                Lucro mínimo
                <input
                  aria-label="Lucro mínimo"
                  className={fieldControl}
                  inputMode="decimal"
                  value={params.get('min_profit') ?? ''}
                  onChange={(e) => set('min_profit', e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className={fieldLabel}>
                ROI mínimo
                <input
                  aria-label="ROI mínimo"
                  className={fieldControl}
                  inputMode="decimal"
                  value={params.get('min_roi') ?? ''}
                  onChange={(e) => set('min_roi', e.target.value)}
                  placeholder="0%"
                />
              </label>
              <label className={`${fieldLabel} sm:col-span-2`}>
                Ordenar por
                <select
                  aria-label="Ordenar por"
                  className={fieldControl}
                  value={sortParam}
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
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-foreground-subtle">
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
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${selected ? 'border-primary bg-primary text-on-primary shadow-lg shadow-black/20' : 'border-border-strong bg-background/50 text-foreground hover:border-primary/70 hover:text-primary'}`}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
          </fieldset>
          <fieldset className="border-t border-border pt-5">
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-foreground-subtle">
              <span className="h-px w-5 bg-sell-side/60" /> Estratégia
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Toggle
                label="Conta Premium"
                description="Imposto de venda reduzido para 4%"
                checked={query.premium}
                onChange={(checked) => set('premium', checked ? '' : 'false')}
              />
              <Toggle
                label="Pedido de compra"
                description="Inclui 2,5% para criar a ordem"
                checked={query.buyOrder}
                onChange={(checked) => set('buy_order', checked ? 'true' : '')}
              />
              <Toggle
                label="Pedido de venda"
                description="Inclui 2,5% para criar a ordem"
                checked={query.sellOrder}
                onChange={(checked) => set('sell_order', checked ? 'true' : '')}
              />
              <Toggle
                label="Cobertura completa"
                description="Oculta livros observados parcialmente"
                checked={query.requireComplete}
                onChange={(checked) =>
                  set('coverage', checked ? 'complete' : '')
                }
              />
              <Toggle
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
      {rows.length > 0 && <OpportunityTable rows={rows} />}
      {(result.data?.total ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface/40 px-3 py-2 text-sm text-foreground-muted">
          <Button
            variant="outline"
            size="sm"
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
          </Button>
          <span>
            Página {page} · {result.data?.total ?? 0} oportunidades
          </span>
          <Button
            variant="outline"
            size="sm"
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
          </Button>
        </div>
      )}
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
function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'primary' | 'profit' | 'info'
}) {
  const tones = {
    primary: 'from-primary/15 text-primary before:bg-primary',
    profit: 'from-profit/15 text-profit before:bg-profit',
    info: 'from-info/15 text-info before:bg-info',
  }
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${tones[tone]} to-surface/80 p-5 shadow-lg shadow-black/10 before:absolute before:inset-y-0 before:left-0 before:w-1`}
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-foreground-subtle">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </article>
  )
}
function Toggle({
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
    <label
      className={`flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-primary/45 bg-primary/10' : 'border-surface-raised bg-background/55 hover:border-border-strong'}`}
    >
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="min-w-0">
        <strong className="block text-sm text-foreground">{label}</strong>
        <span className="mt-0.5 block text-xs font-normal leading-snug text-foreground-subtle">
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
    <label className={fieldLabel}>
      {label}
      <select
        aria-label={label}
        className={fieldControl}
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
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-border bg-surface/70 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            Melhores oportunidades
          </h2>
          <p className="mt-0.5 text-xs text-foreground-subtle">
            Compra e venda calculadas com as taxas da estratégia selecionada
          </p>
        </div>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-semibold text-foreground-muted">
          {rows.length} nesta página
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <caption className="sr-only">Oportunidades de Market Flip</caption>
          <thead className="bg-surface/80 text-[0.68rem] uppercase tracking-[0.12em] text-foreground-subtle">
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
                className="border-t border-border transition-colors hover:bg-surface"
              >
                <td className="p-4">
                  <Link
                    className="font-bold text-foreground transition hover:text-primary"
                    to={`/calculadora?item=${encodeURIComponent(row.item)}`}
                  >
                    {formatarNomeJogador(row.item_name, row.item)}
                  </Link>
                </td>
                <td className="p-4 font-medium text-foreground">
                  {formatarQualidade(row.quality_level)}
                </td>
                <td className="p-4">
                  <strong className="text-foreground">
                    {formatarSilver(row.buy_price)}
                  </strong>
                  <div className="mt-0.5 text-xs font-medium text-buy-side">
                    {formatarLocalidade(row.buy_location)}
                  </div>
                </td>
                <td className="p-4">
                  <strong className="text-foreground">
                    {formatarSilver(row.sell_price)}
                  </strong>
                  <div className="mt-0.5 text-xs font-medium text-sell-side">
                    {formatarLocalidade(row.sell_location)}
                  </div>
                </td>
                <td className="p-4 font-semibold text-primary">
                  {formatarSilver(row.total_cost)}
                </td>
                <td className="p-4 font-semibold text-buy-side">
                  {formatarSilver(row.gross_revenue)}
                </td>
                <td className="p-4 text-foreground-muted">
                  {formatarSilver(row.total_fees)}
                </td>
                <td className="p-4 font-semibold text-foreground">
                  {row.quantity}
                </td>
                <td className="p-4">
                  <strong className="whitespace-nowrap rounded-lg border border-profit/10 bg-profit/10 px-2.5 py-1.5 text-profit">
                    {formatarSilver(row.profit)}
                  </strong>
                </td>
                <td className="p-4 font-medium text-profit">
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
