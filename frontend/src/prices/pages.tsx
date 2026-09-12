import { useParams, useSearchParams } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { Button } from '@/components/ui/button'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import {
  formatarIdade,
  formatarNomeItem,
  formatarSilver,
} from '@/lib/formatters'
import { useLocationName } from '@/lib/locations'

import { DemandaItem } from './demand'
// Task 4/09: as classes vêm do módulo canônico de filtros, não de uma cópia local.
import { filterControl, filterLabel } from '@/components/filters'

import { useItem, useItemPrices, useLocations } from './hooks'


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
  const item = useItem(uniqueName)
  const places = useLocations()
  const locationName = useLocationName()
  // Qualidade e encantamento são filtrados no servidor, ANTES da paginação (F08); `total` e
  // as linhas já vêm do conjunto certo.
  const rows = data.data?.prices ?? []
  const isFiltered = Boolean(selectedQuality || selectedEnchant)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('offset')
    setParams(next)
  }
  const setOffset = (value: number) => {
    const next = new URLSearchParams(params)
    if (value > 0) next.set('offset', String(value))
    else next.delete('offset')
    setParams(next)
  }

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

  const demandLocation = selectedLocation || undefined
  const demandQuality = selectedQuality ? Number(selectedQuality) : undefined

  return (
    <section>
      <p className="text-sm uppercase tracking-widest text-primary">{realm}</p>
      <h1 className="mt-2 text-3xl font-bold">
        {formatarNomeItem(item?.name_pt ?? item?.name_en, uniqueName)}
      </h1>
      <p className="mt-1 break-all text-sm text-foreground-subtle">
        {uniqueName}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <label className={`${filterLabel} flex items-center gap-2`}>
          Escopo
          <select
            aria-label="Escopo"
            value={scope}
            onChange={(event) => setParam('scope', event.target.value)}
            className={filterControl}
          >
            <option value="all">Toda plataforma</option>
            <option value="mine">Minha cobertura</option>
          </select>
        </label>
        <label className={`${filterLabel} flex items-center gap-2`}>
          Cidade
          <select
            aria-label="Cidade"
            value={selectedLocation}
            onChange={(event) => setParam('location_id', event.target.value)}
            className={filterControl}
          >
            <option value="">Todas</option>
            {places.map((place) => (
              <option key={place.location_id} value={place.location_id}>
                {locationName(place.location_id)}
              </option>
            ))}
          </select>
        </label>
        <label className={`${filterLabel} flex items-center gap-2`}>
          Qualidade
          <select
            aria-label="Qualidade"
            value={selectedQuality}
            onChange={(event) => setParam('quality', event.target.value)}
            className={filterControl}
          >
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((quality) => (
              <option key={quality} value={quality}>
                {quality}
              </option>
            ))}
          </select>
        </label>
        <label className={`${filterLabel} flex items-center gap-2`}>
          Encantamento
          <select
            aria-label="Encantamento"
            value={selectedEnchant}
            onChange={(event) => setParam('enchantment', event.target.value)}
            className={filterControl}
          >
            <option value="">Todos</option>
            {[0, 1, 2, 3, 4].map((enchant) => (
              <option key={enchant} value={enchant}>
                .{enchant}
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

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
          <thead className="bg-surface text-2xs uppercase tracking-[0.12em] text-foreground-subtle">
            <tr>
              <th className="h-11 border-b border-border px-3 text-left">
                Cidade
              </th>
              <th className="h-11 border-b border-border px-3 text-left">
                Qual./Enc.
              </th>
              <th className="h-11 border-b border-border px-3 text-right">
                Venda (ask)
              </th>
              <th className="h-11 border-b border-border px-3 text-right">
                Compra (bid)
              </th>
              <th className="h-11 border-b border-border px-3 text-right">
                Vendido 24h
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.location_id}-${row.quality_level}-${row.enchantment_level}`}
                className="transition-colors hover:bg-surface"
              >
                <td className="border-b border-border px-3 py-2 font-medium">
                  {locationName(row.location_id)}
                </td>
                <td className="border-b border-border px-3 py-2 tabular-nums">
                  {row.quality_level} / .{row.enchantment_level}
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                  {row.sell.best_price
                    ? formatarSilver(row.sell.best_price)
                    : 'Sem cobertura'}
                  <span className="block text-xs text-foreground-subtle">
                    {formatarIdade(row.sell.observed_at)}
                  </span>
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                  {row.buy.best_price
                    ? formatarSilver(row.buy.best_price)
                    : 'Sem cobertura'}
                  <span className="block text-xs text-foreground-subtle">
                    {formatarIdade(row.buy.observed_at)}
                  </span>
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums">
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

      <div className="mt-4 flex items-center justify-between text-sm text-foreground-muted">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Anterior
        </Button>
        <span>
          {offset + 1}–{Math.min(offset + limit, data.data?.total ?? 0)} de{' '}
          {data.data?.total ?? 0}
          {isFiltered ? ' filtrados' : ''}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data.data || offset + limit >= data.data.total}
          onClick={() => setOffset(offset + limit)}
        >
          Próxima
        </Button>
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
