import { useState, type ReactNode } from 'react'

import { filterControl } from '@/components/filters'
import { Button } from '@/components/ui/button'
import { formatarIdade } from '@/lib/formatters'
import type { Cidade } from '@/lib/locations'
import { formatQuantity, formatSilver, type Money } from '@/lib/money'

import type { ScannerDetail } from './engine'
import type { Origem } from './pricing'
import { formatarVolume } from './vendas'

/**
 * O que a linha esconde (task 4/11.4, reorganizado na 4/20, origem por item na 4/24).
 *
 * A tabela dá um número e pede confiança. Aqui ela mostra o serviço: de onde veio cada preço,
 * quanto de cada taxa, o que os outros três cenários dariam, e por quanto no mínimo dá para
 * vender sem perder dinheiro. É também onde o jogador **discorda** — escolhendo de onde vem cada
 * preço, ou fixando o que ele realmente pratica.
 *
 * Tudo é derivado de `explainRow`, que roda o mesmo `evaluate` da tabela. Se este painel fosse
 * uma segunda conta, ele poderia contradizer a linha que explica.
 *
 * **Três colunas por assunto** — o dinheiro, o que comprar, onde vender —, cada uma empilhando
 * as suas seções.
 */

const TRACO = '—'

/** Modo curto na tabela de cenários — as colunas já dizem se é a compra ou a venda. */
const MODO: Record<string, string> = {
  immediate: 'imediata',
  buy_order: 'ordem',
  sell_order: 'ordem',
}

type Lado = 'compra' | 'venda'

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

/**
 * Idade de uma observação. Preço na mão não tem idade — e dizer "agora" seria mentira. Data
 * impossível vira traço: `new Date(Infinity).toISOString()` lança, e lançar no render derruba a
 * tela inteira (task 11).
 */
function idade(observedAt: number | null, agora: Date): string {
  if (observedAt === null) return 'sem data'
  if (!Number.isFinite(observedAt)) return TRACO
  return formatarIdade(new Date(observedAt * 1000).toISOString(), agora)
}

function numero(valor: Money | null) {
  return valor ? formatQuantity(valor, 0) : TRACO
}

export interface PrecoDaCidade {
  locationId: string
  sell: Money | null
  buy: Money | null
  /** unidades vendidas por dia, média de 7 dias (task 23); ausente ou nulo = sem histórico */
  unitsPerDay?: Money | null
}

export function RowDetails({
  detail,
  nomeItem,
  locationName,
  precoPorCidade,
  cidades,
  origemDe,
  padraoDe,
  onOrigem,
  analise,
  readOnly = false,
  agora = new Date(),
}: {
  detail: ScannerDetail
  nomeItem: (uniqueName: string) => string
  locationName: (id: string) => string
  /** preço da saída em cada cidade, para responder "e se eu vendesse em outro lugar?" */
  precoPorCidade: PrecoDaCidade[]
  /** as cidades que os seletores de origem oferecem */
  cidades: Cidade[]
  /** a escolha atual de um item, num lado */
  origemDe: (lado: Lado, item: string) => Origem
  /** o padrão da barra naquele lado (task 25) — o que o seletor mostra num item sem escolha */
  padraoDe: (lado: Lado) => Origem
  onOrigem: (lado: Lado, item: string, origem: Origem) => void
  /** a ponte para o número exato; ausente = o painel só mostra a estimativa */
  analise?: ReactNode
  /** Oculta os controles de origem quando o cenário é somente leitura. */
  readOnly?: boolean
  agora?: Date
}) {
  const { row, breakdown, scenarios, ingredients } = detail
  const origemDaVenda = origemDe('venda', row.outputItem)

  const rotuloDaVenda =
    row.saleBasis === 'average'
      ? 'Venda pela média'
      : row.saleBasis === 'manual'
        ? 'Venda com preço fixo'
        : origemDaVenda.tipo === 'cidade'
          ? 'Venda escolhida'
          : 'Melhor venda'

  const valorDaVenda =
    row.saleUnitPrice === null
      ? TRACO
      : row.saleBasis === 'city'
        ? `${formatSilver(row.saleUnitPrice)} em ${locationName(row.locationId)}`
        : formatSilver(row.saleUnitPrice)

  return (
    // Colunas pela largura do PAINEL (container query), não da janela. Na linha do scanner o
    // painel tem a largura da tabela e cabe em três; no centro da Calculadora, espremido entre as
    // barras, `lg:grid-cols-3` empurrava a página inteira para o lado (pedido no uso, 2026-09-12).
    <div className="@container">
    <div className="grid gap-x-8 gap-y-5 text-sm @3xl:grid-cols-2 @6xl:grid-cols-3">
      {/* ---------------- o dinheiro ---------------- */}
      <div className="min-w-0 space-y-5">
        <Secao titulo="Extrato">
          <Linha rotulo="Ingredientes" valor={formatSilver(breakdown.ingredientCost)} />
          <Linha
            rotulo="Taxa de montagem (compra)"
            valor={formatSilver(breakdown.acquisitionSetupFee)}
          />
          <Linha rotulo="Prata da receita" valor={formatSilver(breakdown.recipeSilver)} />
          <Linha rotulo="Estação" valor={formatSilver(breakdown.stationCost)} />
          <Linha rotulo="Custo total" valor={formatSilver(breakdown.totalCost)} forte />

          <div className="pt-1" />
          <Linha rotulo="Venda bruta" valor={formatSilver(breakdown.grossRevenue)} />
          <Linha rotulo="Imposto de venda" valor={`− ${formatSilver(breakdown.salesTax)}`} />
          <Linha
            rotulo="Taxa de montagem (venda)"
            valor={`− ${formatSilver(breakdown.saleSetupFee)}`}
          />
          <Linha rotulo="Recebe líquido" valor={formatSilver(breakdown.netRevenue)} forte />

          {/* O extrato fecha no número que a linha mostra: sem isto a conta parava em "recebe
              líquido" e o jogador tinha que subtrair de cabeça. */}
          {row.profit && (
            <div
              className={`flex items-baseline justify-between gap-3 border-t border-border pt-1 text-sm font-semibold ${
                row.profit.isNegative() ? 'text-danger' : 'text-profit'
              }`}
            >
              <span>Lucro</span>
              <span className="tabular-nums">{formatSilver(row.profit)}</span>
            </div>
          )}
        </Secao>

        <Secao titulo="Resultado">
          <Linha
            rotulo="Custo por item"
            valor={row.averageUnitCost ? formatSilver(row.averageUnitCost) : TRACO}
          />
          <Linha
            rotulo="Preço de equilíbrio (por item)"
            valor={
              detail.breakEvenUnitPrice ? formatSilver(detail.breakEvenUnitPrice) : TRACO
            }
          />
          <p className="text-2xs leading-snug text-foreground-subtle">
            Abaixo disso a venda não paga o custo mais as taxas. Aproximado: no jogo cada cobrança
            arredonda para cima.
          </p>
          <Linha
            rotulo="Lucro por kg"
            valor={row.profitPerWeight ? formatQuantity(row.profitPerWeight, 0) : TRACO}
          />
          <Linha
            rotulo="Lucro por foco"
            valor={row.profitPerFocus ? formatQuantity(row.profitPerFocus, 1) : TRACO}
          />
          <Linha rotulo="Dado mais velho" valor={idade(row.oldestObservedAt, agora)} />
        </Secao>

        {analise}
      </div>

      {/* ---------------- o que comprar ---------------- */}
      <div className="min-w-0 space-y-5">
        <Secao titulo="Compra">
          <ul className="space-y-3">
            {ingredients.map((ingrediente) => {
              const origem = origemDe('compra', ingrediente.item)
              return (
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
                  <div className="flex items-baseline justify-between gap-2 text-2xs text-foreground-subtle">
                    <span className="min-w-0 truncate">
                      {/* A cidade, quando o preço veio de uma só: o menor preço sem dizer onde
                          não serve para ir buscar (task 25). */}
                      {ingrediente.locationId && `${locationName(ingrediente.locationId)} · `}
                      {ingrediente.source ?? 'sem cotação'} ·{' '}
                      {idade(ingrediente.observedAt, agora)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {ingrediente.subtotal ? formatSilver(ingrediente.subtotal) : TRACO}
                    </span>
                  </div>
                  {!readOnly && <OrigemDoPreco
                    // A chave pela escolha: quando a URL muda a origem, o seletor recomeça do
                    // estado novo em vez de carregar o rascunho da escolha anterior.
                    key={`${ingrediente.item}:${JSON.stringify(origem)}:${JSON.stringify(padraoDe('compra'))}`}
                    lado="compra"
                    rotulo={`de ${nomeItem(ingrediente.item)}`}
                    origem={origem}
                    padrao={padraoDe('compra')}
                    cidades={cidades}
                    onOrigem={(escolha) => onOrigem('compra', ingrediente.item, escolha)}
                  />}
                </li>
              )
            })}
          </ul>
        </Secao>
      </div>

      {/* ---------------- onde vender ---------------- */}
      <div className="min-w-0 space-y-5">
        <Secao titulo="Venda">
          <div className="space-y-0.5">
            <Linha rotulo={rotuloDaVenda} valor={valorDaVenda} />
            {row.saleUnitPrice && (
              <p className="text-right text-2xs text-foreground-subtle">
                {row.saleSource ?? 'sem cotação'} ·{' '}
                {row.saleObservedAt === null ? 'preço fixo' : idade(row.saleObservedAt, agora)}
              </p>
            )}
          </div>

          {/* Junto da venda, onde o olho está — e fora do bloco que só aparece com cotação:
              escolher a origem de um item SEM mercado é quando o jogador mais precisa dela. */}
          {!readOnly && <OrigemDoPreco
            key={`${row.outputItem}:${JSON.stringify(origemDaVenda)}:${JSON.stringify(padraoDe('venda'))}`}
            lado="venda"
            rotulo={`de venda de ${nomeItem(row.outputItem)}`}
            origem={origemDaVenda}
            padrao={padraoDe('venda')}
            cidades={cidades}
            onOrigem={(escolha) => onOrigem('venda', row.outputItem, escolha)}
          />}

          {/* Rola aqui dentro: a tabela não quebra linha, e sem isto empurrava a tela inteira para
              o lado quando o painel era estreito (Calculadora, pedido no uso). */}
          <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead className="text-2xs uppercase tracking-wide text-foreground-subtle">
              <tr>
                <th className="py-1 text-left font-medium">Cidade</th>
                <th className="py-1 text-right font-medium">Ordem de venda</th>
                <th className="py-1 text-right font-medium">Venda imediata</th>
                <th className="py-1 text-right font-medium">Vende/dia</th>
              </tr>
            </thead>
            <tbody>
              {precoPorCidade.map((preco) => (
                <tr
                  key={preco.locationId}
                  // Destaca a cidade da linha só quando ela é de fato a cidade da venda. Na média
                  // e no preço fixo a linha foi avaliada numa cidade qualquer.
                  className={
                    row.saleBasis === 'city' && preco.locationId === row.locationId
                      ? 'font-semibold text-primary'
                      : ''
                  }
                >
                  <td className="py-0.5 pr-2">{locationName(preco.locationId)}</td>
                  <td className="py-0.5 text-right tabular-nums">{numero(preco.sell)}</td>
                  <td className="py-0.5 text-right tabular-nums">{numero(preco.buy)}</td>
                  {/* O preço alto de uma cidade que vende 3 por dia não escoa o lote (task 23). */}
                  <td className="py-0.5 text-right tabular-nums">
                    {preco.unitsPerDay ? formatarVolume(preco.unitsPerDay) : TRACO}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Secao>

        <Secao titulo="Cenários">
          <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead className="text-2xs uppercase tracking-wide text-foreground-subtle">
              <tr>
                <th className="py-1 text-left font-medium">Compra</th>
                <th className="py-1 text-left font-medium">Venda</th>
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
                  <td className="py-0.5 pr-2">
                    {MODO[cenario.acquisitionMode] ?? cenario.acquisitionMode}
                  </td>
                  <td className="py-0.5 pr-2">
                    {MODO[cenario.saleMode] ?? cenario.saleMode}
                    {cenario.best && (
                      <span className="ml-1 text-primary" title="É o que a tabela mostra">
                        ★
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">
                    {formatQuantity(cenario.totalCost, 0)}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">
                    {formatQuantity(cenario.netRevenue, 0)}
                  </td>
                  <td
                    className={`py-0.5 text-right tabular-nums ${
                      cenario.profit.isNegative() ? 'text-danger' : 'text-profit'
                    }`}
                  >
                    {formatQuantity(cenario.profit, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="text-2xs leading-snug text-foreground-subtle">
            Valores em silver. Ordem de compra e de venda rendem mais, mas dependem de alguém
            aceitar — o número supõe que a fila anda.
          </p>
        </Secao>
      </div>
    </div>
    </div>
  )
}

/** O `value` de uma origem no `<select>`. */
function valorDaOrigem(origem: Origem): string {
  switch (origem.tipo) {
    case 'cidade':
      return `cidade:${origem.locationId}`
    default:
      return origem.tipo
  }
}

function origemDoValor(valor: string): Origem {
  if (valor.startsWith('cidade:')) {
    return { tipo: 'cidade', locationId: valor.slice('cidade:'.length) }
  }
  if (valor === 'media' || valor === 'menor' || valor === 'melhor') return { tipo: valor }
  return { tipo: 'padrao' }
}

/**
 * De onde vem o preço de um item, num lado (task 24): a média, o menor preço ou a melhor cidade,
 * uma cidade específica, ou um preço fixo.
 *
 * **A opção igual à da barra é o padrão** (task 25): item sem escolha mostra ela, e escolher ela
 * não grava nada. Gravar contaria um "item com preço próprio" idêntico à barra — que deixaria de
 * acompanhar a barra quando ela mudasse.
 *
 * "Fixar preço…" abre o campo; aplicar vazio volta ao padrão — apagar o número é "volta a usar o
 * mercado", nunca "vale zero". Preço já fixado aparece aberto: fechado, esconderia justamente o
 * que o jogador declarou.
 */
function OrigemDoPreco({
  lado,
  rotulo,
  origem,
  padrao,
  cidades,
  onOrigem,
}: {
  lado: Lado
  /** complemento dos rótulos acessíveis: "de T4_FIBER", "de venda de T4_CLOTH" */
  rotulo: string
  origem: Origem
  /** o padrão da barra, na mesma língua de `origem` */
  padrao: Origem
  cidades: Cidade[]
  onOrigem: (origem: Origem) => void
}) {
  const [fixando, setFixando] = useState(origem.tipo === 'fixo')
  const [rascunho, setRascunho] = useState<string | null>(null)
  const atual = rascunho ?? (origem.tipo === 'fixo' ? origem.valor : '')

  const valorAtual = fixando
    ? 'fixo'
    : valorDaOrigem(origem.tipo === 'padrao' ? padrao : origem)

  const escolher = (valor: string) => {
    if (valor === 'fixo') {
      setFixando(true)
      return
    }
    setFixando(false)
    setRascunho(null)
    const escolhida = origemDoValor(valor)
    onOrigem(valorDaOrigem(escolhida) === valorDaOrigem(padrao) ? { tipo: 'padrao' } : escolhida)
  }

  const aplicar = () => {
    const limpo = atual.trim()
    setRascunho(null)
    if (limpo === '') {
      setFixando(false)
      onOrigem({ tipo: 'padrao' })
    } else {
      onOrigem({ tipo: 'fixo', valor: limpo })
    }
  }

  return (
    <div className="space-y-1">
      <select
        aria-label={`Origem do preço ${rotulo}`}
        value={valorAtual}
        onChange={(event) => escolher(event.target.value)}
        className={`${filterControl} mt-0 h-7 py-0 text-xs`}
      >
        {lado === 'venda' ? (
          <>
            <option value="melhor">Melhor cidade</option>
            <option value="media">Média das cidades de venda</option>
          </>
        ) : (
          <>
            <option value="media">Média das cidades de compra</option>
            <option value="menor">Menor preço das cidades de compra</option>
          </>
        )}
        {cidades.map((cidade) => (
          <option key={cidade.id} value={`cidade:${cidade.id}`}>
            {cidade.name}
          </option>
        ))}
        <option value="fixo">Fixar preço…</option>
      </select>

      {fixando && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Fixar preço ${rotulo}`}
            value={atual}
            placeholder="preço na mão"
            onChange={(event) => setRascunho(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') aplicar()
            }}
            className={`${filterControl} mt-0 h-8 tabular-nums`}
          />
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={aplicar}>
            {origem.tipo === 'fixo' ? 'Trocar' : 'Fixar'}
          </Button>
        </div>
      )}
    </div>
  )
}
