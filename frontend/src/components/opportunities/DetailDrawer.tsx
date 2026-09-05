import { X } from 'lucide-react'
import { Link } from 'react-router'

import { Carregando, EstadoErro } from '@/components/ui/states'
import type { CraftResult } from '@/craft/service'
import {
  formatarNomeItem,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { useLocationName } from '@/lib/locations'
import { MODE_LABELS } from '@/opportunities/labels'
import type { Opportunity } from '@/opportunities/service'

import { WarningBadges } from './WarningBadges'

/**
 * Gaveta de análise detalhada de uma linha do ranking de produção (F05, task 3.5/20). A
 * acessibilidade (foco preso, `Esc`, `aria`) é da task 25 — aqui o DOM é o que já existia.
 */
export function DetailDrawer({
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
  const locationName = useLocationName()
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
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-border-strong bg-gradient-to-b from-surface to-background p-5 shadow-2xl shadow-black sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">
              Análise detalhada
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              {formatarNomeItem(row.item_name, row.item)}
            </h2>
            <p className="text-sm text-foreground-muted">
              {locationName(row.buy_location)} ·{' '}
              {formatarQualidade(row.quality_level)}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-background text-foreground-muted transition hover:border-border-strong hover:text-foreground"
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
          className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:bg-primary-hover"
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
            className="rounded-xl border border-border bg-surface p-4"
          >
            <h3 className="font-semibold">
              {MODE_LABELS[scenario.acquisition_mode]} →{' '}
              {MODE_LABELS[scenario.sale_mode]}
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
            <WarningBadges warnings={scenario.warnings} className="mt-3" />
          </article>
        ))}
      </div>
      <section>
        <h3 className="font-semibold">Ingredientes</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {result.ingredients.map((ingredient) => (
            <li
              key={`${ingredient.position}-${ingredient.unique_name}`}
              className="rounded border border-border p-3"
            >
              <strong>{formatarNomeItem(null, ingredient.unique_name)}</strong>
              <div className="mt-1 text-foreground-muted">
                Bruto {ingredient.gross_quantity} · retorno esperado{' '}
                {String(ingredient.expected_return_quantity)} · comprar{' '}
                {ingredient.purchase_quantity}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-foreground-muted">
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
