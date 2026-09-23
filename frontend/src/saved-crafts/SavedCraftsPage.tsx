import { AlertTriangle, Bookmark } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useServer } from '@/app/ServerContext'
import { useRecipeCatalog } from '@/catalog/hooks'
import { Button } from '@/components/ui/button'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import { useToast } from '@/components/ui/ToastProvider'
import { formatarIdade, formatarNomeItem } from '@/lib/formatters'
import { useCidades, useLocationName } from '@/lib/locations'
import { DetalheDaLinha } from '@/scanner/DetalheDaLinha'
import { buildPriceIndex } from '@/scanner/prices'
import { usePriceSnapshot } from '@/scanner/usePriceSnapshot'
import { useSalesVolume } from '@/scanner/useSalesVolume'
import { buildSalesIndex } from '@/scanner/vendas'

import { calculateSavedCrafts, type SavedCraftView } from './calculation'
import { DEFAULT_MAX_AGE_HOURS, parseMaxAge, sanitizePriceIndex } from './freshness'
import { useDeleteSavedCraft, useSavedCrafts } from './hooks'
import { SavedCraftsTable } from './SavedCraftsTable'
import { sortSavedCrafts, type SavedCraftSort } from './sorting'

function savedCraftAnalysisHref(view: SavedCraftView): string {
  const item = encodeURIComponent(view.saved.output_item)
  const quantity = view.saved.quantity
  if (view.productionKind === 'refining') return `/refino?q=${item}&qty=${quantity}`
  return `/calculadora?item=${item}&qty=${quantity}&quality=${view.saved.output_quality}`
}

export function SavedCraftsPage() {
  const { realm } = useServer()
  const { toast } = useToast()
  const cidades = useCidades()
  const locationName = useLocationName()
  const [searchParams, setSearchParams] = useSearchParams()
  const maxAge = parseMaxAge(searchParams.get('max_age'))
  const [maxAgeInput, setMaxAgeInput] = useState(searchParams.get('max_age') ?? '24')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SavedCraftSort>({ field: 'name', direction: 'asc' })
  const saved = useSavedCrafts(realm)
  // A bancada reúne receitas das três abas; sem `kind`, o catálogo contém craft e refino.
  const catalog = useRecipeCatalog(null)
  const remove = useDeleteSavedCraft()

  const outputItems = useMemo(
    () => [...new Set(saved.crafts.map((craft) => craft.output_item))].sort(),
    [saved.crafts],
  )
  const recorte = useMemo(() => ({ outputItems }), [outputItems])
  const marketIds = useMemo(() => cidades.flatMap((city) => city.ids), [cidades])
  const canonical = useCallback(
    (id: string) => cidades.find((city) => city.ids.includes(id))?.id ?? id,
    [cidades],
  )
  const prices = usePriceSnapshot(realm, marketIds, recorte, outputItems.length > 0)
  const sales = useSalesVolume(realm, recorte, outputItems.length > 0)
  const rawPriceIndex = useMemo(
    () => (prices.snapshot ? buildPriceIndex(prices.snapshot, canonical) : null),
    [prices.snapshot, canonical],
  )
  const sanitized = useMemo(
    () =>
      rawPriceIndex
        ? sanitizePriceIndex(
            rawPriceIndex,
            maxAge,
            prices.updatedAt / 1000,
          )
        : null,
    // `updatedAt` avança a cada polling mesmo quando o preço não mudou: o relógio também pode
    // fazer uma cotação cruzar o limite e ela precisa sair da conta sem esperar preço novo.
    [rawPriceIndex, maxAge, prices.updatedAt],
  )
  const salesIndex = useMemo(
    () => (sales.vendas ? buildSalesIndex(sales.vendas, canonical) : null),
    [sales.vendas, canonical],
  )
  const views = useMemo(
    () =>
      catalog.catalog && sanitized
        ? calculateSavedCrafts(saved.crafts, catalog.catalog, sanitized.index, cidades, salesIndex)
        : [],
    [saved.crafts, catalog.catalog, sanitized, cidades, salesIndex],
  )
  const sorted = useMemo(() => sortSavedCrafts(views, sort), [views, sort])
  const currentCount = views.filter((view) => view.row?.state === 'priced').length
  const itemNames = useMemo(
    () => new Map(catalog.catalog?.items.map((item) => [item.unique_name, item]) ?? []),
    [catalog.catalog],
  )
  const nomeItem = useCallback(
    (uniqueName: string) => {
      const item = itemNames.get(uniqueName)
      return formatarNomeItem(item?.name_pt ?? item?.name_en, uniqueName)
    },
    [itemNames],
  )

  // Back/forward também muda a URL. A sincronização assíncrona evita cascata no efeito e não
  // interrompe o rascunho enquanto a pessoa apaga o campo para digitar outro valor.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setMaxAgeInput(searchParams.get('max_age') ?? '24'),
      0,
    )
    return () => window.clearTimeout(timer)
  }, [searchParams])

  const handleMaxAge = (raw: string) => {
    setMaxAgeInput(raw)
    const next = new URLSearchParams(searchParams)
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return
    if (value === DEFAULT_MAX_AGE_HOURS) next.delete('max_age')
    else next.set('max_age', raw)
    setSearchParams(next, { replace: true })
  }

  const handleRemove = async (id: string) => {
    if (!realm) return
    try {
      await remove.mutateAsync({ id, server: realm })
      if (expandedId === id) setExpandedId(null)
      toast('Craft removido de Meus Crafts.')
    } catch {
      toast('Não foi possível remover o craft.')
    }
  }

  const renderDetail = (view: SavedCraftView) => {
    if (!view.row || !catalog.catalog || !sanitized) {
      return (
        <p className="text-sm text-foreground-muted">
          Esta receita não está mais disponível no catálogo, mas você ainda pode removê-la.
        </p>
      )
    }
    const recipe = catalog.catalog.recipes.find(
      (candidate) => candidate.output_item === view.saved.output_item,
    )
    const relevantItems = new Set([
      view.saved.output_item,
      ...(recipe?.ingredients.map((ingredient) => ingredient.item) ?? []),
      ...(recipe?.upgrade_resource ? [recipe.upgrade_resource.item] : []),
    ])
    const expired = sanitized.expired.filter(
      (price) =>
        relevantItems.has(price.item) &&
        price.quality === (price.item === view.saved.output_item ? view.saved.output_quality : 1),
    )
    const analysisHref = savedCraftAnalysisHref(view)
    return (
      <div className="space-y-3">
        {expired.length > 0 && (
          <div role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground-muted">
            <p className="flex items-center gap-2 font-semibold text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Cotações vencidas ignoradas no cálculo
            </p>
            <ul className="mt-2 space-y-1">
              {expired.map((price) => (
                <li key={`${price.key}:${price.side}`}>
                  {nomeItem(price.item)} · {locationName(price.locationId)} ·{' '}
                  {price.side === 'sell' ? 'venda imediata' : 'pedido de compra'} ·{' '}
                  {price.observation.source} ·{' '}
                  {formatarIdade(new Date(price.observation.observedAt * 1000).toISOString())} · vencida
                </li>
              ))}
            </ul>
          </div>
        )}
        <DetalheDaLinha
          row={view.row}
          catalog={catalog.catalog}
          indice={sanitized.index}
          params={view.params}
          cidades={cidades}
          nomeItem={nomeItem}
          locationName={locationName}
          pricing={view.params.pricing}
          scenario={{
            premium: view.params.premium,
            quantityMeans: 'initial_recipes',
            returnRate: view.params.returnRate,
            stationFeePer100Nutrition: view.params.stationFeePer100Nutrition,
            useFocus: view.params.useFocus,
            outputQuality: view.params.outputQuality,
            quantity: view.params.quantity,
          }}
          realm={realm}
          onOrigem={() => undefined}
          indiceDeVendas={salesIndex}
          linkDaCalculadora={analysisHref}
          rotuloDoLinkDaCalculadora={
            view.productionKind === 'refining' ? 'Abrir no Refino' : undefined
          }
          readOnly
        />
      </div>
    )
  }

  if (!realm) {
    return <EstadoVazio title="Escolha um servidor">Selecione o realm para ver seus crafts.</EstadoVazio>
  }

  return (
    <div className="flex h-full min-h-[30rem] flex-col gap-4">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Meus Crafts</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Acompanhe preço, giro e frescor das receitas que você escolheu.
          </p>
          <p className="mt-2 text-xs text-foreground-subtle">
            <strong className="text-foreground">{saved.crafts.length}</strong> crafts salvos ·{' '}
            <strong className="text-foreground">{currentCount}</strong> com cotação atual
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          Idade máxima
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={maxAgeInput}
            onChange={(event) => handleMaxAge(event.target.value)}
            onBlur={() => setMaxAgeInput(String(maxAge))}
            className="h-9 w-24 rounded-md border border-input bg-background px-3 tabular-nums"
            aria-label="Idade máxima da cotação em horas"
          />
          <span className="text-foreground-muted">h</span>
        </label>
      </header>

      {saved.isError ? (
        <EstadoErro title="Não foi possível carregar Meus Crafts" onRetry={() => void saved.refetch()}>
          Seus favoritos não vieram do servidor. Catálogo e mercado não são a causa deste erro.
        </EstadoErro>
      ) : saved.isLoading ? (
        <Carregando label="Carregando seus crafts…" />
      ) : saved.crafts.length === 0 ? (
        <EstadoVazio title="Sua bancada ainda está vazia" icon={<Bookmark className="size-6" />}>
          Pesquise em <Link to="/refino" className="font-medium text-primary hover:underline">Refino</Link>,{' '}
          <Link to="/craft" className="font-medium text-primary hover:underline">Craft</Link> ou{' '}
          <Link to="/consumiveis" className="font-medium text-primary hover:underline">Comida &amp; Poções</Link>{' '}
          e salve as receitas que quiser acompanhar.
        </EstadoVazio>
      ) : catalog.error ? (
        <EstadoErro title="Não foi possível carregar o catálogo" onRetry={() => void catalog.refetch()}>
          Seus crafts estão salvos, mas as receitas não vieram para o cálculo.
        </EstadoErro>
      ) : prices.error ? (
        <EstadoErro title="Não foi possível carregar os preços" onRetry={() => void prices.refetch()}>
          Seus crafts estão salvos, mas o mercado não veio para o cálculo.
        </EstadoErro>
      ) : catalog.loading || prices.loading || !sanitized ? (
        <Carregando label="Carregando catálogo e preços…" />
      ) : (
        <>
          {sales.error && (
            <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground-muted">
              O histórico de vendas não carregou; os demais valores continuam disponíveis.{' '}
              <Button variant="link" className="h-auto p-0" onClick={() => void sales.refetch()}>Tentar novamente</Button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <SavedCraftsTable
              views={sorted}
              locationName={locationName}
              sort={sort}
              onSortChange={setSort}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId((current) => current === id ? null : id)}
              renderDetail={renderDetail}
              onRemove={(id) => void handleRemove(id)}
              removingId={remove.isPending ? remove.variables?.id ?? null : null}
            />
          </div>
        </>
      )}
    </div>
  )
}
