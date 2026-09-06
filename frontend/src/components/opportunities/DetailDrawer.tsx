import { Link } from 'react-router'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Carregando, EstadoErro } from '@/components/ui/states'
import type { CraftResult } from '@/craft/service'
import { MODE_LABELS } from '@/lib/craft-labels'
import {
  formatarNomeItem,
  formatarPct,
  formatarQualidade,
  formatarSilver,
} from '@/lib/formatters'
import { useLocationName } from '@/lib/locations'
import type { Opportunity } from '@/opportunities/service'

import { WarningBadges } from './WarningBadges'

/**
 * Gaveta de análise detalhada de uma linha do ranking (task 3.5/20, acessível na 3.5/25).
 * Sobre o `Sheet` do Radix: trap de foco, `Esc`, restauração de foco ao gatilho e scroll lock
 * vêm do primitivo — nada reimplementado à mão.
 */
export function DetailDrawer({
  row,
  result,
  loading,
  error,
  open,
  onOpenChange,
}: {
  row: Opportunity | null
  result: CraftResult | null
  loading: boolean
  error: unknown
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const locationName = useLocationName()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-2xl gap-0 overflow-y-auto sm:max-w-2xl"
      >
        {row && (
          <>
            <SheetHeader className="text-left">
              <p className="text-xs uppercase tracking-widest text-primary">
                Análise detalhada
              </p>
              <SheetTitle className="text-2xl font-bold">
                {formatarNomeItem(row.item_name, row.item)}
              </SheetTitle>
              <SheetDescription>
                {locationName(row.buy_location)} ·{' '}
                {formatarQualidade(row.quality_level)}
              </SheetDescription>
            </SheetHeader>
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
          </>
        )}
      </SheetContent>
    </Sheet>
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
