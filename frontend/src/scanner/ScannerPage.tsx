import { ListFilter } from 'lucide-react'
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
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'
import { useToast } from '@/components/ui/ToastProvider'
import { useRecipeCatalog } from '@/catalog/hooks'
import { formatarNomeCurto, formatarQualidade } from '@/lib/formatters'
import { useDestinyBoard } from '@/destiny/hooks'
import { useCidades, useLocationName } from '@/lib/locations'
import { useCreateSavedCraft, useSavedCrafts } from '@/saved-crafts/hooks'
import { SavedCraftButton } from '@/saved-crafts/SavedCraftButton'
import { savedCraftFromScenario } from '@/saved-crafts/service'

import {
  arvoreDeCategorias,
  catalogoDaTela,
  MIN_LETRAS_DA_BUSCA,
  receitasDaSelecao,
  TODAS_AS_CATEGORIAS,
  TOP_RECEITAS,
  topPorLucro,
  type TelaDoScanner,
} from './categorias'
import { GrupoCenario, GrupoMercado } from './BarraDoCenario'
import { buildColumns } from './columns'
import { DetalheDaLinha } from './DetalheDaLinha'
import { bestPerRecipe, computeScanner, type ScannerRow } from './engine'
import { applyFilters, filtrarPorVolume, type VolumeDaLinha } from './filters'
import { podeSalvarEmMeusCrafts } from './meusCrafts'
import { buildPriceIndex } from './prices'
import { ScannerTable } from './ScannerTable'
import { cidadesFiltradas, estadoDaTela, hrefDaCalculadora } from './tela'
import { DEFAULT_SORT, sortRows, type SortState } from './sorting'
import { usePriceSnapshot, type RecorteDoSnapshot } from './usePriceSnapshot'
import { useSalesVolume } from './useSalesVolume'
import { buildSalesIndex, volumeDaVenda } from './vendas'
import { useScannerWorker } from './useScannerWorker'
import { useScannerFilters } from './useScannerFilters'

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

/** O Top 15 é "as de maior lucro": abre ordenado assim (task 21). */
const ORDEM_DO_TOP: SortState = { field: 'profit', direction: 'desc' }

export function ScannerPage({
  tela,
  title,
  description,
}: {
  tela: TelaDoScanner
  title: string
  description: string
}) {
  /** O catálogo que a tela lê — Comida & Poções usa o de craft (task 13). */
  const kind = catalogoDaTela(tela)
  const { realm } = useServer()
  const { toast } = useToast()
  const locationName = useLocationName()
  const cidades = useCidades()
  const podeSalvar = podeSalvarEmMeusCrafts(tela)
  const salvos = useSavedCrafts(realm, podeSalvar)
  const criarSalvo = useCreateSavedCraft()
  const [itensSalvando, setItensSalvando] = useState<Set<string>>(() => new Set())
  const {
    params,
    filters,
    selecao,
    escolherCategoria,
    alternarTop,
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
  // Com o Top ligado na URL, o F5 volta ordenado por lucro — senão as 15 abririam em ordem de tier.
  const [sort, setSort] = useState<SortState>(() =>
    selecao.top ? ORDEM_DO_TOP : DEFAULT_SORT,
  )
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

  /** A árvore do seletor: a ordem do mercado do jogo, sem o que não se vende (task 21). */
  const arvore = useMemo(
    () =>
      catalogo.catalog ? arvoreDeCategorias(catalogo.catalog.recipes, itemsByName, tela) : [],
    [catalogo.catalog, itemsByName, tela],
  )

  /**
   * **O que é calculado** (task 21). Nada até o jogador escolher uma categoria, o Top 15 ou buscar
   * pelo nome. É o que tira os 2,7 s do craft: uma subcategoria tem por volta de 100 receitas.
   */
  const daSelecao = useMemo(() => {
    const resultado = receitasDaSelecao(
      catalogo.catalog?.recipes ?? [],
      itemsByName,
      tela,
      selecao,
      filters.search,
    )
    return { ...resultado, chave: `${resultado.modo}:${resultado.receitas.join(',')}` }
  }, [catalogo.catalog, itemsByName, tela, selecao, filters.search])
  const modo = daSelecao.modo

  // A lista entra no engine pelo CONTEÚDO. Com uma categoria escolhida, digitar na busca refaz
  // `daSelecao` com as mesmas receitas — e uma lista de identidade nova recalcularia tudo à toa.
  const receitas = useMemo(
    () => daSelecao.receitas,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É o conteúdo da lista
    [daSelecao.chave],
  )

  /**
   * Preço só do que a tela calcula (task 22). Com uma categoria, o servidor devolve os itens das
   * receitas dela: de 187 KB para 4 a 15 KB a cada 30 s. Todas, Top e busca podem precisar de
   * qualquer item e pedem o realm. Sem nada escolhido, não pede nada.
   */
  const recorte = useMemo<RecorteDoSnapshot | null>(
    () =>
      modo === 'categoria' && selecao.categoria
        ? { kind: tela, category: selecao.categoria, subcategory: selecao.subcategoria }
        : null,
    [modo, tela, selecao.categoria, selecao.subcategoria],
  )
  const precos = usePriceSnapshot(realm, mercadosPedidos, recorte, modo !== 'nada')

  /** Unidades vendidas por dia (task 23), no mesmo recorte do preço. Muda a cada 6 h, não a 30 s. */
  const vendas = useSalesVolume(realm, recorte, modo !== 'nada')
  const indiceDeVendas = useMemo(
    () => (vendas.vendas ? buildSalesIndex(vendas.vendas, canonico) : null),
    [vendas.vendas, canonico],
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
      recipes: receitas,
      pricing,
      strategy,
      destinyBoard: painelDoDestino,
    }),
    [scenario, cidadesDeVenda, cidadesDeCompra, receitas, pricing, strategy, painelDoDestino],
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

  const itensSalvos = useMemo(
    () => new Set(salvos.crafts.map((craft) => craft.output_item)),
    [salvos.crafts],
  )

  const salvarCraft = useCallback(
    async (outputItem: string, outputQuality: number) => {
      if (!realm || itensSalvos.has(outputItem) || itensSalvando.has(outputItem)) return
      setItensSalvando((current) => new Set(current).add(outputItem))
      try {
        await criarSalvo.mutateAsync(
          savedCraftFromScenario(realm, outputItem, {
            quantity: scenario.quantity,
            outputQuality,
          }),
        )
        toast('Receita salva em Meus Crafts.')
      } catch {
        toast('Não foi possível salvar a receita em Meus Crafts.')
      } finally {
        setItensSalvando((current) => {
          const next = new Set(current)
          next.delete(outputItem)
          return next
        })
      }
    }, [realm, itensSalvos, itensSalvando, criarSalvo, scenario.quantity, toast],
  )

  const controleDeSalvo = useCallback(
    (outputItem: string, outputQuality: number, compact = false) => (
      <SavedCraftButton
        saved={itensSalvos.has(outputItem)}
        pending={itensSalvando.has(outputItem)}
        unavailable={salvos.isError}
        compact={compact}
        onSave={() => void salvarCraft(outputItem, outputQuality)}
      />
    ),
    [itensSalvos, itensSalvando, salvos.isError, salvarCraft],
  )

  /**
   * O volume de uma linha — **uma** função para a coluna Vende/dia e para o filtro, senão os dois
   * poderiam discordar sobre a mesma linha. Nula enquanto as vendas não chegam.
   */
  const volumeDaLinha = useMemo<VolumeDaLinha | null>(
    () =>
      indiceDeVendas
        ? (row) => volumeDaVenda(row, indiceDeVendas, cidadesDeVenda, scenario.outputQuality)
        : null,
    [indiceDeVendas, cidadesDeVenda, scenario.outputQuality],
  )

  const visiveis = useMemo(() => {
    const filtradas = filtrarPorVolume(
      applyFilters(linhas, filters, itemsByName),
      filters,
      volumeDaLinha,
    )
    // O Top vem DEPOIS dos filtros: marcar T6 pede as 15 melhores de T6, não as T6 entre as 15.
    const recorte = modo === 'top' ? topPorLucro(filtradas, TOP_RECEITAS) : filtradas
    // O nome desempata a ordem por tier: é o nome que o jogador lê que define "alfabética".
    return sortRows(recorte, sort, nomeItem)
  }, [linhas, filters, itemsByName, volumeDaLinha, sort, nomeItem, modo])

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
    () =>
      buildColumns(locationName, nomeItem, {
        maxIngredientes,
        // Sem o dado ainda, a célula não mostra a linha; com ele, item sem histórico é traço.
        volume: volumeDaLinha ?? undefined,
        savedCraftAction: podeSalvar
          ? (row) => controleDeSalvo(row.outputItem, scenario.outputQuality, true)
          : undefined,
      }),
    [
      locationName,
      nomeItem,
      maxIngredientes,
      volumeDaLinha,
      podeSalvar,
      controleDeSalvo,
      scenario.outputQuality,
    ],
  )

  /**
   * O painel da linha aberta. É calculado **sob demanda**, só para ela: rodar `explainRow` em
   * 110 linhas para guardar detalhe que ninguém abriu seria pagar caro por nada.
   */
  // O mesmo painel da Calculadora (task 14), com o atalho para abrir a receita nela.
  const renderDetail = useCallback(
    (row: ScannerRow) =>
      catalogo.catalog && indice ? (
        <DetalheDaLinha
          key={`${row.outputItem}|${row.locationId}|${scenario.outputQuality}`}
          row={row}
          catalog={catalogo.catalog}
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
          linkDaCalculadora={hrefDaCalculadora(params, row.outputItem)}
          comSeletorDeQualidade={tela === 'crafting'}
          savedCraftAction={
            podeSalvar
              ? (quality) => controleDeSalvo(row.outputItem, quality)
              : undefined
          }
        />
      ) : null,
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
      indiceDeVendas,
      params,
      tela,
      podeSalvar,
      controleDeSalvo,
    ],
  )

  const comPreco = useMemo(
    () => linhas.filter((l) => l.state === 'priced').length,
    [linhas],
  )

  if (!realm) {
    return (
      <RequireRealm>
        <span />
      </RequireRealm>
    )
  }

  const dadosCarregando = catalogo.loading || precos.loading
  const estado = estadoDaTela({
    dadosCarregando,
    calculando: noWorker && doWorker.calculando,
    temLinhas: linhas.length > 0,
  })
  const erro = catalogo.error ?? precos.error
  const noDaCategoria = arvore.find((no) => no.codigo === selecao.categoria)
  const contagem = (n: number) => n.toLocaleString('pt-BR')

  return (
    <div className="flex h-full flex-col gap-3">
      <SidebarSection title="Filtros">
        <div className="space-y-5">
          <FilterSearch
            value={filters.search}
            onChange={(v) => setParam('q', v)}
            placeholder="Buscar receita…"
          />

          {/* O que calcular (task 21). Antes disto a tela calculava o catálogo inteiro ao abrir —
              no craft, 2,7 s antes da primeira linha. */}
          <FilterGroup legend="O que analisar">
            <FilterSelectField
              label={tela === 'refining' ? 'Família' : 'Categoria'}
              value={selecao.categoria ?? ''}
              onChange={(v) => escolherCategoria(v || null)}
              options={[
                // A lista inteira, sem o corte do Top. No craft são segundos de cálculo, e o
                // cabeçalho diz quantas receitas estão sendo calculadas.
                {
                  value: TODAS_AS_CATEGORIAS,
                  label: `Todas (${contagem(arvore.reduce((soma, no) => soma + no.receitas, 0))})`,
                },
                ...arvore.map((no) => ({
                  value: no.codigo,
                  label: `${no.rotulo} (${contagem(no.receitas)})`,
                })),
              ]}
              allLabel="Escolha…"
            />
            {noDaCategoria && noDaCategoria.filhos.length > 0 && (
              <FilterSelectField
                label={tela === 'consumables' ? 'Família' : 'Subcategoria'}
                value={selecao.subcategoria ?? ''}
                onChange={(v) => escolherCategoria(noDaCategoria.codigo, v || null)}
                options={noDaCategoria.filhos.map((no) => ({
                  value: no.codigo,
                  label: `${no.rotulo} (${contagem(no.receitas)})`,
                }))}
                allLabel={`Todas (${contagem(noDaCategoria.receitas)})`}
              />
            )}
            <Button
              variant={selecao.top ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              aria-pressed={selecao.top}
              onClick={() => {
                if (!selecao.top) setSort(ORDEM_DO_TOP)
                alternarTop()
              }}
            >
              Top {TOP_RECEITAS} mais lucrativas
            </Button>
            <p className="text-xs text-foreground-subtle">
              Ou busque pelo nome, a partir de {MIN_LETRAS_DA_BUSCA} letras.
            </p>
          </FilterGroup>

          {/* A mesma barra da Calculadora (task 14): um campo novo entra nas duas de uma vez. */}
          <GrupoMercado
            cidades={cidades}
            locationName={locationName}
            sellIn={sellIn}
            buyIn={buyIn}
            pricing={pricing}
            toggleText={toggleText}
            setParam={setParam}
            limparEscolhas={limparEscolhas}
            dica="Para um item específico, escolha de onde vem o preço no painel da linha."
          />

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
            {tela === 'crafting' && (
              <FilterSelectField
                label="Qualidade"
                value={scenario.outputQuality === 1 ? '' : String(scenario.outputQuality)}
                onChange={(v) => setParam('quality', v)}
                options={[2, 3, 4, 5].map((qualidade) => ({
                  value: String(qualidade),
                  label: formatarQualidade(qualidade) ?? String(qualidade),
                }))}
                allLabel={formatarQualidade(1) ?? 'Normal'}
              />
            )}
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
            {/* Pedido no uso: lucro alto num item que vende 7 por dia não é lucro. O campo mostra
                o texto cru; a leitura da URL descarta o que não é número. */}
            <FilterNumberField
              label="Vende/dia mínimo"
              value={params.get('min_volume') ?? ''}
              onChange={(v) => setParam('min_volume', v)}
              placeholder="qualquer"
              suffix="un."
            />
            <p className="text-xs text-foreground-subtle">
              O mesmo número da coluna Vende/dia. Item sem histórico de venda segue a caixa{' '}
              <strong>Mostrar sem volume de vendas</strong>, abaixo.
            </p>
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
            {/* Mesmo formato do de cima: marcado mostra, desmarcar esconde (pedido no uso). */}
            <FilterCheckbox
              label="Mostrar sem volume de vendas"
              description="Item sem histórico de venda aparece com traço em Vende/dia"
              checked={filters.showWithoutSales}
              onChange={(c) => setParam('no_volume', c ? null : 'false')}
            />
            <FilterCheckbox
              label="Apenas com lucro"
              description="Esconde resultado negativo"
              checked={filters.profitableOnly}
              onChange={(c) => setParam('profit_only', c ? 'true' : null)}
            />
          </FilterGroup>

          <GrupoCenario
            params={params}
            scenario={scenario}
            strategy={strategy}
            setParam={setParam}
            textoDaQuantidade={
              <>
                Quantas receitas você compra material para fazer. O que o retorno devolver vira
                refino a mais — está na coluna <strong>Rendimento</strong>.
              </>
            }
          />

          <Button variant="outline" size="sm" className="w-full" onClick={reset}>
            Limpar filtros
          </Button>
        </div>
      </SidebarSection>

      <header className="shrink-0">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{description}</p>
        <p className="mt-2 text-xs text-foreground-subtle">
          {dadosCarregando ? (
            'Carregando catálogo e preços…'
          ) : modo === 'nada' ? (
            'Nada calculado ainda.'
          ) : estado === 'carregando' ? (
            // Honesto sobre o custo: o Top do craft calcula as 5.523 receitas.
            `Calculando ${contagem(receitas.length)} receitas…`
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
      ) : dadosCarregando ? (
        <Carregando />
      ) : modo === 'nada' ? (
        <EstadoVazio
          title="Selecione o que você deseja analisar"
          icon={<ListFilter className="size-6" />}
        >
          {tela === 'refining' ? 'Escolha uma família' : 'Escolha uma categoria'} na barra lateral,
          peça o Top {TOP_RECEITAS} mais lucrativas ou busque pelo nome.
        </EstadoVazio>
      ) : estado === 'carregando' ? (
        <Carregando label={`Calculando ${contagem(receitas.length)} receitas…`} />
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
      tela="refining"
      title="O que vale a pena refinar"
      description="Todas as receitas de refino, em todas as cidades — inclusive as que ainda não têm preço."
    />
  )
}

export function CraftingScannerPage() {
  return (
    <ScannerPage
      tela="crafting"
      title="O que vale a pena craftar"
      description="As receitas de craft, em todas as cidades — inclusive as que ainda não têm preço. Comida e poção ficam na aba própria."
    />
  )
}

/** Comida, poção e os insumos da cozinha (task 13), sobre o catálogo de craft. */
export function ConsumablesScannerPage() {
  return (
    <ScannerPage
      tela="consumables"
      title="O que vale a pena cozinhar e preparar"
      description="Comida, poção e os insumos da cozinha, em todas as cidades — inclusive as que ainda não têm preço."
    />
  )
}
