import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { money, percentageToRate } from '@/lib/money'

import { DEFAULT_FILTERS, type ScannerFilters } from './filters'
import { DEFAULT_STRATEGY, type ScannerStrategy } from './engine'
import type { PriceBasis, PricingPolicy } from './pricing'

/**
 * Filtros do scanner sincronizados com a URL (task 4/09).
 *
 * Mesmo espírito de `useOpportunityParams` (que fica, servindo o Market Flip até a task 12):
 * a URL é o estado. Um filtro interessante vira link, e o F5 não perde o que a pessoa montou.
 *
 * A diferença é o que acontece depois: aqui nada disso entra em chave de query nem dispara
 * requisição. Todos os campos alimentam ou o predicado (`applyFilters`) ou o engine
 * (`computeScanner`), os dois em memória.
 */

/** Controles que mudam o **valor** das linhas, não quais linhas existem. */
export interface ScannerScenario {
  premium: boolean
  /** a tela sempre pergunta em receitas iniciais; o modo do servidor é só para paridade */
  quantityMeans: 'initial_recipes'
  /** taxa em [0,1], já convertida do percentual digitado */
  returnRate: string
  /**
   * Taxa de uso da estação **por 100 de nutrição consumida** (task 4/18). A chave na URL mudou
   * de `station_cost` junto: mantendo o nome antigo, um link salvo com `station_cost=400`
   * passaria a significar outra coisa em silêncio — e o número certo para aquele refino era 28.
   */
  stationFeePer100Nutrition: string
  useFocus: boolean
  outputQuality: number
  quantity: number
}

/** Lote padrão da tela. Ver o comentário em `quantity` — não é um número decorativo. */
export const DEFAULT_QUANTITY = 100

/**
 * Teto da taxa de retorno. O engine **lança** para taxa fora de [0,1] (`validateRate`), e 100%
 * seria rendimento infinito — nenhum dos dois é tela de erro que o jogador mereça por digitar
 * `150` num campo. O jogo não passa de ~54%, então 99% já é folga larga.
 */
const TETO_DO_RETORNO = '0.99'

function taxaSegura(rate: string): string {
  const valor = money(rate)
  if (valor.lessThan(0)) return '0'
  return valor.greaterThan(TETO_DO_RETORNO) ? TETO_DO_RETORNO : rate
}

/** Quantidade sempre inteira e ≥ 1: zero ou negativo fazem o engine lançar durante o render. */
function quantidadeSegura(raw: string | null): number {
  const bruto = Number(raw ?? DEFAULT_QUANTITY) || DEFAULT_QUANTITY
  return Math.max(1, Math.floor(bruto))
}

/**
 * Onde o item é vendido (task 11.3). `best` = a cidade de maior lucro, uma linha por receita;
 * `all` = uma linha por cidade, para comparar lado a lado; um `location_id` = só aquela.
 */
export type SellIn = string

/** `?px=T5_FIBER:250` → `Map { 'T5_FIBER' => '250' }`. Par malformado é ignorado, não quebra. */
function pares(raw: string[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const entrada of raw) {
    const corte = entrada.lastIndexOf(':')
    if (corte <= 0) continue
    const chave = entrada.slice(0, corte)
    const valor = entrada.slice(corte + 1)
    if (chave && valor) mapa.set(chave, valor)
  }
  return mapa
}

/**
 * Chave de conteúdo de um punhado de parâmetros.
 *
 * `URLSearchParams` ganha **identidade nova a cada mudança de URL**, então memoizar em `[params]`
 * refaz o objeto ao digitar qualquer coisa — inclusive um filtro de exibição. No craft isso
 * custava um recálculo de 5.523 receitas (2,5 s) para esconder linhas que já estavam
 * calculadas. Aqui a dependência é o **valor**, não a referência.
 */
function chaveDe(params: URLSearchParams, chaves: string[]): string {
  return chaves.map((chave) => `${chave}=${params.getAll(chave).join(',')}`).join('&')
}

function numbers(raw: string | null): number[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isInteger(value))
}

export function useScannerFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo<ScannerFilters>(
    () => ({
      search: params.get('q') ?? DEFAULT_FILTERS.search,
      tiers: numbers(params.get('tier')),
      enchantments: numbers(params.get('ench')),
      category: params.get('category'),
      locations: params.getAll('location'),
      minProfit: params.get('min_profit'),
      minRoi: params.get('min_roi'),
      maxAgeHours: params.get('max_age') ? Number(params.get('max_age')) : null,
      // Ausente na URL = ligado. O padrão do produto é mostrar tudo (`X01`/`X02`); só uma
      // desmarcação explícita esconde.
      showUnpriced: params.get('unpriced') !== 'false',
      profitableOnly: params.get('profit_only') === 'true',
    }),
    [params],
  )

  const chaveDoCenario = chaveDe(params, [
    'premium',
    'return_rate',
    'station_fee',
    'focus',
    'quality',
    'qty',
  ])

  const scenario = useMemo<ScannerScenario>(
    () => ({
      premium: params.get('premium') !== 'false',
      quantityMeans: 'initial_recipes',
      returnRate: taxaSegura(percentageToRate(params.get('return_rate') ?? '0')),
      stationFeePer100Nutrition: params.get('station_fee') || '0',
      useFocus: params.get('focus') === 'true',
      outputQuality: Number(params.get('quality') ?? 1) || 1,
      // Padrão em LOTE, não em unidade. Com `qty=1`, `ceil` engole o retorno de recurso
      // inteiro — `ceil(2 × 0,848) = 2` — e a tela mostrava o mesmo lucro com 0% e com 36,7%.
      // Não era conta errada: para um refino só não existe meia fibra para economizar. Era o
      // padrão escondendo um efeito que muda o lucro em dois dígitos percentuais.
      quantity: quantidadeSegura(params.get('qty')),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É o conteúdo lido aqui
    [chaveDoCenario],
  )

  /**
   * De onde vem o preço de cada ingrediente. **Média das cidades é o padrão** — "no fim do dia,
   * a maioria dos players que refinam usa preço médio". `sale` reproduz o comportamento antigo
   * (cotar na cidade da venda), e um `location_id` fixa uma cidade.
   */
  const chaveDosPrecos = chaveDe(params, ['ing_price', 'px', 'pc', 'sx'])

  const pricing = useMemo<PricingPolicy>(() => {
    const bruto = params.get('ing_price')
    const base: PriceBasis =
      bruto === null || bruto === '' || bruto === 'avg'
        ? { kind: 'average' }
        : bruto === 'sale'
          ? { kind: 'sale_city' }
          : { kind: 'city', locationId: bruto }

    return {
      base,
      manual: pares(params.getAll('px')),
      byItemCity: pares(params.getAll('pc')),
      manualSale: pares(params.getAll('sx')),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É o conteúdo lido aqui
  }, [chaveDosPrecos])

  const sellIn: SellIn = params.get('sell_in') || 'best'

  /**
   * Como o jogador compra e vende. Ausente = `best`, o cenário mais lucrativo — que **supõe as
   * duas ordens sendo aceitas**. Quem compra e vende na hora vê outro número, e a tela precisa
   * saber mostrar esse também, senão a leitura por cima cria expectativa que o mercado não paga.
   */
  const chaveDaEstrategia = chaveDe(params, ['buy', 'sell'])

  const strategy = useMemo<ScannerStrategy>(() => {
    const compra = params.get('buy')
    const venda = params.get('sell')
    return {
      acquisition:
        compra === 'immediate' || compra === 'buy_order'
          ? compra
          : DEFAULT_STRATEGY.acquisition,
      sale:
        venda === 'immediate' || venda === 'sell_order' ? venda : DEFAULT_STRATEGY.sale,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave É o conteúdo lido aqui
  }, [chaveDaEstrategia])

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params)
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const setList = useCallback(
    (key: string, values: string[]) => {
      const next = new URLSearchParams(params)
      next.delete(key)
      values.forEach((value) => next.append(key, value))
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  /** Escreve/remove uma exceção por item (`px` = preço na mão, `pc` = cidade daquele item). */
  const setExcecao = useCallback(
    (key: 'px' | 'pc' | 'sx', item: string, valor: string | null) => {
      const atual = pares(params.getAll(key))
      if (valor === null || valor === '') atual.delete(item)
      else atual.set(item, valor)
      setList(
        key,
        [...atual].map(([chave, valorDoItem]) => `${chave}:${valorDoItem}`),
      )
    },
    [params, setList],
  )

  /** Alterna um valor numa multi-seleção (tier, encantamento). */
  const toggleNumber = useCallback(
    (key: string, value: number) => {
      const atual = numbers(params.get(key))
      const proximo = atual.includes(value)
        ? atual.filter((v) => v !== value)
        : [...atual, value].sort((a, b) => a - b)
      setParam(key, proximo.length ? proximo.join(',') : null)
    },
    [params, setParam],
  )

  /**
   * Alterna um valor numa multi-seleção de **texto**, que viaja como parâmetro repetido
   * (`?location=1002&location=4002`) — é o formato que `filters.locations` lê. Cidade não cabe
   * em `toggleNumber`: o identificador não é número e a lista não é separada por vírgula.
   */
  const toggleText = useCallback(
    (key: string, value: string) => {
      const atual = params.getAll(key)
      setList(
        key,
        atual.includes(value) ? atual.filter((v) => v !== value) : [...atual, value],
      )
    },
    [params, setList],
  )

  const reset = useCallback(
    () => setParams(new URLSearchParams(), { replace: true }),
    [setParams],
  )

  return {
    params,
    filters,
    scenario,
    pricing,
    sellIn,
    strategy,
    setExcecao,
    setParam,
    setList,
    toggleNumber,
    toggleText,
    reset,
  }
}
