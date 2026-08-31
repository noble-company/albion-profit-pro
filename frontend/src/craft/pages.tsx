import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { useServer } from '@/app/ServerContext'
import { EstadoErro, EstadoVazio, Carregando } from '@/components/ui/states'
import { formatarPct, formatarSilver } from '@/lib/formatters'
import { getLocations, type Location } from '@/prices/service'
import { simulateCraft, type CraftRequest, type CraftResult } from './service'
type FormValues = Omit<CraftRequest, 'server'>
const PREFS = 'albion-profit-pro:calculator:v1'
function Result({ result }: { result: CraftResult }) {
  return (
    <section className="mt-8">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
        <p className="text-sm uppercase tracking-widest text-amber-300">
          Cenário pessimista imediato
        </p>
        <p className="mt-2 text-2xl font-bold">
          {result.scenarios[0]?.profit == null
            ? 'Resultado indisponível'
            : formatarSilver(result.scenarios[0].profit)}
        </p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {result.scenarios.map((scenario, index) => (
          <article
            key={`${scenario.acquisition_mode}-${scenario.sale_mode}`}
            className="rounded-xl border border-stone-800 bg-stone-900 p-4"
          >
            <h3 className="font-semibold">
              {index === 0 ? 'Pessimista · ' : ''}
              {scenario.acquisition_mode} → {scenario.sale_mode}
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Custo total</dt>
                <dd>
                  {scenario.costs.total_cost == null
                    ? 'Indisponível'
                    : formatarSilver(scenario.costs.total_cost)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Receita líquida</dt>
                <dd>
                  {scenario.revenue.net_revenue == null
                    ? 'Indisponível'
                    : formatarSilver(scenario.revenue.net_revenue)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Lucro</dt>
                <dd>
                  {scenario.profit == null
                    ? 'Indisponível'
                    : formatarSilver(scenario.profit)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>ROI</dt>
                <dd>
                  {scenario.roi == null
                    ? 'Indisponível'
                    : formatarPct(scenario.roi)}
                </dd>
              </div>
            </dl>
            {scenario.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-200">
                {scenario.warnings.map((w) => (
                  <li key={w}>Aviso: {w}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      <p className="mt-5 text-sm text-stone-400">
        Produção: {result.produced_quantity} · Execuções: {result.executions} ·
        Sobra: {result.surplus_quantity} · Foco: {result.focus_consumed}
      </p>
      <h3 className="mt-6 font-semibold">Ingredientes</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {result.ingredients.map((ingredient) => (
          <li
            key={`${ingredient.position}-${ingredient.unique_name}`}
            className="rounded border border-stone-800 p-3"
          >
            <span className="font-medium">{ingredient.unique_name}</span> ·
            bruto {ingredient.gross_quantity} · efetivo{' '}
            {String(ingredient.effective_quantity)} · compra{' '}
            {ingredient.purchase_quantity}
          </li>
        ))}
      </ul>
    </section>
  )
}
export function CalculadoraPage() {
  const { realm } = useServer()
  const [searchParams] = useSearchParams()
  const [locations, setLocations] = useState<Location[]>([])
  const [result, setResult] = useState<CraftResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      output_item: searchParams.get('item') || 'T2_CLOTH',
      quantity: 1,
      output_quality: 1,
      scope: 'all',
      return_rate: '0',
      station_cost_per_execution: '0',
      use_focus: false,
      premium: true,
      sales_tax_rate: null,
      setup_fee_rate: null,
      ingredient_overrides: {},
      manual_prices: {},
      location_id: '',
    },
  })
  useEffect(() => {
    const c = new AbortController()
    void getLocations(c.signal)
      .then(setLocations)
      .catch(() => undefined)
    return () => c.abort()
  }, [])
  if (!realm)
    return (
      <EstadoVazio title="Escolha um servidor">
        Selecione um servidor antes de simular.
      </EstadoVazio>
    )
  const submit = async (values: FormValues) => {
    setLoading(true)
    setError(null)
    try {
      localStorage.setItem(
        PREFS,
        JSON.stringify({
          version: 1,
          output_quality: values.output_quality,
          scope: values.scope,
          premium: values.premium,
          use_focus: values.use_focus,
        }),
      )
      setResult(
        await simulateCraft({
          server: realm,
          ...values,
          quantity: Number(values.quantity),
          output_quality: Number(values.output_quality),
          return_rate: String(values.return_rate),
          station_cost_per_execution: String(values.station_cost_per_execution),
        }),
      )
    } catch (e) {
      setError(e)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }
  return (
    <section>
      <p className="text-sm uppercase tracking-widest text-amber-400">
        {realm}
      </p>
      <h1 className="mt-2 text-3xl font-bold">Calculadora de craft</h1>
      <form
        className="mt-6 grid gap-4 rounded-xl border border-stone-800 bg-stone-900 p-5 md:grid-cols-3"
        onSubmit={(e) => void handleSubmit(submit)(e)}
      >
        <label>
          Item canônico
          <input
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('output_item', { required: 'Informe o item' })}
          />
          {errors.output_item && (
            <small className="text-red-300">{errors.output_item.message}</small>
          )}
        </label>
        <label>
          Quantidade
          <input
            type="number"
            min="1"
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('quantity', {
              valueAsNumber: true,
              min: { value: 1, message: 'Mínimo 1' },
            })}
          />
        </label>
        <label>
          Cidade
          <select
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('location_id', { required: 'Selecione a cidade' })}
          >
            <option value="">Selecionar</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {l.name ?? l.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Qualidade
          <select
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('output_quality', { valueAsNumber: true })}
          >
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Escopo
          <select
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('scope')}
          >
            <option value="all">Toda plataforma</option>
            <option value="mine">Minha cobertura</option>
          </select>
        </label>
        <label>
          Retorno de recursos
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('return_rate')}
          />
        </label>
        <label>
          Custo da estação
          <input
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-3 py-2"
            {...register('station_cost_per_execution')}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('use_focus')} /> Usar foco
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('premium')} /> Premium
        </label>
        <button
          className="rounded bg-amber-400 px-4 py-2 font-semibold text-stone-950 md:col-span-3"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Calculando…' : 'Simular craft'}
        </button>
      </form>
      {Boolean(error) && (
        <div className="mt-5">
          <EstadoErro
            title="Não foi possível simular"
            onRetry={() => undefined}
          />
        </div>
      )}
      {loading && <Carregando label="Calculando cenários…" />}
      {result && <Result result={result} />}
    </section>
  )
}
