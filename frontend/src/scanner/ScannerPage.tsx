import { useCallback, useMemo, useState } from 'react'

import { useServer } from '@/app/ServerContext'
import { RequireRealm } from '@/components/AppShell'
import {
  FilterCheckbox,
  FilterChips,
  FilterGroup,
  FilterNumberField,
  FilterSearch,
  FilterSelectField,
} from '@/components/filters'
import { SidebarSection } from '@/components/shell/SidebarSlot'
import { Button } from '@/components/ui/button'
import { Carregando, EstadoErro } from '@/components/ui/states'
import { useRecipeCatalog } from '@/catalog/hooks'
import type { CatalogKind } from '@/catalog/service'
import { formatarNomeCurto } from '@/lib/formatters'
import { money, percentageToRate } from '@/lib/money'
import { useDestinyBoard } from '@/destiny/hooks'
import { useCidades, useLocationName } from '@/lib/locations'

import { buildColumns, motivoSemPreco } from './columns'
import { bestPerRecipe, computeScanner, explainRow, type ScannerRow } from './engine'
import { applyFilters } from './filters'
import { buildPriceIndex, priceKey } from './prices'
import { itensComEscolhaPropria, origemDoItem, origemPadrao } from './pricing'
import { ExactAnalysis } from './ExactAnalysis'
import { RowDetails } from './RowDetails'
import { ScannerTable } from './ScannerTable'
import { cidadesFiltradas, estadoDaTela, podeAnalisar, precosNaMaoPara } from './tela'
import { DEFAULT_SORT, sortRows, type SortState } from './sorting'
import { usePriceSnapshot } from './usePriceSnapshot'
import { useScannerWorker } from './useScannerWorker'
import { RETORNOS_PADRAO, rendimentoPorCemRecursos } from './return-rates'
import { DEFAULT_QUANTITY, useScannerFilters } from './useScannerFilters'

/**
 * A tela do scanner (task 4/11) — onde a arquitetura da fase encosta no usuário.
 *
 * O fluxo inteiro acontece **em memória**, sem requisição por interação:
 *
 *   catálogo (cache) + snapshot (30 s)  →  computeScanner  →  applyFilters  →  sortRows
 *
 * Mudar um filtro, um tier, o retorno de recurso ou a ordenação refaz a cadeia num `useMemo`.
 * Não há chave de query envolvida, então nada disso dispara rede.
 */

const TIERS = [2, 3, 4, 5, 6, 7, 8]
const ENCANTAMENTOS = [0, 1, 2, 3, 4]

export function ScannerPage({
  kind,
  title,
  description,
}: {
  kind: CatalogKind
  title: string
  description: string
}) {
  const { realm } = useServer()
  const locationName = useLocationName()
  const cidades = useCidades()
  const {
    params,
    filters,
    scenario,
    pricing,
    sellIn,
    buyIn,
    strategy,
    definirOrigem,
    limparEscolhas,
    setParam,
    toggleNumber,
    toggleText,
    reset,
  } = useScannerFilters()
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  /** Uma linha aberta por vez — o painel é grande, e dois abertos viram rolagem sem fim. */
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null)

  const catalogo = useRecipeCatalog(kind)
  /** O Painel do Destino do jogador — vazio enquanto carrega, que é o custo de foco base. */
  const painelDoDestino = useDestinyBoard()

  /**
   * **Sempre todos os mercados**, independentemente do filtro. Amarrar o pedido à seleção faria
   * do filtro de cidade o único que muda a chave de query — marcar uma cidade viraria uma
   * requisição, e desmarcar, outra.
   */
  const mercadosPedidos = useMemo(
    () => cidades.flatMap((c) => c.ids),
    [cidades],
  )
  const precos = usePriceSnapshot(realm, mercadosPedidos)

  /**
   * Onde se **vende**: as cidades marcadas, ou todas. O engine avalia cada uma e `bestPerRecipe`
   * reduz para a melhor — a comparação completa mora no painel expandido.
   */
  const cidadesDeVenda = useMemo(
    () => cidadesFiltradas(sellIn, cidades),
    [sellIn, cidades],
  )

  /** Onde se **compra**: a média de cada ingrediente varre só estas (task 24). */
  const cidadesDeCompra = useMemo(
    () => cidadesFiltradas(buyIn, cidades),
    [buyIn, cidades],
  )

  /** `1301` → `1002`: dois mercados, uma Lymhurst. Ver `agruparCidades`. */
  const canonico = useMemo(() => {
    const porMercado = new Map(cidades.flatMap((c) => c.ids.map((id) => [id, c.id])))
    return (locationId: string) => porMercado.get(locationId) ?? locationId
  }, [cidades])

  const itemsByName = useMemo(
    () =>
      new Map((catalogo.catalog?.items ?? []).map((item) => [item.unique_name, item])),
    [catalogo.catalog],
  )

  /** O índice fica fora do cálculo das linhas porque o painel de detalhe também consulta ele. */
  const indice = useMemo(
    () => (precos.snapshot ? buildPriceIndex(precos.snapshot, canonico) : null),
    [precos.snapshot, canonico],
  )

  const paramsDoEngine = useMemo(
    () => ({
      ...scenario,
      // Uma linha por CIDADE, não por mercado: os ids fundidos já viraram um só no índice.
      locations: cidadesDeVenda,
      // A média de ingrediente varre só as cidades de Comprar em (task 24). Até ali varria todas,
      // de propósito (task 11.3); o jogador decidiu o contrário — não compra onde não vai, e zona
      // de PvP é o caso típico.
      priceLocations: cidadesDeCompra,
      pricing,
      strategy,
      destinyBoard: painelDoDestino,
    }),
    [scenario, cidadesDeVenda, cidadesDeCompra, pricing, strategy, painelDoDestino],
  )

  /**
   * **Onde a conta roda.** Refino são 110 receitas (~30 ms): na thread principal, sem latência
   * de mensagem nem estado de "calculando" piscando. Craft são 5.523 × 8 cidades — medido em
   * **2.583 ms**, que na thread principal congela a interface a cada mudança de cenário.
   */
  const noWorker = kind === 'crafting'

  const entradaDoWorker = useMemo(
    () =>
      noWorker && catalogo.catalog && precos.snapshot
        ? {
            catalog: {
              recipes: catalogo.catalog.recipes,
              items: catalogo.catalog.items,
            },
            snapshot: precos.snapshot,
            canonical: cidades.flatMap((c) =>
              c.ids.map((id) => [id, c.id] as [string, string]),
            ),
            params: paramsDoEngine,
          }
        : null,
    [noWorker, catalogo.catalog, precos.snapshot, cidades, paramsDoEngine],
  )
  const doWorker = useScannerWorker(entradaDoWorker)

  const naThreadPrincipal = useMemo(() => {
    if (noWorker || !catalogo.catalog || !indice) return []
    return computeScanner(
      { recipes: catalogo.catalog.recipes, items: catalogo.catalog.items },
      indice,
      paramsDoEngine,
    )
  }, [noWorker, catalogo.catalog, indice, paramsDoEngine])

  const linhas = useMemo(() => {
    const todas = noWorker ? doWorker.rows : naThreadPrincipal
    // Uma linha por receita sempre. Com uma cidade só marcada, a redução não muda nada.
    return bestPerRecipe(todas)
  }, [noWorker, doWorker.rows, naThreadPrincipal])

  // Nome legível de qualquer item do catálogo — a coluna de ingrediente precisa dele, e o
  // ingrediente não é a saída da receita (não vem no `item` da linha).
  const nomeItem = useMemo(() => {
    return (unique: string) =>
      formatarNomeCurto(
        itemsByName.get(unique)?.name_pt ?? itemsByName.get(unique)?.name_en,
        unique,
      )
  }, [itemsByName])

  const visiveis = useMemo(
    // O nome desempata a ordem por tier: é o nome que o jogador lê que define "alfabética".
    () => sortRows(applyFilters(linhas, filters, itemsByName), sort, nomeItem),
    [linhas, filters, itemsByName, sort, nomeItem],
  )

  /** A largura da coluna Compra acompanha a receita com mais ingredientes do catálogo aberto. */
  const maxIngredientes = useMemo(
    () =>
      (catalogo.catalog?.recipes ?? []).reduce(
        (maior, receita) => Math.max(maior, receita.ingredients.length),
        1,
      ),
    [catalogo.catalog],
  )

  const columns = useMemo(
    () => buildColumns(locationName, nomeItem, { maxIngredientes }),
    [locationName, nomeItem, maxIngredientes],
  )

  /**
   * O painel da linha aberta. É calculado **sob demanda**, só para ela: rodar `explainRow` em
   * 110 linhas para guardar detalhe que ninguém abriu seria pagar caro por nada.
   */
  const renderDetail = useCallback(
    (row: ScannerRow) => {
      if (!catalogo.catalog || !indice) return null
      const receita = catalogo.catalog.recipes.find(
        (r) => r.output_item === row.outputItem,
      )
      const detail = explainRow(
        { recipes: catalogo.catalog.recipes, items: catalogo.catalog.items },
        indice,
        paramsDoEngine,
        { outputItem: row.outputItem, locationId: row.locationId },
      )

      if (!detail || !receita) {
        return (
          <p className="text-xs text-foreground-subtle">
            Sem cotação suficiente para abrir o extrato desta receita — falta{' '}
            {motivoSemPreco(row) ?? 'preço'}. A lista de compras continua na linha.
          </p>
        )
      }

      return (
        <RowDetails
          detail={detail}
          nomeItem={nomeItem}
          locationName={locationName}
          precoPorCidade={cidades.map((cidade) => {
            const entrada = indice.get(
              priceKey(
                row.outputItem,
                cidade.id,
                scenario.outputQuality,
                receita.enchantment_level,
              ),
            )
            return {
              locationId: cidade.id,
              sell: entrada?.sell ? money(entrada.sell.price) : null,
              buy: entrada?.buy ? money(entrada.buy.price) : null,
            }
          })}
          cidades={cidades}
          origemDe={(lado, item) => origemDoItem(pricing, lado, item)}
          padraoDe={(lado) => origemPadrao(pricing, lado)}
          onOrigem={definirOrigem}
          analise={
            realm && detail.row.profit && podeAnalisar(detail.row) ? (
              <ExactAnalysis
                request={{
                  server: realm,
                  output_item: row.outputItem,
                  location_id: row.locationId,
                  quantity: scenario.quantity,
                  output_quality: scenario.outputQuality,
                  scope: 'all',
                  return_rate: scenario.returnRate,
                  station_fee_per_100_nutrition: scenario.stationFeePer100Nutrition,
                  use_focus: scenario.useFocus,
                  premium: scenario.premium,
                  // As exceções de preço da barra viajam junto: sem elas o "exato" ignoraria
                  // o preço que o jogador declarou pagar e as duas contas não se comparariam.
                  manual_prices: precosNaMaoPara(pricing, row.outputItem),
                }}
                estimativa={detail.row.profit}
                acquisitionMode={detail.row.acquisitionMode ?? 'immediate'}
                saleMode={detail.row.saleMode ?? 'immediate'}
              />
            ) : detail.row.saleBasis === 'average' ? (
              // A média não é um mercado: não há livro de ordens para analisar (task 24).
              <p className="text-xs text-foreground-subtle">
                A análise exata precisa de uma cidade de venda. Escolha uma no seletor da Venda.
              </p>
            ) : undefined
          }
        />
      )
    },
    [
      catalogo.catalog,
      indice,
      paramsDoEngine,
      cidades,
      nomeItem,
      locationName,
      pricing,
      realm,
      scenario,
      definirOrigem,
    ],
  )

  const comPreco = useMemo(
    () => linhas.filter((l) => l.state === 'priced').length,
    [linhas],
  )

  /**
   * Qual atalho corresponde ao que está no campo. A comparação é pela **taxa normalizada**,
   * não pelo texto: quem digitou `36.7` com ponto marcou o mesmo atalho de quem digitou `36,7`.
   */
  const atalhoAtivo = useMemo(() => {
    const atual = scenario.returnRate
    return (
      RETORNOS_PADRAO.find((r) => percentageToRate(r.percent) === atual)?.percent ?? null
    )
  }, [scenario.returnRate])

  /** `100 / (1 − taxa)` — a soma da série de refinos sucessivos. Ver `rendimentoPorCemRecursos`. */
  const rendimentoDoRetorno = useMemo(
    () => rendimentoPorCemRecursos(scenario.returnRate),
    [scenario.returnRate],
  )

  if (!realm) {
    return (
      <RequireRealm>
        <span />
      </RequireRealm>
    )
  }

  const estado = estadoDaTela({
    dadosCarregando: catalogo.loading || precos.loading,
    calculando: noWorker && doWorker.calculando,
    temLinhas: linhas.length > 0,
  })
  const erro = catalogo.error ?? precos.error

  const valorDaCompra =
    pricing.base.kind === 'cheapest'
      ? 'min'
      : pricing.base.kind === 'city'
        ? pricing.base.locationId
        : pricing.base.kind === 'sale_city'
          ? 'sale'
          : ''
  const opcoesDeCompra = [
    { value: 'min', label: 'Menor preço das cidades' },
    // Links antigos da 11.3 continuam abrindo com a base deles. A opção só aparece para o seletor
    // não mostrar "Média" enquanto a conta usa outra coisa.
    ...(pricing.base.kind === 'city'
      ? [{ value: pricing.base.locationId, label: locationName(pricing.base.locationId) }]
      : []),
    ...(pricing.base.kind === 'sale_city' ? [{ value: 'sale', label: 'Cidade da venda' }] : []),
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <SidebarSection title="Filtros">
        <div className="space-y-5">
          <FilterSearch
            value={filters.search}
            onChange={(v) => setParam('q', v)}
            placeholder="Buscar receita…"
          />

          <FilterGroup legend="Mercado">
            {/* Uma linha por receita, com a melhor cidade escolhida só entre as marcadas. Tirar
                Brecilien e Caerleon da conta é o caso típico: pagam mais, mas o caminho é PvP. */}
            <FilterChips
              label="Vender em"
              options={cidades.map((c) => c.id)}
              selected={sellIn}
              onToggle={(id) => toggleText('sell_in', id)}
              formatOption={locationName}
              emptyHint="todas"
            />
            {/* De onde vem o preço de venda de TODOS os itens (task 25). Sem cidade específica:
                marcar só uma em Vender em já é isso, e as duas juntas permitiriam contradição. */}
            <FilterSelectField
              label="Preço de venda"
              value={pricing.saleBase === 'average' ? 'avg' : ''}
              onChange={(v) => setParam('sale_price', v)}
              options={[{ value: 'avg', label: 'Média das cidades' }]}
              allLabel="Melhor cidade"
            />
            <PrecoProprio
              quantidade={itensComEscolhaPropria(pricing, 'venda')}
              onLimpar={() => limparEscolhas('venda')}
            />
            {/* O mesmo motivo vale para comprar (task 24): ninguém busca fibra onde não vai
                vender tecido. A média de cada ingrediente varre só estas. */}
            <FilterChips
              label="Comprar em"
              options={cidades.map((c) => c.id)}
              selected={buyIn}
              onToggle={(id) => toggleText('buy_in', id)}
              formatOption={locationName}
              emptyHint="todas"
            />
            <FilterSelectField
              label="Preço de compra"
              value={valorDaCompra}
              onChange={(v) => setParam('ing_price', v)}
              options={opcoesDeCompra}
              allLabel="Média das cidades"
            />
            <PrecoProprio
              quantidade={itensComEscolhaPropria(pricing, 'compra')}
              onLimpar={() => limparEscolhas('compra')}
            />
            <p className="text-xs text-foreground-subtle">
              Para um item específico, escolha de onde vem o preço no painel da linha.
            </p>
          </FilterGroup>

          <FilterGroup legend="Item">
            <FilterChips
              label="Tier"
              options={TIERS}
              selected={filters.tiers}
              onToggle={(v) => toggleNumber('tier', v)}
              formatOption={(t) => `T${t}`}
            />
            <FilterChips
              label="Encantamento"
              options={ENCANTAMENTOS}
              selected={filters.enchantments}
              onToggle={(v) => toggleNumber('ench', v)}
              formatOption={(e) => `.${e}`}
            />
          </FilterGroup>

          <FilterGroup legend="Resultado">
            <FilterNumberField
              label="Lucro mínimo"
              value={filters.minProfit ?? ''}
              onChange={(v) => setParam('min_profit', v)}
              placeholder="qualquer"
            />
            <FilterNumberField
              label="ROI mínimo"
              value={filters.minRoi ?? ''}
              onChange={(v) => setParam('min_roi', v)}
              placeholder="qualquer"
              suffix="%"
            />
            <FilterNumberField
              label="Idade máxima do dado"
              value={filters.maxAgeHours === null ? '' : String(filters.maxAgeHours)}
              onChange={(v) => setParam('max_age', v)}
              placeholder="sem limite"
              suffix="h"
            />
            <FilterCheckbox
              label="Mostrar sem preço"
              description="Receita que ainda não tem cotação aparece com o motivo"
              checked={filters.showUnpriced}
              onChange={(c) => setParam('unpriced', c ? null : 'false')}
            />
            <FilterCheckbox
              label="Apenas com lucro"
              description="Esconde resultado negativo"
              checked={filters.profitableOnly}
              onChange={(c) => setParam('profit_only', c ? 'true' : null)}
            />
          </FilterGroup>

          {/* Separado de propósito: estes mudam o VALOR das linhas, não quais linhas existem. */}
          <FilterGroup legend="Seu cenário">
            {/* O padrão escolhe o cenário mais lucrativo, que supõe as duas ordens sendo
                aceitas. Travar aqui responde a outra pergunta: quanto rende do jeito que eu
                de fato opero. */}
            <FilterSelectField
              label="Como você compra"
              value={strategy.acquisition === 'best' ? '' : strategy.acquisition}
              onChange={(v) => setParam('buy', v)}
              options={[
                { value: 'immediate', label: 'Compra imediata (paga a oferta)' },
                { value: 'buy_order', label: 'Ordem de compra (espera na fila)' },
              ]}
              allLabel="Melhor cenário"
            />
            <FilterSelectField
              label="Como você vende"
              value={strategy.sale === 'best' ? '' : strategy.sale}
              onChange={(v) => setParam('sell', v)}
              options={[
                { value: 'immediate', label: 'Venda imediata (entrega na ordem)' },
                { value: 'sell_order', label: 'Ordem de venda (espera na fila)' },
              ]}
              allLabel="Melhor cenário"
            />
            <FilterNumberField
              label="Receitas a fazer"
              value={params.get('qty') ?? ''}
              onChange={(v) => setParam('qty', v)}
              placeholder={String(DEFAULT_QUANTITY)}
            />
            <p className="text-xs text-foreground-subtle">
              Quantas receitas você compra material para fazer. O que o retorno devolver vira
              refino a mais — está na coluna <strong>Rendimento</strong>.
            </p>
            <FilterNumberField
              label="Retorno de recurso"
              // O valor cru digitado, não a taxa convertida: o campo mostra "36,7", e
              // `percentageToRate` converte para 0.367 na leitura (task 3.6/01).
              value={params.get('return_rate') ?? ''}
              onChange={(v) => setParam('return_rate', v)}
              placeholder="0"
              suffix="%"
            />
            {/* Atalhos, não substituto do campo: quem tem uma taxa diferente continua digitando.
                Os quatro valores saem da fórmula do jogo — ver `return-rates.ts`. */}
            <FilterChips
              label="Taxas do jogo"
              emptyHint="personalizado"
              options={RETORNOS_PADRAO.map((r) => r.percent)}
              selected={atalhoAtivo ? [atalhoAtivo] : []}
              onToggle={(percent) => setParam('return_rate', percent)}
              formatOption={(percent) => `${percent.replace('.', ',')}%`}
              titleOption={(percent) =>
                RETORNOS_PADRAO.find((r) => r.percent === percent)?.descricao ?? ''
              }
            />
            {rendimentoDoRetorno && (
              // O retorno é recursivo: o que volta é refinado de novo. A conta abaixo é a soma
              // dessa série, e é ela que já está embutida na lista de compras.
              <p className="text-xs text-foreground-subtle">
                Com esse retorno, <strong>100 recursos rendem ~{rendimentoDoRetorno}</strong>{' '}
                itens — o que volta é refinado de novo, e assim por diante. Já está no custo.
              </p>
            )}
            <FilterNumberField
              label="Taxa da estação"
              value={
                scenario.stationFeePer100Nutrition === '0'
                  ? ''
                  : scenario.stationFeePer100Nutrition
              }
              onChange={(v) => setParam('station_fee', v)}
              placeholder="0"
              suffix="/100 nut."
            />
            <p className="text-xs text-foreground-subtle">
              A <strong>taxa de uso por 100 de nutrição</strong> que a estação cobra — o número
              que aparece no topo da janela dela no jogo. Quanto cada receita consome sai do
              valor do item, então a mesma taxa custa centavos num recurso T4 e milhares numa
              arma T8.
            </p>
            <FilterCheckbox
              label="Conta Premium"
              description="Imposto de venda 4% em vez de 8%"
              checked={scenario.premium}
              onChange={(c) => setParam('premium', c ? null : 'false')}
            />
            <FilterCheckbox
              label="Usar foco"
              description="Habilita a coluna Lucro/foco"
              checked={scenario.useFocus}
              onChange={(c) => setParam('focus', c ? 'true' : null)}
            />
          </FilterGroup>

          <Button variant="outline" size="sm" className="w-full" onClick={reset}>
            Limpar filtros
          </Button>
        </div>
      </SidebarSection>

      <header className="shrink-0">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{description}</p>
        <p className="mt-2 text-xs text-foreground-subtle">
          {estado === 'carregando' ? (
            'Carregando catálogo e preços…'
          ) : (
            <>
              <strong className="text-foreground">{visiveis.length}</strong> linhas ·{' '}
              {comPreco} com preço de {linhas.length} avaliadas ·{' '}
              <span title="O scanner usa o topo do livro. O número exato, com profundidade, é o 'Analisar'.">
                estimativa de topo de livro
              </span>
              {/* O aviso substitui a tabela em branco: os números abaixo são do cenário
                  anterior, e dizer isso é mais honesto que esconder tudo por 2,7 s. */}
              {estado === 'recalculando' && (
                <span className="text-foreground-muted"> · recalculando…</span>
              )}
            </>
          )}
        </p>
      </header>

      {erro ? (
        <EstadoErro title="Não foi possível carregar o scanner">
          O catálogo ou os preços não vieram. A navegação ao lado continua funcionando.
        </EstadoErro>
      ) : estado === 'carregando' ? (
        <Carregando />
      ) : (
        <div className="min-h-0 flex-1">
          <ScannerTable
            rows={visiveis}
            columns={columns}
            items={itemsByName}
            sort={sort}
            onSortChange={setSort}
            expandedKey={linhaAberta}
            onToggleRow={(chave) =>
              setLinhaAberta((atual) => (atual === chave ? null : chave))
            }
            renderDetail={renderDetail}
          />
        </div>
      )}
    </div>
  )
}

export function RefiningScannerPage() {
  return (
    <ScannerPage
      kind="refining"
      title="O que vale a pena refinar"
      description="Todas as receitas de refino, em todas as cidades — inclusive as que ainda não têm preço."
    />
  )
}

/**
 * Quantos itens não seguem a barra num lado, e o atalho para que voltem a seguir (task 25).
 *
 * Mudar a barra não apaga escolha de item — ela é a mais específica. Sem esta linha, uma receita
 * que ignora a barra não teria explicação na tela.
 */
function PrecoProprio({ quantidade, onLimpar }: { quantidade: number; onLimpar: () => void }) {
  if (quantidade === 0) return null
  return (
    <p className="flex items-baseline justify-between gap-2 text-xs text-foreground-subtle">
      <span>
        {quantidade === 1 ? '1 item com preço próprio' : `${quantidade} itens com preço próprio`}
      </span>
      <button
        type="button"
        onClick={onLimpar}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        limpar
      </button>
    </p>
  )
}

export function CraftingScannerPage() {
  return (
    <ScannerPage
      kind="crafting"
      title="O que vale a pena craftar"
      description="As 5.523 receitas de craft, em todas as cidades — inclusive as que ainda não têm preço."
    />
  )
}
