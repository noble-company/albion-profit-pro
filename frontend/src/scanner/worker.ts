import type Decimal from 'decimal.js'

import { money, type Money } from '@/lib/money'

import {
  computeScanner,
  type ScannerCatalog,
  type ScannerIngredient,
  type ScannerParams,
  type ScannerRow,
} from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'

/**
 * Worker do scanner (tasks 4/05 e 4/12).
 *
 * O refino são 110 receitas e nem precisa disto. O craft são **5.523 × 8 cidades**, e medido no
 * catálogo sintético isso leva **2.583 ms** — dois segundos e meio de interface congelada a cada
 * mudança de cenário, que é justamente a experiência que a fase existe para consertar.
 *
 * `Money` é `Decimal`, que **não atravessa `postMessage`**: o `structuredClone` copia as
 * propriedades e perde o protótipo, então do outro lado chegaria um objeto sem `.plus()`. A
 * fronteira serializa para string decimal — a mesma representação que o dinheiro já tem no fio
 * (`F09`).
 */

/**
 * O formato serializado é **derivado** de `ScannerRow`, não repetido à mão.
 *
 * A primeira versão listava os campos e ficou desatualizada sem ninguém notar: `averageUnitCost`
 * e `ingredients` entraram depois e não estavam lá. Uma linha chegaria à tela com a lista de
 * compras vazia e o custo por item nulo, **sem erro em lugar nenhum**. Com o tipo mapeado, campo
 * novo em `ScannerRow` quebra a compilação aqui.
 */
type MoneyParaString<T> = {
  [K in keyof T]: T[K] extends Money | null
    ? string | null
    : T[K] extends ScannerIngredient[]
      ? SerializedIngredient[]
      : T[K]
}

export type SerializedIngredient = MoneyParaString<ScannerIngredient>
export type SerializedScannerRow = MoneyParaString<ScannerRow>

/**
 * Duas mensagens de propósito. `data` chega quando o catálogo ou o snapshot mudam — raramente —
 * e é onde o índice de preços é construído, **uma vez**. `compute` chega a cada mudança de
 * cenário e leva só os parâmetros. Mandar as 5.523 receitas junto de cada tecla custaria mais
 * que o cálculo.
 */
export interface ScannerData {
  type: 'data'
  catalog: ScannerCatalog
  snapshot: PriceSnapshotOut
  /** `1301 → 1002`: o mapeamento viaja como pares porque função não atravessa `postMessage`. */
  canonical: Array<[string, string]>
}

export interface ScannerCompute {
  type: 'compute'
  id: number
  params: ScannerParams
}

export type ScannerMessage = ScannerData | ScannerCompute

/** Compatibilidade com `runScanner`, que roda tudo de uma vez (usado em teste). */
export interface ScannerRequest {
  id: number
  catalog: ScannerCatalog
  snapshot: PriceSnapshotOut
  params: ScannerParams
}

export interface ScannerResponse {
  id: number
  rows: SerializedScannerRow[]
  durationMs: number
}

const texto = (valor: Decimal | null): string | null => valor?.toString() ?? null
/** `null` continua `null`: ausência não é zero, e virar zero seria uma afirmação sobre o
 * mercado que ninguém fez (`X02`). */
const numero = (valor: string | null): Money | null => (valor === null ? null : money(valor))

export function serializeRow(row: ScannerRow): SerializedScannerRow {
  return {
    ...row,
    totalCost: texto(row.totalCost),
    averageUnitCost: texto(row.averageUnitCost),
    grossRevenue: texto(row.grossRevenue),
    salesTax: texto(row.salesTax),
    totalFees: texto(row.totalFees),
    netRevenue: texto(row.netRevenue),
    profit: texto(row.profit),
    roi: texto(row.roi),
    profitPerWeight: texto(row.profitPerWeight),
    profitPerFocus: texto(row.profitPerFocus),
    ingredients: row.ingredients.map((ingrediente) => ({
      ...ingrediente,
      unitPrice: texto(ingrediente.unitPrice),
      subtotal: texto(ingrediente.subtotal),
    })),
  }
}

export function reviveRow(raw: SerializedScannerRow): ScannerRow {
  return {
    ...raw,
    totalCost: numero(raw.totalCost),
    averageUnitCost: numero(raw.averageUnitCost),
    grossRevenue: numero(raw.grossRevenue),
    salesTax: numero(raw.salesTax),
    totalFees: numero(raw.totalFees),
    netRevenue: numero(raw.netRevenue),
    profit: numero(raw.profit),
    roi: numero(raw.roi),
    profitPerWeight: numero(raw.profitPerWeight),
    profitPerFocus: numero(raw.profitPerFocus),
    ingredients: raw.ingredients.map((ingrediente) => ({
      ...ingrediente,
      unitPrice: numero(ingrediente.unitPrice),
      subtotal: numero(ingrediente.subtotal),
    })),
  }
}

export function runScanner(request: ScannerRequest): ScannerResponse {
  const started = performance.now()
  const rows = computeScanner(
    request.catalog,
    buildPriceIndex(request.snapshot),
    request.params,
  )
  return {
    id: request.id,
    rows: rows.map(serializeRow),
    durationMs: performance.now() - started,
  }
}

// `self.onmessage` só existe dentro do Worker; em teste o módulo é importado pelo `runScanner`.
if (typeof self !== 'undefined' && 'onmessage' in self) {
  let catalogo: ScannerCatalog | null = null
  let indice: ReturnType<typeof buildPriceIndex> | null = null

  self.onmessage = (event: MessageEvent<ScannerMessage>) => {
    const mensagem = event.data
    if (mensagem.type === 'data') {
      const porMercado = new Map(mensagem.canonical)
      catalogo = mensagem.catalog
      indice = buildPriceIndex(mensagem.snapshot, (id) => porMercado.get(id) ?? id)
      return
    }

    if (!catalogo || !indice) return
    const started = performance.now()
    const rows = computeScanner(catalogo, indice, mensagem.params)
    const resposta: ScannerResponse = {
      id: mensagem.id,
      rows: rows.map(serializeRow),
      durationMs: performance.now() - started,
    }
    self.postMessage(resposta)
  }
}
