import { Link } from 'react-router'

import type { Realm } from '@/app/ServerContext'
import type { Cidade } from '@/lib/locations'
import { money } from '@/lib/money'

import { motivoSemPreco } from './columns'
import { explainRow, type ScannerCatalog, type ScannerParams, type ScannerRow } from './engine'
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
}) {
  const receita = catalog.recipes.find((r) => r.output_item === row.outputItem)
  const detail = explainRow(catalog, indice, params, {
    outputItem: row.outputItem,
    locationId: row.locationId,
  })

  const link = linkDaCalculadora ? (
    <Link
      to={linkDaCalculadora}
      className="block text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
    >
      Abrir na Calculadora
    </Link>
  ) : null

  if (!detail || !receita) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-foreground-subtle">
          Sem cotação suficiente para abrir o extrato desta receita — falta{' '}
          {motivoSemPreco(row) ?? 'preço'}. A lista de compras continua na linha.
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
          location_id: row.locationId,
          quantity: scenario.quantity,
          output_quality: scenario.outputQuality,
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
    <RowDetails
      detail={detail}
      nomeItem={nomeItem}
      locationName={locationName}
      precoPorCidade={cidades.map((cidade) => {
        const entrada = indice.get(
          priceKey(row.outputItem, cidade.id, scenario.outputQuality, receita.enchantment_level),
        )
        return {
          locationId: cidade.id,
          sell: entrada?.sell ? money(entrada.sell.price) : null,
          buy: entrada?.buy ? money(entrada.buy.price) : null,
          unitsPerDay:
            indiceDeVendas?.get(chaveDeVenda(row.outputItem, cidade.id, scenario.outputQuality)) ??
            null,
        }
      })}
      cidades={cidades}
      origemDe={(lado, item) => origemDoItem(pricing, lado, item)}
      padraoDe={(lado) => origemPadrao(pricing, lado)}
      onOrigem={onOrigem}
      analise={
        analiseExata || link ? (
          <div className="space-y-2">
            {analiseExata}
            {link}
          </div>
        ) : undefined
      }
    />
  )
}
