import { useQuery } from '@tanstack/react-query'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { queryPolicies } from '@/api'
import type { components } from '@/api/schema'
import { EstadoVazio, Carregando, EstadoErro } from '@/components/ui/states'
import { formatarSilver } from '@/lib/formatters'
import { getDemand } from './service'

export function useDemand(
  item: string,
  server: components['schemas']['AlbionServer'] | null,
  location: string | undefined,
  quality: number | undefined,
  enchantment: number,
) {
  const enabled = Boolean(server && location && quality !== undefined)
  const { data, error } = useQuery({
    queryKey: ['demand', item, server, location, quality, enchantment] as const,
    queryFn: ({ signal }) => {
      if (!server || !location || quality === undefined) {
        throw new Error('Selecione cidade e qualidade')
      }
      return getDemand(item, server, location, quality, enchantment, signal)
    },
    enabled,
    ...queryPolicies.demand,
  })
  return {
    data: enabled ? (data ?? null) : null,
    error: enabled ? error : null,
  }
}
function Card({
  title,
  units,
  price,
}: {
  title: string
  units: number
  price: string | null | undefined
}) {
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm text-foreground-muted">{title}</h3>
      <p className="mt-2 text-xl font-semibold">
        {units.toLocaleString('pt-BR')} unidades
      </p>
      {price && (
        <p className="mt-1 text-sm text-foreground-muted">
          Médio: {formatarSilver(price)}
        </p>
      )}
    </article>
  )
}
export function DemandaItem({
  item,
  server,
  location,
  quality,
  enchantment,
}: {
  item: string
  server: components['schemas']['AlbionServer']
  location?: string
  quality?: number
  enchantment: number
}) {
  const { data, error } = useDemand(
    item,
    server,
    location,
    quality,
    enchantment,
  )
  if (!location || quality === undefined)
    return (
      <EstadoVazio title="Defina cidade e qualidade">
        Selecione cidade e qualidade para consultar demanda.
      </EstadoVazio>
    )
  if (error) return <EstadoErro title="Não foi possível carregar a demanda" />
  if (!data) return <Carregando label="Carregando demanda…" />
  const points = data.series_6h.map((point) => ({
    hora: new Date(point.start).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    unidades: point.units,
  }))
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold">Demanda e histórico</h2>
      <p className="mt-2 text-sm text-foreground-muted">
        Os dados representam unidades, ordens e volume agregado; não identificam
        pessoas compradoras.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Livro atual · venda"
          units={data.book.sell.observed_units}
          price={data.book.sell.best_price}
        />
        <Card
          title="Livro atual · compra"
          units={data.book.buy.observed_units}
          price={data.book.buy.best_price}
        />
        <Card
          title="Vendido · 24 h"
          units={data.sold.last_24h.units}
          price={data.sold.last_24h.average_price}
        />
        <Card
          title="Vendido · 7 d"
          units={data.sold.last_7d.units}
          price={data.sold.last_7d.average_price}
        />
        <Card
          title="Vendido · 30 d"
          units={data.sold.last_30d.units}
          price={data.sold.last_30d.average_price}
        />
      </div>
      <h3 className="mt-8 text-lg font-semibold">
        Tendência das últimas 6 horas
      </h3>
      {points.length === 0 ? (
        <EstadoVazio title="Sem série histórica" />
      ) : (
        <>
          <div className="mt-3 h-64" aria-label="Gráfico de unidades por hora">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <XAxis dataKey="hora" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="unidades"
                  stroke="var(--color-primary)"
                  name="Unidades"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-4 w-full text-left text-sm">
            <caption className="sr-only">
              Tabela alternativa da série de 6 horas
            </caption>
            <thead>
              <tr>
                <th className="p-2">Hora local</th>
                <th className="p-2">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.hora} className="border-t border-border">
                  <td className="p-2">{point.hora}</td>
                  <td className="p-2">{point.unidades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
