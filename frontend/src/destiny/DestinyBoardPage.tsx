import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { filterControl } from '@/components/filters'
import { Button } from '@/components/ui/button'
import {
  focusCostFor,
  refineNodeKey,
  refiningEfficiency,
  RAMOS_DE_REFINO,
  TIERS_DE_REFINO,
  type DestinyBoard,
} from '@/scanner/focus-efficiency'

import { useDestinyBoard, useSaveDestinyBoard } from './hooks'

/**
 * O Painel do Destino do jogador (task 4/17).
 *
 * **Não é uma réplica da árvore do jogo.** Uma grade captura exatamente o que a conta precisa —
 * o nível de cada nó — por uma fração do custo de desenhar aquela teia. O painel bonito não
 * paga; o número certo, sim.
 *
 * Cada célula mostra, embaixo do nível, **quanto do foco base aquele refino passa a custar**.
 * É o que transforma a tela de formulário em resposta: dá para ver o 100% virar 8% enquanto se
 * digita, e entender por que vale subir um nó.
 *
 * **Seções colapsáveis** porque o painel do jogo tem 44 ramos. Só Refino existe hoje: o resto
 * chega junto da tela de Craft (task 12), que é quando esses níveis passam a mudar algum
 * número. Pedir 200 campos que nenhuma conta consome seria trabalho jogado fora.
 *
 * Vale notar a diferença de forma, que a seção precisa acomodar: **refino é por tier** (grade
 * 5×5), **craft é por linha de item** — `Cajado Amaldiçoado` é um número só, com os tiers
 * desbloqueando por nível dentro do próprio nó.
 */

const RAMO_LABEL: Record<string, string> = {
  fiber: 'Fibra → Tecido',
  hide: 'Pelego → Couro',
  ore: 'Minério → Barra',
  wood: 'Madeira → Tábua',
  rock: 'Pedra → Bloco',
}

export function DestinyBoardPage() {
  const salvo = useDestinyBoard()
  const salvar = useSaveDestinyBoard()
  /** Rascunho local: digitar não dispara requisição, e o botão diz o que falta salvar. */
  const [rascunho, setRascunho] = useState<DestinyBoard | null>(null)
  const painel = rascunho ?? salvo

  const setNivel = (key: string, valor: string) => {
    const proximo = new Map(painel)
    const numero = Math.max(0, Math.min(100, Math.floor(Number(valor) || 0)))
    if (numero === 0) proximo.delete(key)
    else proximo.set(key, numero)
    setRascunho(proximo)
  }

  const sujo = rascunho !== null
  const chavesDeRefino = RAMOS_DE_REFINO.flatMap((ramo) =>
    TIERS_DE_REFINO.map((tier) => refineNodeKey(ramo, tier)),
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="shrink-0">
        <h1 className="text-2xl font-black tracking-tight">Painel do Destino</h1>
        <p className="mt-1 max-w-3xl text-sm text-foreground-muted">
          O nível de cada nó decide quanto <strong>foco</strong> você gasta. Cada nó dá um bônus
          pequeno para o ramo inteiro e um bônus grande para o próprio tier — é por isso que
          subir fibra T4 ajuda um pouco todo refino de fibra e muito o T4.
        </p>
        <p className="mt-2 text-xs text-foreground-subtle">
          Preencha só o ramo que você usa. Nó em branco é nível zero, e o scanner usa o custo de
          foco cheio. O painel é <strong>por personagem</strong>: se você alterna de personagem,
          os números aqui são de um só.
        </p>
      </header>

      <div className="flex shrink-0 items-center gap-3">
        <Button
          size="sm"
          disabled={!sujo || salvar.isPending}
          onClick={() => {
            salvar.mutate(painel, { onSuccess: () => setRascunho(null) })
          }}
        >
          {salvar.isPending ? 'Salvando…' : 'Salvar painel'}
        </Button>
        {sujo && !salvar.isPending && (
          <span className="text-xs text-foreground-subtle">
            Alterações ainda não salvas — o scanner só usa o que está salvo.
          </span>
        )}
        {salvar.isError && (
          <span className="text-xs text-danger">
            Não deu para salvar. O que você digitou continua na tela.
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        <Secao titulo="Refino" chaves={chavesDeRefino} painel={painel} inicial>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-foreground-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Ramo</th>
                {TIERS_DE_REFINO.map((tier) => (
                  <th key={tier} className="px-3 py-2 text-left font-semibold">
                    T{tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RAMOS_DE_REFINO.map((ramo) => (
                <tr key={ramo} className="border-t border-border/60">
                  <th className="px-3 py-2 text-left font-medium text-foreground">
                    {RAMO_LABEL[ramo] ?? ramo}
                  </th>
                  {TIERS_DE_REFINO.map((tier) => {
                    const key = refineNodeKey(ramo, tier)
                    const restante = focusCostFor(100, refiningEfficiency(ramo, tier, painel))
                    return (
                      <td key={tier} className="px-3 py-2 align-top">
                        <input
                          id={key}
                          type="text"
                          inputMode="numeric"
                          aria-label={`${RAMO_LABEL[ramo] ?? ramo} T${tier}`}
                          value={painel.get(key) ?? ''}
                          placeholder="0"
                          onChange={(event) => setNivel(key, event.target.value)}
                          className={`${filterControl} mt-0 w-20 tabular-nums`}
                        />
                        {/* O efeito, ao lado da causa: é isso que mostra por que subir o nó. */}
                        <span className="mt-1 block text-2xs tabular-nums text-foreground-subtle">
                          {restante < 100 ? `${restante.toFixed(1)}% do foco` : 'foco cheio'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>

        <p className="px-1 text-xs text-foreground-subtle">
          Craft, comida e poção usam a mesma fórmula e entram aqui como seções próprias junto da
          tela de Craft — é quando esses níveis passam a mudar algum número.
        </p>
      </div>
    </div>
  )
}

/**
 * Uma categoria do painel. Fechada, ela ainda responde "eu já mexi aqui?" pelo contador — senão
 * o jogador abre uma por uma para descobrir onde parou.
 */
function Secao({
  titulo,
  chaves,
  painel,
  inicial = false,
  children,
}: {
  titulo: string
  chaves: string[]
  painel: DestinyBoard
  inicial?: boolean
  children: ReactNode
}) {
  const [aberta, setAberta] = useState(inicial)
  const preenchidos = chaves.filter((chave) => (painel.get(chave) ?? 0) > 0).length

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((valor) => !valor)}
        className="flex w-full items-center gap-2 px-3 py-3 text-left transition hover:bg-surface-raised"
      >
        <ChevronRight
          className={`size-4 shrink-0 text-foreground-subtle transition-transform ${
            aberta ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <span className="font-semibold text-foreground">{titulo}</span>
        <span className="ml-auto text-xs tabular-nums text-foreground-subtle">
          {preenchidos} de {chaves.length} preenchidos
        </span>
      </button>

      {aberta && <div className="border-t border-border px-1 pb-2">{children}</div>}
    </section>
  )
}
