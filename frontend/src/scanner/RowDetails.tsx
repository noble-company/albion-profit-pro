import { useState, type ReactNode } from 'react'

import { filterControl } from '@/components/filters'
import { Button } from '@/components/ui/button'
import { formatarIdade } from '@/lib/formatters'
import { formatSilver, type Money } from '@/lib/money'

import type { ScannerDetail, ScannerScenarioResult } from './engine'

/**
 * O que a linha esconde (task 4/11.4).
 *
 * A tabela dá um número e pede confiança. Aqui ela mostra o serviço: de onde veio cada preço,
 * quanto de cada taxa, o que os outros três cenários dariam, e por quanto no mínimo dá para
 * vender sem perder dinheiro. É também onde o jogador **discorda** — fixando o preço que ele
 * realmente pratica.
 *
 * Tudo é derivado de `explainRow`, que roda o mesmo `evaluate` da tabela. Se este painel fosse
 * uma segunda conta, ele poderia contradizer a linha que explica.
 */

const TRACO = '—'

const MODO_COMPRA: Record<string, string> = {
  immediate: 'compra imediata',
  buy_order: 'ordem de compra',
}
const MODO_VENDA: Record<string, string> = {
  immediate: 'venda imediata',
  sell_order: 'ordem de venda',
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Linha({
  rotulo,
  valor,
  forte,
}: {
  rotulo: string
  valor: ReactNode
  forte?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-xs ${
        forte ? 'border-t border-border pt-1 font-semibold text-foreground' : ''
      }`}
    >
      <span className={forte ? '' : 'text-foreground-muted'}>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  )
}

/** Idade de uma observação. Preço na mão não tem idade — e dizer "agora" seria mentira. */
function idade(observedAt: number | null, agora: Date): string {
  if (observedAt === null) return 'sem data'
  return formatarIdade(new Date(observedAt * 1000).toISOString(), agora)
}

function rotuloCenario(cenario: ScannerScenarioResult): string {
  return `${MODO_COMPRA[cenario.acquisitionMode] ?? cenario.acquisitionMode} · ${
    MODO_VENDA[cenario.saleMode] ?? cenario.saleMode
  }`
}

export interface PrecoDaCidade {
  locationId: string
  sell: Money | null
  buy: Money | null
}

export function RowDetails({
  detail,
  nomeItem,
  locationName,
  precoPorCidade,
  precoDeVendaFixado,
  precosFixados,
  onExcecao,
  analise,
  agora = new Date(),
}: {
  detail: ScannerDetail
  nomeItem: (uniqueName: string) => string
  locationName: (id: string) => string
  /** preço da saída em cada cidade, para responder "e se eu vendesse em outro lugar?" */
  precoPorCidade: PrecoDaCidade[]
  precoDeVendaFixado: string | undefined
  precosFixados: Map<string, string>
  onExcecao: (key: 'px' | 'sx', item: string, valor: string | null) => void
  /** a ponte para o número exato; ausente = o painel só mostra a estimativa */
  analise?: ReactNode
  agora?: Date
}) {
  const { row, breakdown, scenarios, ingredients } = detail

  return (
    <div className="grid gap-5 text-sm md:grid-cols-2 xl:grid-cols-3">
      <Secao titulo="Extrato">
        <Linha rotulo="Ingredientes" valor={formatSilver(breakdown.ingredientCost)} />
        <Linha
          rotulo="Taxa de montagem (compra)"
          valor={formatSilver(breakdown.acquisitionSetupFee)}
        />
        <Linha rotulo="Prata da receita" valor={formatSilver(breakdown.recipeSilver)} />
        <Linha rotulo="Estação" valor={formatSilver(breakdown.stationCost)} />
        <Linha rotulo="Custo total" valor={formatSilver(breakdown.totalCost)} forte />

        <div className="pt-2" />
        <Linha rotulo="Venda bruta" valor={formatSilver(breakdown.grossRevenue)} />
        <Linha rotulo="Imposto de venda" valor={`− ${formatSilver(breakdown.salesTax)}`} />
        <Linha
          rotulo="Taxa de montagem (venda)"
          valor={`− ${formatSilver(breakdown.saleSetupFee)}`}
        />
        <Linha rotulo="Recebe líquido" valor={formatSilver(breakdown.netRevenue)} forte />

        <div className="pt-2" />
        <Linha
          rotulo="Preço de equilíbrio (por item)"
          valor={
            detail.breakEvenUnitPrice ? (
              formatSilver(detail.breakEvenUnitPrice)
            ) : (
              <span className="text-foreground-subtle">{TRACO}</span>
            )
          }
        />
        <p className="text-[0.6875rem] leading-snug text-foreground-subtle">
          Abaixo disso a venda não paga o custo mais as taxas. Aproximado: no jogo cada cobrança
          arredonda para cima.
        </p>

        {analise && <div className="pt-2">{analise}</div>}
      </Secao>

      <Secao titulo="Ingredientes">
        <ul className="space-y-2">
          {ingredients.map((ingrediente) => (
            <li key={ingrediente.item} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {nomeItem(ingrediente.item)}
                  <span className="ml-1 tabular-nums text-foreground-subtle">
                    ×{ingrediente.purchaseQuantity.toLocaleString('pt-BR')}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {ingrediente.unitPrice ? formatSilver(ingrediente.unitPrice) : TRACO}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[0.6875rem] text-foreground-subtle">
                <span className="min-w-0 truncate">
                  {ingrediente.source ?? 'sem cotação'} ·{' '}
                  {idade(ingrediente.observedAt, agora)}
                </span>
                <span className="shrink-0 tabular-nums">
                  {ingrediente.subtotal ? formatSilver(ingrediente.subtotal) : TRACO}
                </span>
              </div>
              <PrecoEditavel
                rotulo={`Fixar preço de ${nomeItem(ingrediente.item)}`}
                valor={precosFixados.get(ingrediente.item)}
                onAplicar={(valor) => onExcecao('px', ingrediente.item, valor)}
              />
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Venda">
        <PrecoEditavel
          rotulo={`Fixar preço de venda de ${nomeItem(row.outputItem)}`}
          valor={precoDeVendaFixado}
          onAplicar={(valor) => onExcecao('sx', row.outputItem, valor)}
        />
        <table className="w-full text-xs">
          <thead className="text-[0.6875rem] uppercase tracking-wide text-foreground-subtle">
            <tr>
              <th className="py-1 text-left font-medium">Cidade</th>
              <th className="py-1 text-right font-medium">Ordem de venda</th>
              <th className="py-1 text-right font-medium">Venda imediata</th>
            </tr>
          </thead>
          <tbody>
            {precoPorCidade.map((preco) => (
              <tr
                key={preco.locationId}
                className={
                  preco.locationId === row.locationId ? 'font-semibold text-primary' : ''
                }
              >
                <td className="py-0.5">{locationName(preco.locationId)}</td>
                <td className="py-0.5 text-right tabular-nums">
                  {preco.sell ? formatSilver(preco.sell) : TRACO}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {preco.buy ? formatSilver(preco.buy) : TRACO}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>

      <Secao titulo="Cenários">
        <table className="w-full text-xs">
          <thead className="text-[0.6875rem] uppercase tracking-wide text-foreground-subtle">
            <tr>
              <th className="py-1 text-left font-medium">Como</th>
              <th className="py-1 text-right font-medium">Custo</th>
              <th className="py-1 text-right font-medium">Recebe</th>
              <th className="py-1 text-right font-medium">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((cenario) => (
              <tr
                key={`${cenario.acquisitionMode}/${cenario.saleMode}`}
                className={cenario.best ? 'font-semibold text-foreground' : ''}
              >
                <td className="py-0.5">
                  {rotuloCenario(cenario)}
                  {cenario.best && (
                    <span className="ml-1 text-primary" title="É o que a tabela mostra">
                      ★
                    </span>
                  )}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {formatSilver(cenario.totalCost)}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {formatSilver(cenario.netRevenue)}
                </td>
                <td
                  className={`py-0.5 text-right tabular-nums ${
                    cenario.profit.isNegative() ? 'text-danger' : 'text-profit'
                  }`}
                >
                  {formatSilver(cenario.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[0.6875rem] leading-snug text-foreground-subtle">
          Ordem de compra e ordem de venda rendem mais, mas dependem de alguém aceitar — o
          número supõe que a fila anda.
        </p>
      </Secao>
    </div>
  )
}

/** Campo de preço fixo: aplica no Enter ou no botão, e some quando limpo. */
function PrecoEditavel({
  rotulo,
  valor,
  onAplicar,
}: {
  rotulo: string
  valor: string | undefined
  onAplicar: (valor: string | null) => void
}) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  const atual = rascunho ?? valor ?? ''

  const aplicar = () => {
    onAplicar(atual.trim() === '' ? null : atual.trim())
    setRascunho(null)
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-label={rotulo}
        value={atual}
        placeholder="preço na mão"
        onChange={(event) => setRascunho(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') aplicar()
        }}
        className={`${filterControl} mt-0 h-8 tabular-nums`}
      />
      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={aplicar}>
        {valor ? 'Trocar' : 'Fixar'}
      </Button>
    </div>
  )
}
