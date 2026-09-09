import { useEffect, useMemo, useRef, useState } from 'react'

import type { ScannerCatalog, ScannerParams, ScannerRow } from './engine'
import type { PriceSnapshotOut } from './prices'
import { reviveRow, type ScannerResponse } from './worker'

/**
 * O cálculo do craft fora da thread principal (task 4/12).
 *
 * Medido no catálogo sintético de 5.523 receitas × 8 cidades: `computeScanner` leva **2.583 ms**.
 * Na thread principal isso é a interface travada por dois segundos e meio **a cada** mudança de
 * cenário — a quantidade, o retorno, a estratégia, o preço fixado de um ingrediente.
 *
 * **O catálogo viaja uma vez, não a cada tecla.** O protocolo tem duas mensagens: `data` manda
 * o catálogo e o snapshot (e o worker constrói o índice de preços uma vez só), `compute` manda
 * só os parâmetros. Reenviar 5.523 receitas a cada digitação custaria mais que o cálculo.
 *
 * O mapeamento de cidades canônicas viaja como pares em vez de função: `postMessage` não leva
 * função, e o `1301 → 1002` precisa existir dos dois lados.
 */

export interface EntradaDoWorker {
  catalog: ScannerCatalog
  snapshot: PriceSnapshotOut
  canonical: Array<[string, string]>
  params: ScannerParams
}

export interface ResultadoDoWorker {
  rows: ScannerRow[]
  /** `true` entre pedir e receber — a tela diz que está recalculando em vez de mentir */
  calculando: boolean
  /** quanto o último cálculo levou, para a tela poder ser honesta sobre o custo */
  duracaoMs: number | null
}

type CriarWorker = () => Worker

const padraoCriarWorker: CriarWorker = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

export function useScannerWorker(
  entrada: EntradaDoWorker | null,
  criarWorker: CriarWorker = padraoCriarWorker,
): ResultadoDoWorker {
  const workerRef = useRef<Worker | null>(null)
  /** Só a resposta do último pedido pinta a tela: cálculo antigo que chega depois é lixo. */
  const ultimoId = useRef(0)
  const [estado, setEstado] = useState<ResultadoDoWorker>({
    rows: [],
    calculando: false,
    duracaoMs: null,
  })

  // Sem entrada não há thread: o refino chama este hook com `null` e não pode pagar por um
  // Worker ocioso — criar é caro (a thread carrega o bundle do engine inteiro).
  const ativo = entrada !== null

  useEffect(() => {
    if (!ativo) return
    const worker = criarWorker()
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<ScannerResponse>) => {
      if (event.data.id !== ultimoId.current) return
      setEstado({
        rows: event.data.rows.map(reviveRow),
        calculando: false,
        duracaoMs: event.data.durationMs,
      })
    }

    return () => {
      worker.onmessage = null
      worker.terminate()
      workerRef.current = null
    }
  }, [ativo, criarWorker])

  // Separado do envio dos parâmetros: catálogo e snapshot mudam raramente, e clonar 5.523
  // receitas a cada mudança de filtro custaria mais que o próprio cálculo.
  //
  // O mapeamento de cidades entra por **conteúdo**, não por identidade: ele é derivado de uma
  // lista e ganharia referência nova a cada render de quem chama, reenviando o catálogo inteiro
  // por nada. É o tipo de desperdício que não aparece em teste de comportamento.
  const canonicalKey = (entrada?.canonical ?? [])
    .map(([de, para]) => `${de}>${para}`)
    .join(',')

  const dados = useMemo(
    () =>
      entrada && {
        catalog: entrada.catalog,
        snapshot: entrada.snapshot,
        canonical: entrada.canonical,
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `canonicalKey` é o conteúdo de `canonical`
    [entrada?.catalog, entrada?.snapshot, canonicalKey],
  )

  useEffect(() => {
    if (dados && workerRef.current) {
      workerRef.current.postMessage({ type: 'data', ...dados })
    }
  }, [dados])

  const params = entrada?.params

  useEffect(() => {
    if (!dados || !params || !workerRef.current) return
    ultimoId.current += 1
    setEstado((atual) => ({ ...atual, calculando: true }))
    workerRef.current.postMessage({ type: 'compute', id: ultimoId.current, params })
  }, [dados, params])

  return estado
}
