import { useParams, useSearchParams } from 'react-router'
import { useServer } from '@/app/ServerContext'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import { formatarIdade, formatarSilver } from '@/lib/formatters'
import { useLocationName } from '@/lib/locations'
import { useItemPrices, useLocations } from './hooks'
import { DemandaItem } from './demand'

export function ItemPricesPage() {
  const { uniqueName = '' } = useParams()
  const { realm } = useServer()
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') === 'mine' ? 'mine' : 'all'
  const selectedLocation = params.get('location_id') ?? ''
  const locations = selectedLocation ? [selectedLocation] : []
  const limit = 20
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const selectedQuality = params.get('quality') ?? ''
  const selectedEnchant = params.get('enchantment') ?? ''
  const filters = {
    quality: selectedQuality ? Number(selectedQuality) : undefined,
    enchantment: selectedEnchant ? Number(selectedEnchant) : undefined,
  }
  const data = useItemPrices(
    uniqueName,
    realm,
    scope,
    locations,
    limit,
    offset,
    filters,
  )
  const places = useLocations()
  const locationName = useLocationName()
  // Qualidade e encantamento são filtrados no servidor, ANTES da paginação (F08); `total` e
  // as linhas já vêm do conjunto certo.
  const rows = data.data?.prices ?? []
  const isFiltered = Boolean(selectedQuality || selectedEnchant)
  if (!realm)
    return (
      <EstadoVazio title="Escolha um servidor">
        Selecione um servidor para consultar preços.
      </EstadoVazio>
    )
  if (data.loading && !data.data)
    return <Carregando label="Carregando preços…" />
  if (data.error && !data.data)
    return <EstadoErro title="Não foi possível carregar os preços" />
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('offset')
    setParams(next)
  }
  const demandLocation = selectedLocation || undefined
  const demandQuality = selectedQuality ? Number(selectedQuality) : undefined
  return (
    <section>
      <p className="text-sm uppercase tracking-widest text-primary">{realm}</p>
      <h1 className="mt-2 break-all text-3xl font-bold">{uniqueName}</h1>
      <div className="mt-5 flex flex-wrap gap-3">
        <label>
          Escopo
          <select
            aria-label="Escopo"
            value={scope}
            onChange={(e) => update('scope', e.target.value)}
            className="ml-2 rounded border border-border-strong bg-background px-2 py-1"
          >
            <option value="all">Toda plataforma</option>
            <option value="mine">Minha cobertura</option>
          </select>
        </label>
        <label>
          Cidade
          <select
            aria-label="Cidade"
            value={selectedLocation}
            onChange={(e) => update('location_id', e.target.value)}
            className="ml-2 rounded border border-border-strong bg-background px-2 py-1"
          >
            <option value="">Todas</option>
            {places.map((place) => (
              <option key={place.location_id} value={place.location_id}>
                {locationName(place.location_id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Qualidade
          <select
            aria-label="Qualidade"
            value={selectedQuality}
            onChange={(e) => update('quality', e.target.value)}
            className="ml-2 rounded border border-border-strong bg-background px-2 py-1"
          >
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label>
          Encantamento
          <select
            aria-label="Encantamento"
            value={selectedEnchant}
            onChange={(e) => update('enchantment', e.target.value)}
            className="ml-2 rounded border border-border-strong bg-background px-2 py-1"
          >
            <option value="">Todos</option>
            {[0, 1, 2, 3, 4].map((e) => (
              <option key={e} value={e}>
                .{e}
              </option>
            ))}
          </select>
        </label>
      </div>
      {scope === 'mine' && (
        <p className="mt-3 text-sm text-foreground-muted">
          “Minha cobertura” mostra somente combinações coletadas por esta conta;
          livro e histórico têm cobertura independente.
        </p>
      )}
      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface">
            <tr>
              <th className="p-3">Cidade</th>
              <th className="p-3">Qual./Enc.</th>
              <th className="p-3">Venda (ask)</th>
              <th className="p-3">Compra (bid)</th>
              <th className="p-3">Vendido 24h</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.location_id}-${row.quality_level}-${row.enchantment_level}`}
                className="border-t border-border"
              >
                <td className="p-3">{locationName(row.location_id)}</td>
                <td className="p-3">
                  {row.quality_level} / .{row.enchantment_level}
                </td>
                <td className="p-3">
                  {row.sell.best_price
                    ? formatarSilver(row.sell.best_price)
                    : 'Sem cobertura'}
                  <br />
                  <span className="text-xs text-foreground-subtle">
                    {formatarIdade(row.sell.observed_at)}
                  </span>
                </td>
                <td className="p-3">
                  {row.buy.best_price
                    ? formatarSilver(row.buy.best_price)
                    : 'Sem cobertura'}
                  <br />
                  <span className="text-xs text-foreground-subtle">
                    {formatarIdade(row.buy.observed_at)}
                  </span>
                </td>
                <td className="p-3">
                  {row.sold_24h ? `${row.sold_24h.units} un.` : 'Sem histórico'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-6">
            <EstadoVazio title="Sem cobertura/dado">
              A API não encontrou esta combinação; ausência não significa preço
              zero.
            </EstadoVazio>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-between">
        <button
          disabled={offset === 0}
          onClick={() =>
            setParams(
              new URLSearchParams([
                ...params,
                ['offset', String(Math.max(0, offset - limit))],
              ]),
            )
          }
          className="rounded border border-border-strong px-3 py-2 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="py-2 text-sm text-foreground-muted">
          {offset + 1}–{Math.min(offset + limit, data.data?.total ?? 0)} de{' '}
          {data.data?.total ?? 0}
          {isFiltered ? ' filtrados' : ''}
        </span>
        <button
          disabled={!data.data || offset + limit >= data.data.total}
          onClick={() =>
            setParams(
              new URLSearchParams([
                ...params,
                ['offset', String(offset + limit)],
              ]),
            )
          }
          className="rounded border border-border-strong px-3 py-2 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
      <DemandaItem
        item={uniqueName}
        server={realm}
        location={demandLocation}
        quality={demandQuality}
        enchantment={selectedEnchant ? Number(selectedEnchant) : 0}
      />
    </section>
  )
}
