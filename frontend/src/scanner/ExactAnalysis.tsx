import { useMutation } from '@tanstack/react-query'

import { WarningBadges } from '@/components/opportunities/WarningBadges'
import { Button } from '@/components/ui/button'
import { formatSilver, money, subtract, type Money } from '@/lib/money'
import { simulateCraft, type CraftRequest, type CraftResult } from '@/craft/service'

/**
 * A ponte entre a estimativa e o exato (task 4/11.5).
 *
 * O scanner lê **topo de livro**: a melhor oferta de cada lado, sem saber quantas unidades
 * existem por trás dela. Uma ordem solitária de 3 unidades a preço ótimo faz a linha prometer
 * um lucro que o mercado não paga na quantidade pedida.
 *
 * `POST /craft/simulate` anda o livro de verdade, com slippage, e devolve os avisos
 * (`profundidade_insuficiente`, `dado_velho`…). Aqui as duas contas ficam **lado a lado**: a
 * diferença entre elas é a informação, não um detalhe de implementação a esconder.
 *
 * É a única parte do painel que vai à rede, e só quando alguém pede.
 */
export function ExactAnalysis({
  request,
  estimativa,
  acquisitionMode,
  saleMode,
}: {
  request: CraftRequest
  /** o lucro que o scanner promete, para comparar */
  estimativa: Money
  acquisitionMode: string
  saleMode: string
}) {
  const analise = useMutation({ mutationFn: (payload: CraftRequest) => simulateCraft(payload) })

  const cenario = escolherCenario(analise.data, acquisitionMode, saleMode)
  const exato = cenario?.profit ? money(cenario.profit) : null
  const diferenca = exato ? subtract(exato, estimativa) : null

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={analise.isPending}
        onClick={() => analise.mutate(request)}
      >
        {analise.isPending ? 'Analisando…' : 'Analisar com o livro real'}
      </Button>

      {analise.isError && (
        <p className="text-xs text-danger">
          A análise exata não veio. A estimativa acima continua válida — ela não depende desta
          chamada.
        </p>
      )}

      {analise.isSuccess && (
        <div className="space-y-1 text-xs">
          {exato === null ? (
            <p className="text-foreground-subtle">
              O livro real não sustenta este cenário na quantidade pedida.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-foreground-muted">Estimativa (topo de livro)</span>
                <span className="tabular-nums">{formatSilver(estimativa)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 font-semibold">
                <span>Exato (livro completo)</span>
                <span className="tabular-nums">{formatSilver(exato)}</span>
              </div>
              {diferenca && (
                <div
                  className={`flex items-baseline justify-between gap-3 border-t border-border pt-1 ${
                    diferenca.isNegative() ? 'text-danger' : 'text-profit'
                  }`}
                >
                  <span>Diferença</span>
                  <span className="tabular-nums">{formatSilver(diferenca)}</span>
                </div>
              )}
            </>
          )}

          {cenario && cenario.warnings.length > 0 && (
            <WarningBadges warnings={cenario.warnings} />
          )}

          <p className="text-[0.6875rem] leading-snug text-foreground-subtle">
            O exato anda a profundidade do livro. Quando ele fica abaixo da estimativa, a
            diferença é o preço de comprar (ou vender) mais unidades do que a melhor oferta
            aguenta.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * O cenário comparável é o **mesmo** que a linha mostra. Pegar o mais lucrativo do exato
 * compararia laranja com maçã: a estimativa de um caminho contra o número de outro.
 */
function escolherCenario(
  resultado: CraftResult | undefined,
  acquisitionMode: string,
  saleMode: string,
) {
  return resultado?.scenarios.find(
    (cenario) =>
      cenario.acquisition_mode === acquisitionMode && cenario.sale_mode === saleMode,
  )
}
