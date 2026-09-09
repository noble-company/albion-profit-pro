import { computeScanner, type ScannerCatalog, type ScannerParams } from './engine'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'

/**
 * Worker do scanner (task 4/05).
 *
 * O refino são 110 receitas e nem precisa disto — o engine é importável direto. O craft são
 * 5.523 receitas × 4 cenários, e fazer isso na thread principal congelaria a interface no meio
 * de uma digitação de filtro, que é justamente a experiência que a fase existe para consertar.
 *
 * `Money` é `Decimal`, que não atravessa `postMessage`. A fronteira serializa para string
 * decimal — a mesma representação que o dinheiro já tem no fio (`F09`).
 */

export interface ScannerRequest {
  id: number
  catalog: ScannerCatalog
  snapshot: PriceSnapshotOut
  params: ScannerParams
}

/** `ScannerRow` com os campos monetários como string decimal. */
export interface SerializedScannerRow {
  outputItem: string
  locationId: string
  productionKind: string
  state: string
  acquisitionMode: string | null
  saleMode: string | null
  totalCost: string | null
  grossRevenue: string | null
  salesTax: string | null
  totalFees: string | null
  netRevenue: string | null
  profit: string | null
  roi: string | null
  profitPerWeight: string | null
  profitPerFocus: string | null
  executions: number
  producedQuantity: number
  focusConsumed: number
  oldestObservedAt: number | null
  sources: string[]
}

export interface ScannerResponse {
  id: number
  rows: SerializedScannerRow[]
  durationMs: number
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
    rows: rows.map((row) => ({
      ...row,
      totalCost: row.totalCost?.toString() ?? null,
      grossRevenue: row.grossRevenue?.toString() ?? null,
      salesTax: row.salesTax?.toString() ?? null,
      totalFees: row.totalFees?.toString() ?? null,
      netRevenue: row.netRevenue?.toString() ?? null,
      profit: row.profit?.toString() ?? null,
      roi: row.roi?.toString() ?? null,
      profitPerWeight: row.profitPerWeight?.toString() ?? null,
      profitPerFocus: row.profitPerFocus?.toString() ?? null,
    })),
    durationMs: performance.now() - started,
  }
}

// `self.onmessage` só existe dentro do Worker; em teste o módulo é importado pelo `runScanner`.
if (typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = (event: MessageEvent<ScannerRequest>) => {
    self.postMessage(runScanner(event.data))
  }
}
