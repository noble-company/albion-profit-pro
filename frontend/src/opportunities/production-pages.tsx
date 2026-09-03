import { TrendingUp, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { RequireRealm } from '@/components/AppShell'
import { Carregando, EstadoErro } from '@/components/ui/states'
import { simulateCraft, type CraftResult } from '@/craft/service'
import {
  formatarIdade,
  formatarLocalidade,
  formatarNomeJogador,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { getLocations, type Location } from '@/prices/service'

import { useProductionOpportunities } from './hooks'
import type { Opportunity, ProductionKind } from './service'

const warningLabels: Record<string, string> = {
  dado_velho: 'Preço desatualizado',
  profundidade_insuficiente: 'Profundidade insuficiente',
  sem_preco: 'Preço indisponível',
  sem_cobertura: 'Mercado sem cobertura',
  ordem_nao_garantida: 'Ordem não garantida',
}

const modeLabels: Record<string, string> = {
  immediate: 'Imediato',
  buy_order: 'Pedido de compra',
  sell_order: 'Pedido de venda',
}

type PageConfig = {
  kind: ProductionKind
  eyebrow: string
  title: string
  description: string
}

function updateParam(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params)
  if (value) next.set(key, value)
  else next.delete(key)
  next.delete('offset')
  return next
}

function percentageToRate(value: string) {
  if (!value) return '0'
  const numeric = Number(value.replace(',', '.'))
  return Number.isFinite(numeric) ? String(numeric / 100) : '0'
}

function formatQuantity(value: string | number) {
  const numeric = Number(value)
  return Number.isFinite(numeric)
    ? numeric.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : '—'
}

function ProductionRankingPage({ config }: { config: PageConfig }) {
  const { realm } = useServer()
  const [params, setParams] = useSearchParams()
  const [locations, setLocations] = useState<Location[]>([])
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [detail, setDetail] = useState<CraftResult | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<unknown>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getLocations(controller.signal)
      .then((rows) => setLocations(rows.filter((row) => row.kind === 'city')))
      .catch(() => setLocations([]))
    return () => controller.abort()
  }, [])

  const query = useMemo(
    () => ({
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
      profitOnly: params.get('profit_only') !== 'false',
      premium: params.get('premium') !== 'false',
      returnRate: percentageToRate(params.get('return_rate') || '0'),
      stationCostPerExecution: params.get('station_cost') || '0',
      useFocus: params.get('focus') === 'true',
      sort: params.get('sort') || 'profit_desc',
    }),
    [params],
  )
  const result = useProductionOpportunities(config.kind, realm, query)
  const rows = useMemo(() => {
    const sorted = [...(result.data?.opportunities ?? [])]
    const value = (row: Opportunity) => {
      if (query.sort.startsWith('roi'))
        return Number(row.roi ?? Number.NEGATIVE_INFINITY)
      if (query.sort.startsWith('freshness')) {
        return Date.parse(row.oldest_observed_at ?? '') || 0
      }
      return Number(row.profit ?? Number.NEGATIVE_INFINITY)
    }
    sorted.sort((a, b) => {
      const difference = value(a) - value(b)
      return query.sort.endsWith('asc') ? difference : -difference
    })
    return sorted
  }, [query.sort, result.data?.opportunities])

  if (!realm) {
    return (
      <RequireRealm>
        <span />
      </RequireRealm>
    )
  }

  const set = (key: string, value: string) =>
    setParams(updateParam(params, key, value))
  const page = query.offset / query.limit + 1
  const best = rows[0]

  const openDetail = async (row: Opportunity) => {
    if (!row.buy_location) return
    setSelected(row)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      setDetail(
        await simulateCraft({
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
        }),
      )
    } catch (error) {
      setDetailError(error)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-400">
            {config.eyebrow} · {realm}
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
            {config.title}
          </h1>
          <p className="mt-2 max-w-2xl text-stone-400">{config.description}</p>
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
          label="Oportunidades encontradas"
          value={String(result.data?.total ?? '—')}
          tone="amber"
        />
        <Kpi
          label="Melhor lucro"
          value={formatarSilver(best?.profit ?? null)}
          tone="emerald"
        />
        <Kpi
          label="Última observação"
          value={
            best?.oldest_observed_at
              ? formatarIdade(best.oldest_observed_at)
              : '—'
          }
          tone="sky"
        />
      </div>

      {result.data?.coverage && (
        <p
          className={`text-xs ${
            result.data.coverage.stale ? 'text-amber-400' : 'text-stone-500'
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

      <div className="opportunity-filters overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/70 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 px-5 py-4">
          <div>
            <h2 className="font-bold text-stone-100">Configure seu cenário</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Os resultados são recalculados com os valores escolhidos abaixo.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-stone-700 bg-stone-950/50 px-3 py-2 text-sm font-semibold text-stone-300 transition hover:border-amber-400/60 hover:text-amber-300"
            onClick={() => setParams(new URLSearchParams())}
          >
            Limpar filtros
          </button>
        </div>

        <div className="space-y-6 p-5">
          <fieldset>
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="h-px w-5 bg-amber-400/60" /> Mercado
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <label className="filter-field">
                Cidade
                <select
                  aria-label="Cidade"
                  value={query.locations[0] ?? ''}
                  onChange={(event) => set('location_id', event.target.value)}
                >
                  <option value="">Todas</option>
                  {locations.map((location) => (
                    <option
                      key={location.location_id}
                      value={location.location_id}
                    >
                      {location.name ?? location.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <Select
                label="Tier"
                value={params.get('tier') ?? ''}
                onChange={(v) => set('tier', v)}
                options={['2', '3', '4', '5', '6', '7', '8']}
              />
              <Select
                label="Encantamento"
                value={params.get('enchantment') ?? ''}
                onChange={(v) => set('enchantment', v)}
                options={['0', '1', '2', '3', '4']}
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
                label="Frescor máximo"
                value={params.get('freshness') ?? '6'}
                onChange={(v) => set('freshness', v)}
                options={['1', '2', '6', '12', '24']}
                suffix="h"
              />
              <label className="filter-field">
                Retorno de recurso (%)
                <input
                  aria-label="Retorno de recurso (%)"
                  inputMode="decimal"
                  value={params.get('return_rate') ?? '0'}
                  onChange={(event) => set('return_rate', event.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="border-t border-stone-800 pt-5">
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="h-px w-5 bg-sky-400/60" /> Custos e metas
            </legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="filter-field">
                Estação por execução
                <input
                  aria-label="Estação por execução"
                  inputMode="decimal"
                  value={params.get('station_cost') ?? '0'}
                  onChange={(event) => set('station_cost', event.target.value)}
                />
              </label>
              <label className="filter-field">
                Lucro mínimo
                <input
                  aria-label="Lucro mínimo"
                  inputMode="decimal"
                  value={params.get('min_profit') ?? ''}
                  onChange={(event) => set('min_profit', event.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="filter-field">
                ROI mínimo
                <input
                  aria-label="ROI mínimo"
                  inputMode="decimal"
                  value={params.get('min_roi') ?? ''}
                  onChange={(event) => set('min_roi', event.target.value)}
                  placeholder="0%"
                />
              </label>
              <label className="filter-field">
                Ordenar por
                <select
                  aria-label="Ordenar por"
                  value={query.sort}
                  onChange={(event) => set('sort', event.target.value)}
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
          </fieldset>

          <fieldset className="border-t border-stone-800 pt-5">
            <legend className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="h-px w-5 bg-violet-400/60" /> Preferências
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Checkbox
                label="Conta Premium"
                description="Imposto de venda reduzido para 4%"
                checked={query.premium}
                onChange={(checked) => set('premium', checked ? '' : 'false')}
              />
              <Checkbox
                label="Usar foco"
                description="Inclui o consumo de foco da receita"
                checked={query.useFocus}
                onChange={(checked) => set('focus', checked ? 'true' : '')}
              />
              <Checkbox
                label="Cobertura completa"
                description="Oculta resultados com dados parciais"
                checked={query.requireComplete}
                onChange={(checked) =>
                  set('coverage', checked ? 'complete' : '')
                }
              />
              <Checkbox
                label="Apenas com lucro"
                description="Remove resultados com lucro negativo"
                checked={query.profitOnly}
                onChange={(checked) =>
                  set('profit_only', checked ? '' : 'false')
                }
              />
            </div>
          </fieldset>
        </div>
      </div>

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
        <div className="rounded-2xl border border-dashed border-stone-700/80 bg-gradient-to-b from-stone-900/40 to-stone-950 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-700 bg-stone-900 text-stone-400">
            <TrendingUp className="size-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-bold text-stone-200">
            Nenhuma oportunidade encontrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-stone-500">
            Não há receita com preços suficientes para estes filtros. Isso não
            representa lucro zero. Experimente aumentar o frescor ou limpar os
            filtros.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <ProductionTable rows={rows} onOpen={(row) => void openDetail(row)} />
      )}
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

      {selected && (
        <DetailDrawer
          row={selected}
          result={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function ProductionTable({
  rows,
  onOpen,
}: {
  rows: Opportunity[]
  onOpen: (row: Opportunity) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900/70 px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-stone-200">Ranking atual</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Cenário mais lucrativo encontrado para cada receita
          </p>
        </div>
        <span className="rounded-full bg-stone-800 px-2.5 py-1 text-xs font-semibold text-stone-400">
          {rows.length} nesta página
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <caption className="sr-only">Ranking de produção</caption>
          <thead className="bg-stone-900/80 text-[0.68rem] uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="p-4">Saída</th>
              <th className="p-4">Entradas</th>
              <th className="p-4">Cidade</th>
              <th className="p-4">Cenário</th>
              <th className="p-4">Custo</th>
              <th className="p-4">Venda bruta</th>
              <th className="p-4">Retorno</th>
              <th className="p-4">Estação</th>
              <th className="p-4">Lucro</th>
              <th className="p-4">ROI</th>
              <th className="p-4">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.kind}-${row.item}-${row.quality_level}-${row.buy_location}`}
                className="border-t border-stone-800 transition-colors hover:bg-stone-900"
              >
                <td className="p-4">
                  <strong className="text-stone-100">
                    {formatarNomeJogador(row.item_name, row.item)}
                  </strong>
                  <div className="mt-1 text-xs text-stone-500">
                    {formatarQualidade(row.quality_level)}
                  </div>
                  {(row.warnings ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.warnings?.map((warning) => (
                        <span
                          key={warning}
                          className="rounded bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200"
                        >
                          {warningLabels[warning] ?? warning}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-4 text-xs">
                  {(row.ingredients ?? []).length > 0
                    ? (row.ingredients ?? []).map((ingredient) => (
                        <div key={ingredient.item}>
                          {formatarNomeJogador(
                            ingredient.item_name,
                            ingredient.item,
                          )}{' '}
                          × {ingredient.purchase_quantity}
                        </div>
                      ))
                    : '—'}
                </td>
                <td className="p-4 font-medium text-sky-300">
                  {formatarLocalidade(row.buy_location)}
                </td>
                <td className="p-4 text-xs text-stone-300">
                  {modeLabels[row.acquisition_mode ?? ''] ?? '—'} →{' '}
                  {modeLabels[row.sale_mode ?? ''] ?? '—'}
                </td>
                <td className="p-4 font-semibold text-stone-200">
                  {formatarSilver(row.total_cost)}
                </td>
                <td className="p-4 font-semibold text-sky-200">
                  {formatarSilver(row.gross_revenue)}
                </td>
                <td className="p-4 text-xs">
                  {(row.ingredients ?? []).some(
                    (ingredient) =>
                      Number(ingredient.expected_return_quantity) > 0,
                  )
                    ? (row.ingredients ?? [])
                        .filter(
                          (ingredient) =>
                            Number(ingredient.expected_return_quantity) > 0,
                        )
                        .map((ingredient) => (
                          <div key={ingredient.item}>
                            {formatarNomeJogador(
                              ingredient.item_name,
                              ingredient.item,
                            )}{' '}
                            ×{' '}
                            {formatQuantity(
                              ingredient.expected_return_quantity,
                            )}
                          </div>
                        ))
                    : '—'}
                </td>
                <td className="p-4">{formatarSilver(row.station_cost)}</td>
                <td className="p-4">
                  <strong className="whitespace-nowrap rounded-lg border border-emerald-400/10 bg-emerald-400/10 px-2.5 py-1.5 text-emerald-300">
                    {formatarSilver(row.profit)}
                  </strong>
                </td>
                <td className="p-4 text-emerald-300">{formatarPct(row.roi)}</td>
                <td className="p-4">
                  <button
                    type="button"
                    className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:border-amber-300 hover:bg-amber-400/20"
                    onClick={() => onOpen(row)}
                  >
                    Analisar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DetailDrawer({
  row,
  result,
  loading,
  error,
  onClose,
}: {
  row: Opportunity
  result: CraftResult | null
  loading: boolean
  error: unknown
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <aside
        aria-label="Análise detalhada"
        role="dialog"
        aria-modal="true"
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-stone-700 bg-gradient-to-b from-stone-900 to-stone-950 p-5 shadow-2xl shadow-black sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">
              Análise detalhada
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              {formatarNomeJogador(row.item_name, row.item)}
            </h2>
            <p className="text-sm text-stone-400">
              {formatarLocalidade(row.buy_location)} ·{' '}
              {formatarQualidade(row.quality_level)}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-700 bg-stone-950 text-stone-400 transition hover:border-stone-500 hover:text-white"
            onClick={onClose}
            aria-label="Fechar análise"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {loading && <Carregando label="Calculando quatro cenários…" />}
        {Boolean(error) && (
          <EstadoErro title="Não foi possível calcular os detalhes" />
        )}
        {result && <DetailResult result={result} />}
        <Link
          className="mt-6 inline-flex items-center rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-bold text-stone-950 transition hover:bg-amber-200"
          to={`/calculadora?item=${encodeURIComponent(row.item)}`}
        >
          Abrir na calculadora
        </Link>
      </aside>
    </div>
  )
}

function DetailResult({ result }: { result: CraftResult }) {
  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {result.scenarios.map((scenario) => (
          <article
            key={`${scenario.acquisition_mode}-${scenario.sale_mode}`}
            className="rounded-xl border border-stone-800 bg-stone-900 p-4"
          >
            <h3 className="font-semibold">
              {modeLabels[scenario.acquisition_mode]} →{' '}
              {modeLabels[scenario.sale_mode]}
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <Line
                label="Custo"
                value={formatarSilver(scenario.costs.total_cost)}
              />
              <Line
                label="Receita líquida"
                value={formatarSilver(scenario.revenue.net_revenue)}
              />
              <Line label="Lucro" value={formatarSilver(scenario.profit)} />
              <Line label="ROI" value={formatarPct(scenario.roi)} />
            </dl>
            {scenario.warnings.length > 0 && (
              <p className="mt-3 text-xs text-amber-200">
                {scenario.warnings
                  .map((warning) => warningLabels[warning] ?? warning)
                  .join(' · ')}
              </p>
            )}
          </article>
        ))}
      </div>
      <section>
        <h3 className="font-semibold">Ingredientes</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {result.ingredients.map((ingredient) => (
            <li
              key={`${ingredient.position}-${ingredient.unique_name}`}
              className="rounded border border-stone-800 p-3"
            >
              <strong>
                {formatarNomeJogador(null, ingredient.unique_name)}
              </strong>
              <div className="mt-1 text-stone-400">
                Bruto {ingredient.gross_quantity} · retorno esperado{' '}
                {String(ingredient.expected_return_quantity)} · comprar{' '}
                {ingredient.purchase_quantity}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-stone-400">
        Produção {result.produced_quantity} · execuções {result.executions} ·
        foco consumido {result.focus_consumed}
      </p>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
        onChange={(event) => onChange(event.target.value)}
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
