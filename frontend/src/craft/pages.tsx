import { Calculator } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useServer } from '@/app/ServerContext'
import { useRecipeCatalog } from '@/catalog/hooks'
import { RequireRealm } from '@/components/AppShell'
import { ItemAutocomplete } from '@/components/ItemAutocomplete'
import { SidebarSection } from '@/components/shell/SidebarSlot'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import { useDestinyBoard } from '@/destiny/hooks'
import { formatarNomeCurto, formatarNomeItem } from '@/lib/formatters'
import { useCidades, useLocationName } from '@/lib/locations'
import { formatPercent, formatQuantity, formatSilver, type Money } from '@/lib/money'
import { GrupoCenario, GrupoMercado } from '@/scanner/BarraDoCenario'
import { recorteDaReceita } from '@/scanner/categorias'
import { motivoSemPreco } from '@/scanner/columns'
import { DetalheDaLinha } from '@/scanner/DetalheDaLinha'
import { computeScanner, type ScannerRow } from '@/scanner/engine'
import { buildPriceIndex } from '@/scanner/prices'
import { cidadesFiltradas, TRACO } from '@/scanner/tela'
import { usePriceSnapshot } from '@/scanner/usePriceSnapshot'
import { useSalesVolume } from '@/scanner/useSalesVolume'
import { useScannerFilters } from '@/scanner/useScannerFilters'
import { buildSalesIndex, formatarVolume, volumeDaVenda } from '@/scanner/vendas'

import { linhaEscolhida, linhasPorLucro, receitaDoItem } from './calculadora'

/**
 * Calculadora (task 4/14) — o scanner com uma receita só.
 *
 * Mesmo engine, mesmos parâmetros de URL, mesma barra e mesmo painel de detalhe do scanner. O
 * número muda enquanto o jogador digita: nada aqui vai à rede, a não ser o "Analisar com o livro
 * real". Antes, cada mudança era um `POST /craft/simulate` atrás de um botão — que ficava mudo
 * quando faltava um campo (`E05`).
 */
export function CalculadoraPage() {
  const { realm } = useServer()
  const locationName = useLocationName()
  const cidades = useCidades()
  const {
    params,
    scenario,
    pricing,
    sellIn,
    buyIn,
    strategy,
    definirOrigem,
    limparEscolhas,
    setParam,
    toggleText,
  } = useScannerFilters()

  /** O item vive na URL: o link do Market Flip e o "Abrir Calculadora" do systray abrem por ela. */
  const item = params.get('item') ?? ''
  /** O texto do campo é local — a URL só recebe o item quando ele é escolhido de verdade. */
  const [texto, setTexto] = useState(item)
  /** A cidade que o jogador clicou; nula = a melhor. */
  const [cidadeClicada, setCidadeClicada] = useState<string | null>(null)

  const refino = useRecipeCatalog('refining')
  const craft = useRecipeCatalog('crafting')
  const painelDoDestino = useDestinyBoard()

  const receita = useMemo(
    () => receitaDoItem(item, refino.catalog, craft.catalog),
    [item, refino.catalog, craft.catalog],
  )
  const itemsByName = useMemo(
    () => new Map((receita?.catalog.items ?? []).map((i) => [i.unique_name, i])),
    [receita],
  )

  /** Preço só da categoria do item (task 22): uma receita não precisa do realm inteiro. */
  const recorte = useMemo(
    () => (receita ? recorteDaReceita(itemsByName.get(item), receita.kind) : null),
    [receita, itemsByName, item],
  )
  const mercadosPedidos = useMemo(() => cidades.flatMap((c) => c.ids), [cidades])
  const precos = usePriceSnapshot(realm, mercadosPedidos, recorte, recorte !== null)
  const vendas = useSalesVolume(realm, recorte, recorte !== null)

  /** `1301` → `1002`: dois mercados, uma Lymhurst. Ver `agruparCidades`. */
  const canonico = useMemo(() => {
    const porMercado = new Map(cidades.flatMap((c) => c.ids.map((id) => [id, c.id])))
    return (locationId: string) => porMercado.get(locationId) ?? locationId
  }, [cidades])
  const indice = useMemo(
    () => (precos.snapshot ? buildPriceIndex(precos.snapshot, canonico) : null),
    [precos.snapshot, canonico],
  )
  const indiceDeVendas = useMemo(
    () => (vendas.vendas ? buildSalesIndex(vendas.vendas, canonico) : null),
    [vendas.vendas, canonico],
  )

  const cidadesDeVenda = useMemo(() => cidadesFiltradas(sellIn, cidades), [sellIn, cidades])
  const cidadesDeCompra = useMemo(() => cidadesFiltradas(buyIn, cidades), [buyIn, cidades])
  const receitas = useMemo(() => (item ? [item] : []), [item])

  const paramsDoEngine = useMemo(
    () => ({
      ...scenario,
      locations: cidadesDeVenda,
      priceLocations: cidadesDeCompra,
      recipes: receitas,
      pricing,
      strategy,
      destinyBoard: painelDoDestino,
    }),
    [scenario, cidadesDeVenda, cidadesDeCompra, receitas, pricing, strategy, painelDoDestino],
  )

  /** Uma linha por cidade de Vender em. Uma receita só: na thread principal, sem Worker. */
  const linhas = useMemo(
    () =>
      receita && indice ? linhasPorLucro(computeScanner(receita.catalog, indice, paramsDoEngine)) : [],
    [receita, indice, paramsDoEngine],
  )
  const escolhida = linhaEscolhida(linhas, cidadeClicada)

  const nomeItem = useMemo(
    () => (unique: string) =>
      formatarNomeCurto(itemsByName.get(unique)?.name_pt ?? itemsByName.get(unique)?.name_en, unique),
    [itemsByName],
  )

  if (!realm) {
    return (
      <RequireRealm>
        <span />
      </RequireRealm>
    )
  }

  const carregando =
    item !== '' && (refino.loading || craft.loading || (recorte !== null && precos.loading))
  const erro = refino.error ?? craft.error ?? precos.error
  const volumeDe = indiceDeVendas
    ? (row: ScannerRow) =>
        volumeDaVenda(row, indiceDeVendas, cidadesDeVenda, scenario.outputQuality)
    : undefined

  return (
    <div className="flex h-full flex-col gap-4">
      <SidebarSection title="Cenário">
        <div className="space-y-5">
          <GrupoMercado
            cidades={cidades}
            locationName={locationName}
            sellIn={sellIn}
            buyIn={buyIn}
            pricing={pricing}
            toggleText={toggleText}
            setParam={setParam}
            limparEscolhas={limparEscolhas}
            dica="Para um ingrediente específico, escolha de onde vem o preço no detalhe da cidade."
          />
          <GrupoCenario
            params={params}
            scenario={scenario}
            strategy={strategy}
            setParam={setParam}
            comQualidade
            textoDaQuantidade={
              <>
                Quantas receitas você compra material para fazer. O que o retorno devolver vira
                produção a mais — está no detalhe da cidade.
              </>
            }
          />
        </div>
      </SidebarSection>

      <header className="shrink-0 space-y-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Calculadora</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Uma receita em todas as cidades. O número muda enquanto você digita; o exato, com o
            livro inteiro, é o <strong>Analisar com o livro real</strong>.
          </p>
        </div>
        <div className="max-w-xl">
          <ItemAutocomplete
            label="Item"
            value={texto}
            onChange={setTexto}
            onSelect={(escolhido) => {
              setCidadeClicada(null)
              setParam('item', escolhido.unique_name)
            }}
            filters={{ apenas_craftaveis: true }}
            autoFocus={!item}
          />
        </div>
      </header>

      {!item ? (
        <EstadoVazio title="Escolha um item" icon={<Calculator className="size-6" />}>
          Busque pelo nome acima. A conta usa o cenário da barra à direita — os mesmos campos do
          scanner.
        </EstadoVazio>
      ) : erro ? (
        <EstadoErro title="Não foi possível carregar a Calculadora">
          O catálogo ou os preços não vieram. A navegação ao lado continua funcionando.
        </EstadoErro>
      ) : carregando ? (
        <Carregando label="Carregando receita e preços…" />
      ) : !receita ? (
        <EstadoVazio title="Este item não tem receita" icon={<Calculator className="size-6" />}>
          {formatarNomeItem(null, item)} não é craftado nem refinado. Escolha outro item.
        </EstadoVazio>
      ) : (
        <>
          <ComparacaoPorCidade
            linhas={linhas}
            escolhida={escolhida}
            onEscolher={setCidadeClicada}
            locationName={locationName}
            volumeDe={volumeDe}
          />
          {escolhida && indice && (
            <section
              aria-label={`Detalhe em ${locationName(escolhida.locationId)}`}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <h2 className="mb-3 text-sm font-semibold">
                {nomeItem(item)} em {locationName(escolhida.locationId)}
              </h2>
              <DetalheDaLinha
                row={escolhida}
                catalog={receita.catalog}
                indice={indice}
                params={paramsDoEngine}
                cidades={cidades}
                nomeItem={nomeItem}
                locationName={locationName}
                pricing={pricing}
                scenario={scenario}
                realm={realm}
                onOrigem={definirOrigem}
                indiceDeVendas={indiceDeVendas}
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}

/**
 * "Onde vale a pena isto": as cidades lado a lado, na ordem do lucro. Cidade sem preço fica, com o
 * motivo — sumir com ela diria que ali não se vende (`X01`). Clicar troca o detalhe.
 */
function ComparacaoPorCidade({
  linhas,
  escolhida,
  onEscolher,
  locationName,
  volumeDe,
}: {
  linhas: ScannerRow[]
  escolhida: ScannerRow | null
  onEscolher: (locationId: string) => void
  locationName: (id: string) => string
  volumeDe?: (row: ScannerRow) => Money | null
}) {
  const celula = 'px-3 py-2 text-right tabular-nums'
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table aria-label="Lucro por cidade" className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-foreground-subtle">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 text-left">
              Cidade
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Lucro
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              ROI
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Preço de venda
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Vende/dia
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Investimento
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const ativa = linha.locationId === escolhida?.locationId
            const volume = volumeDe?.(linha)
            const corDoLucro =
              linha.profit === null
                ? 'font-normal text-foreground-subtle'
                : linha.profit.isNegative()
                  ? 'text-danger'
                  : 'text-profit'
            return (
              <tr
                key={linha.locationId}
                className={`border-b border-border/60 ${ativa ? 'bg-surface-raised' : ''}`}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => onEscolher(linha.locationId)}
                    className="font-medium text-buy-side underline-offset-2 hover:underline"
                  >
                    {locationName(linha.locationId)}
                  </button>
                </td>
                <td className={`${celula} font-semibold ${corDoLucro}`}>
                  {linha.profit ? formatSilver(linha.profit) : (motivoSemPreco(linha) ?? TRACO)}
                </td>
                <td className={celula}>{linha.roi ? formatPercent(linha.roi) : TRACO}</td>
                <td className={celula}>
                  {linha.saleUnitPrice ? formatQuantity(linha.saleUnitPrice, 0) : TRACO}
                </td>
                <td className={`${celula} text-foreground-muted`}>
                  {volume === undefined ? '' : `${volume ? formatarVolume(volume) : TRACO}/dia`}
                </td>
                <td className={celula}>{linha.totalCost ? formatSilver(linha.totalCost) : TRACO}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
