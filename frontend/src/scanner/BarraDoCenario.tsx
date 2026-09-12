import { useMemo, type ReactNode } from 'react'

import {
  FilterCheckbox,
  FilterChips,
  FilterGroup,
  FilterNumberField,
  FilterSelectField,
} from '@/components/filters'
import { formatarQualidade } from '@/lib/formatters'
import type { Cidade } from '@/lib/locations'
import { percentageToRate } from '@/lib/money'

import type { ScannerStrategy } from './engine'
import { itensComEscolhaPropria, type PricingPolicy } from './pricing'
import { RETORNOS_PADRAO, rendimentoPorCemRecursos } from './return-rates'
import { erroDaQuantidade, erroDoRetorno } from './tela'
import { DEFAULT_QUANTITY, type ScannerScenario } from './useScannerFilters'

/**
 * A barra do cenário, a mesma no scanner e na Calculadora (task 4/14).
 *
 * As duas telas leem os mesmos parâmetros de URL. Com a barra copiada, o primeiro campo novo
 * entraria numa e não na outra — e "Abrir na Calculadora" levaria um cenário que ela não mostra.
 */

type Lado = 'compra' | 'venda'

export function GrupoMercado({
  cidades,
  locationName,
  sellIn,
  buyIn,
  pricing,
  toggleText,
  setParam,
  limparEscolhas,
  dica,
}: {
  cidades: Cidade[]
  locationName: (id: string) => string
  sellIn: readonly string[]
  buyIn: readonly string[]
  pricing: PricingPolicy
  toggleText: (key: string, value: string) => void
  setParam: (key: string, value: string | null) => void
  limparEscolhas: (lado: Lado) => void
  /** onde a tela deixa escolher a origem de um item só */
  dica: string
}) {
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
      <p className="text-xs text-foreground-subtle">{dica}</p>
    </FilterGroup>
  )
}

/** Separado do Mercado de propósito: estes mudam o VALOR das linhas, não quais linhas existem. */
export function GrupoCenario({
  params,
  scenario,
  strategy,
  setParam,
  textoDaQuantidade,
  comQualidade = false,
}: {
  params: URLSearchParams
  scenario: ScannerScenario
  strategy: ScannerStrategy
  setParam: (key: string, value: string | null) => void
  /** o que "Receitas a fazer" rende, dito no vocabulário da tela */
  textoDaQuantidade: ReactNode
  /** a Calculadora cota uma qualidade; a tabela do scanner não tem esse controle */
  comQualidade?: boolean
}) {
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

  return (
    <FilterGroup legend="Seu cenário">
      {comQualidade && (
        <FilterSelectField
          label="Qualidade"
          value={scenario.outputQuality === 1 ? '' : String(scenario.outputQuality)}
          onChange={(v) => setParam('quality', v)}
          options={[2, 3, 4, 5].map((q) => ({
            value: String(q),
            label: formatarQualidade(q) ?? String(q),
          }))}
          allLabel={formatarQualidade(1) ?? '1'}
        />
      )}
      {/* O padrão escolhe o cenário mais lucrativo, que supõe as duas ordens sendo aceitas.
          Travar aqui responde a outra pergunta: quanto rende do jeito que eu de fato opero. */}
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
      {/* O campo mostra o texto cru e diz quando ele não vale (task 14, `E05`): a conta segue
          com o valor seguro da leitura da URL, mas o jogador fica sabendo que não é o dele. */}
      <FilterNumberField
        label="Receitas a fazer"
        value={params.get('qty') ?? ''}
        onChange={(v) => setParam('qty', v)}
        placeholder={String(DEFAULT_QUANTITY)}
        error={erroDaQuantidade(params.get('qty'))}
      />
      <p className="text-xs text-foreground-subtle">{textoDaQuantidade}</p>
      <FilterNumberField
        label="Retorno de recurso"
        // O valor cru digitado, não a taxa convertida: o campo mostra "36,7", e
        // `percentageToRate` converte para 0.367 na leitura (task 3.6/01).
        value={params.get('return_rate') ?? ''}
        onChange={(v) => setParam('return_rate', v)}
        placeholder="0"
        suffix="%"
        error={erroDoRetorno(params.get('return_rate'))}
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
          Com esse retorno, <strong>100 recursos rendem ~{rendimentoDoRetorno}</strong> itens — o
          que volta é refinado de novo, e assim por diante. Já está no custo.
        </p>
      )}
      <FilterNumberField
        label="Taxa da estação"
        value={
          scenario.stationFeePer100Nutrition === '0' ? '' : scenario.stationFeePer100Nutrition
        }
        onChange={(v) => setParam('station_fee', v)}
        placeholder="0"
        suffix="/100 nut."
      />
      <p className="text-xs text-foreground-subtle">
        A <strong>taxa de uso por 100 de nutrição</strong> que a estação cobra — o número que
        aparece no topo da janela dela no jogo. Quanto cada receita consome sai do valor do item,
        então a mesma taxa custa centavos num recurso T4 e milhares numa arma T8.
      </p>
      <FilterCheckbox
        label="Conta Premium"
        description="Imposto de venda 4% em vez de 8%"
        checked={scenario.premium}
        onChange={(c) => setParam('premium', c ? null : 'false')}
      />
      <FilterCheckbox
        label="Usar foco"
        description="Conta o foco gasto e o lucro por ponto de foco"
        checked={scenario.useFocus}
        onChange={(c) => setParam('focus', c ? 'true' : null)}
      />
    </FilterGroup>
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
