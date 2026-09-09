import { useMutation } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { ItemAutocomplete } from '@/components/ItemAutocomplete'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import { WarningBadges } from '@/components/opportunities/WarningBadges'
import { MODE_LABELS } from '@/lib/craft-labels'
import { formatarNomeItem, formatarPct, formatarSilver } from '@/lib/formatters'
import { useLocationName } from '@/lib/locations'
import { useLocations } from '@/prices/hooks'

import { simulateCraft, type CraftRequest, type CraftResult } from './service'

type FormValues = Omit<CraftRequest, 'server'>
const PREFS = 'albion-profit-pro:calculator:v1'

const BASE_DEFAULTS: FormValues = {
  output_item: '',
  quantity: 1,
  output_quality: 1,
  scope: 'all',
  return_rate: '0',
  station_fee_per_100_nutrition: '0',
  use_focus: false,
  premium: true,
  sales_tax_rate: null,
  setup_fee_rate: null,
  ingredient_overrides: {},
  manual_prices: {},
  location_id: '',
}

/** Preferências gravadas no `submit` — antes eram escritas e nunca lidas (task 3.5/24 item 1). */
function readPrefs(): Partial<FormValues> {
  try {
    const raw = localStorage.getItem(PREFS)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as {
      version?: number
      output_quality?: number
      scope?: FormValues['scope']
      premium?: boolean
      use_focus?: boolean
    }
    if (parsed.version !== 1) return {}
    return {
      output_quality: parsed.output_quality,
      scope: parsed.scope,
      premium: parsed.premium,
      use_focus: parsed.use_focus,
    }
  } catch {
    return {}
  }
}

function Result({ result }: { result: CraftResult }) {
  return (
    <section className="mt-8">
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
        <p className="text-sm uppercase tracking-widest text-primary">
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
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h3 className="font-semibold">
              {index === 0 ? 'Pessimista · ' : ''}
              {MODE_LABELS[scenario.acquisition_mode] ??
                scenario.acquisition_mode}{' '}
              → {MODE_LABELS[scenario.sale_mode] ?? scenario.sale_mode}
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Custo total</dt>
                <dd className="tabular-nums">
                  {formatarSilver(scenario.costs.total_cost)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Receita líquida</dt>
                <dd className="tabular-nums">
                  {formatarSilver(scenario.revenue.net_revenue)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Lucro</dt>
                <dd className="tabular-nums text-profit">
                  {formatarSilver(scenario.profit)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>ROI</dt>
                <dd className="tabular-nums text-profit">
                  {formatarPct(scenario.roi)}
                </dd>
              </div>
            </dl>
            <WarningBadges warnings={scenario.warnings} className="mt-3" />
          </article>
        ))}
      </div>
      <p className="mt-5 text-sm text-foreground-muted">
        Produção: {result.produced_quantity} · Execuções: {result.executions} ·
        Sobra: {result.surplus_quantity} · Foco: {result.focus_consumed}
      </p>
      <h3 className="mt-6 font-semibold">Ingredientes</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {result.ingredients.map((ingredient) => (
          <li
            key={`${ingredient.position}-${ingredient.unique_name}`}
            className="rounded border border-border p-3"
          >
            <span className="font-medium">
              {formatarNomeItem(null, ingredient.unique_name)}
            </span>{' '}
            · bruto {ingredient.gross_quantity} · efetivo{' '}
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
  const locations = useLocations()
  const locationName = useLocationName()
  const mutation = useMutation({ mutationFn: simulateCraft })
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      ...BASE_DEFAULTS,
      ...readPrefs(),
      output_item: searchParams.get('item') || '',
    },
  })

  if (!realm)
    return (
      <EstadoVazio title="Escolha um servidor">
        Selecione um servidor antes de simular.
      </EstadoVazio>
    )

  const runSimulation = (values: FormValues) => {
    localStorage.setItem(
      PREFS,
      JSON.stringify({
        version: 1,
        output_quality: Number(values.output_quality),
        scope: values.scope,
        premium: values.premium,
        use_focus: values.use_focus,
      }),
    )
    mutation.mutate({
      server: realm,
      ...values,
      quantity: Number(values.quantity),
      output_quality: Number(values.output_quality),
      return_rate: String(values.return_rate),
      station_fee_per_100_nutrition: String(values.station_fee_per_100_nutrition),
    })
  }

  const lastVariables = mutation.variables
  const retryLastSimulation = lastVariables
    ? () => mutation.mutate(lastVariables)
    : undefined

  return (
    <section>
      <p className="text-sm uppercase tracking-widest text-primary">{realm}</p>
      <h1 className="mt-2 text-3xl font-bold">Calculadora de craft</h1>
      <form
        className="mt-6 grid gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-3"
        onSubmit={(event) => void handleSubmit(runSimulation)(event)}
      >
        <div className="md:col-span-3">
          <Controller
            control={control}
            name="output_item"
            rules={{ required: 'Informe o item' }}
            render={({ field }) => (
              <ItemAutocomplete
                label="Item"
                value={field.value}
                onChange={field.onChange}
                filters={{ apenas_craftaveis: true }}
                error={errors.output_item?.message}
                autoFocus
              />
            )}
          />
        </div>
        <label>
          Quantidade
          <input
            type="number"
            min="1"
            className="mt-1 w-full rounded border border-border-strong bg-background px-3 py-2"
            {...register('quantity', {
              valueAsNumber: true,
              min: { value: 1, message: 'Mínimo 1' },
            })}
          />
        </label>
        <label>
          Cidade
          <select
            className="mt-1 w-full rounded border border-border-strong bg-background px-3 py-2"
            {...register('location_id', { required: 'Selecione a cidade' })}
          >
            <option value="">Selecionar</option>
            {locations.map((location) => (
              <option key={location.location_id} value={location.location_id}>
                {locationName(location.location_id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Qualidade
          <select
            className="mt-1 w-full rounded border border-border-strong bg-background px-3 py-2"
            {...register('output_quality', { valueAsNumber: true })}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Escopo
          <select
            className="mt-1 w-full rounded border border-border-strong bg-background px-3 py-2"
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
            className="mt-1 w-full rounded border border-border-strong bg-background px-3 py-2"
            {...register('return_rate')}
          />
        </label>
        <label>
          {/* Taxa de uso por 100 de nutrição, que é como a estação cobra no jogo — não prata
              fixa por execução (task 4/18). */}
          Taxa da estação (por 100 de nutrição)
          <input
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full rounded border border-border-strong bg-background px-3 py-2"
            {...register('station_fee_per_100_nutrition')}
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('use_focus')} /> Usar foco
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('premium')} /> Premium
        </label>
        <button
          className="rounded bg-primary px-4 py-2 font-semibold text-on-primary md:col-span-3"
          disabled={mutation.isPending}
          type="submit"
        >
          {mutation.isPending ? 'Calculando…' : 'Simular craft'}
        </button>
      </form>
      {mutation.isError && (
        <div className="mt-5">
          <EstadoErro
            title="Não foi possível simular"
            onRetry={retryLastSimulation}
          />
        </div>
      )}
      {mutation.isPending && <Carregando label="Calculando cenários…" />}
      {mutation.data && <Result result={mutation.data} />}
    </section>
  )
}
