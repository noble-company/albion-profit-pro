import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import type { Realm } from '@/app/ServerContext'
import { FilterSelectField } from '@/components/filters'
import { formatarQualidade } from '@/lib/formatters'
import type { Cidade } from '@/lib/locations'
import { money } from '@/lib/money'

import { motivoSemPreco } from './columns'
import {
  bestPerRecipe,
  computeScanner,
  explainRow,
  type ScannerCatalog,
  type ScannerParams,
  type ScannerRow,
} from './engine'
import { ExactAnalysis } from './ExactAnalysis'
import { priceKey, type PriceIndex } from './prices'
import { origemDoItem, origemPadrao, type Origem, type PricingPolicy } from './pricing'
import { RowDetails } from './RowDetails'
import { podeAnalisar, precosNaMaoPara } from './tela'
import type { ScannerScenario } from './useScannerFilters'
import { chaveDeVenda, type SalesIndex } from './vendas'

/**
 * O painel de uma receita numa cidade — o da linha aberta no scanner e o da cidade escolhida na
 * Calculadora (task 4/14). Um componente só: dois extratos da mesma conta poderiam discordar, e
 * extrato que discorda da linha que explica é o pior defeito que um extrato pode ter.
 *
 * Calculado sob demanda: `explainRow` roda só para o painel que está aberto.
 */
export function DetalheDaLinha({
  row,
  catalog,
  indice,
  params,
  cidades,
  nomeItem,
  locationName,
  pricing,
  scenario,
  realm,
  onOrigem,
  indiceDeVendas,
  linkDaCalculadora,
  rotuloDoLinkDaCalculadora = 'Abrir na Calculadora',
  comSeletorDeQualidade = false,
  savedCraftAction,
  readOnly = false,
}: {
  row: ScannerRow
  catalog: ScannerCatalog
  indice: PriceIndex
  params: ScannerParams
  cidades: Cidade[]
  nomeItem: (uniqueName: string) => string
  locationName: (id: string) => string
  pricing: PricingPolicy
  scenario: ScannerScenario
  realm: Realm | null
  onOrigem: (lado: 'compra' | 'venda', item: string, origem: Origem) => void
  indiceDeVendas: SalesIndex | null
  /** "Abrir na Calculadora" (task 14) — ausente na própria Calculadora */
  linkDaCalculadora?: string
  /** Meus Crafts troca o rótulo quando uma receita refinada retorna à aba Refino. */
  rotuloDoLinkDaCalculadora?: string
  /** No Craft, permite comparar outra qualidade sem recalcular ou reordenar a tabela inteira. */
  comSeletorDeQualidade?: boolean
  /** Botão de salvar recebe a qualidade que está sendo analisada neste painel. */
  savedCraftAction?: (quality: number) => ReactNode
  /** Meus Crafts A07 reaproveita o extrato sem oferecer edição antes da A08. */
  readOnly?: boolean
}) {
  const [qualidadeAnalisada, setQualidadeAnalisada] = useState(scenario.outputQuality)
  const paramsDoDetalhe =
    qualidadeAnalisada === params.outputQuality
      ? params
      : { ...params, outputQuality: qualidadeAnalisada }
  const receita = catalog.recipes.find((r) => r.output_item === row.outputItem)
  const rowDaQualidade =
    qualidadeAnalisada === params.outputQuality || !receita
      ? row
      : (bestPerRecipe(
          computeScanner({ items: catalog.items, recipes: [receita] }, indice, paramsDoDetalhe),
        )[0] ?? row)
  const detail = explainRow(catalog, indice, paramsDoDetalhe, {
    outputItem: row.outputItem,
    locationId: rowDaQualidade.locationId,
  })

  const seletorDeQualidade = comSeletorDeQualidade ? (
    <div className="max-w-xs">
      <FilterSelectField
        label="Qualidade analisada"
        value={String(qualidadeAnalisada)}
        onChange={(valor) => setQualidadeAnalisada(Number(valor))}
        options={[1, 2, 3, 4, 5].map((qualidade) => ({
          value: String(qualidade),
          label: formatarQualidade(qualidade) ?? String(qualidade),
        }))}
        allLabel={null}
      />
      <p className="mt-1 text-xs text-foreground-subtle">
        Altera somente esta análise; a tabela continua na qualidade escolhida nos filtros.
      </p>
    </div>
  ) : null
  const acaoDeSalvar = savedCraftAction?.(qualidadeAnalisada)

  const destinoDaCalculadora = (() => {
    if (!linkDaCalculadora) return null
    const [caminho, busca = ''] = linkDaCalculadora.split('?')
    const parametros = new URLSearchParams(busca)
    if (qualidadeAnalisada === 1) parametros.delete('quality')
    else parametros.set('quality', String(qualidadeAnalisada))
    return `${caminho}?${parametros.toString()}`
  })()

  const link = destinoDaCalculadora ? (
    <Link
      to={destinoDaCalculadora}
      className="block text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
    >
      {rotuloDoLinkDaCalculadora}
    </Link>
  ) : null

  if (!detail || !receita) {
    return (
      <div className="space-y-2">
        {(seletorDeQualidade || acaoDeSalvar) && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            {seletorDeQualidade}
            {acaoDeSalvar}
          </div>
        )}
        <p className="text-xs text-foreground-subtle">
          Sem cotação suficiente para abrir o extrato desta receita — falta{' '}
          {motivoSemPreco(rowDaQualidade) ?? 'preço'}. A lista de compras continua na linha.
        </p>
        {link}
      </div>
    )
  }

  const analiseExata =
    realm && detail.row.profit && podeAnalisar(detail.row) ? (
      <ExactAnalysis
        request={{
          server: realm,
          output_item: row.outputItem,
          location_id: detail.row.locationId,
          quantity: scenario.quantity,
          output_quality: qualidadeAnalisada,
          scope: 'all',
          return_rate: scenario.returnRate,
          station_fee_per_100_nutrition: scenario.stationFeePer100Nutrition,
          use_focus: scenario.useFocus,
          premium: scenario.premium,
          // As exceções de preço da barra viajam junto: sem elas o "exato" ignoraria o preço que
          // o jogador declarou pagar e as duas contas não se comparariam.
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
    ) : null

  return (
    <div className="space-y-4">
      {(seletorDeQualidade || acaoDeSalvar) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {seletorDeQualidade}
          {acaoDeSalvar}
        </div>
      )}
      <RowDetails
        detail={detail}
        nomeItem={nomeItem}
        locationName={locationName}
        precoPorCidade={cidades.map((cidade) => {
          const entrada = indice.get(
            priceKey(row.outputItem, cidade.id, qualidadeAnalisada, receita.enchantment_level),
          )
          return {
            locationId: cidade.id,
            sell: entrada?.sell ? money(entrada.sell.price) : null,
            buy: entrada?.buy ? money(entrada.buy.price) : null,
            unitsPerDay:
              indiceDeVendas?.get(chaveDeVenda(row.outputItem, cidade.id, qualidadeAnalisada)) ??
              null,
          }
        })}
        cidades={cidades}
        origemDe={(lado, item) => origemDoItem(pricing, lado, item)}
        padraoDe={(lado) => origemPadrao(pricing, lado)}
        onOrigem={onOrigem}
        readOnly={readOnly}
        analise={
          analiseExata || link ? (
            <div className="space-y-2">
              {analiseExata}
              {link}
            </div>
          ) : undefined
        }
      />
    </div>
  )
}
