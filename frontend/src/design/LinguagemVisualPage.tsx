import {
  AlertTriangle,
  ArrowLeftRight,
  Clock,
  Inbox,
  Info,
  AlertCircle,
  Menu,
  TrendingUp,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/ui/states'

import { ConfidenceBadge } from './ConfidenceBadge'
import { DEMO_WARNINGS } from './confidence'
import { TabelaCarregando } from './TabelaCarregando'

/**
 * Página de referência da task 3.5/14 — rota /estilo, dev-only. Prova viva das decisões de
 * docs/13-linguagem-visual.md, não uma tela do produto. Nada aqui troca de rota ou persiste
 * estado; é ilustrativo.
 */

function Section({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 border-t border-border pt-8 first:border-0 first:pt-0">
      <h2 className="flex items-baseline gap-2 text-lg font-bold">
        <span className="text-primary">{number}</span> {title}
      </h2>
      {children}
    </section>
  )
}

const DEMO_ROWS = [
  {
    item: 'Espada do Adepto T4',
    compra: '1.240',
    venda: '1.980',
    qtd: 6,
    lucro: '3.812',
    roi: '18,4%',
  },
  {
    item: 'Armadura de Couro T5.1',
    compra: '4.510',
    venda: '6.220',
    qtd: 2,
    lucro: '2.740',
    roi: '12,1%',
  },
  {
    item: 'Fibra Refinada T6',
    compra: '890',
    venda: '1.150',
    qtd: 40,
    lucro: '9.360',
    roi: '24,7%',
  },
]

function DensityTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr>
            <th className="h-11 px-3 text-left font-semibold text-foreground-subtle">
              Item
            </th>
            <th className="h-11 px-3 text-right font-semibold text-foreground-subtle">
              Compra
            </th>
            <th className="h-11 px-3 text-right font-semibold text-foreground-subtle">
              Venda
            </th>
            <th className="h-11 px-3 text-right font-semibold text-foreground-subtle">
              Qtd.
            </th>
            <th className="h-11 px-3 text-right font-semibold text-foreground-subtle">
              Lucro
            </th>
            <th className="h-11 px-3 text-right font-semibold text-foreground-subtle">
              ROI
            </th>
          </tr>
        </thead>
        <tbody>
          {DEMO_ROWS.map((row) => (
            <tr key={row.item} className="border-t border-border">
              <td className="h-11 px-3 text-left font-medium">{row.item}</td>
              <td className="h-11 px-3 text-right tabular-nums">
                {row.compra}
              </td>
              <td className="h-11 px-3 text-right tabular-nums">{row.venda}</td>
              <td className="h-11 px-3 text-right tabular-nums">{row.qtd}</td>
              <td className="h-11 px-3 text-right font-semibold tabular-nums text-profit">
                {row.lucro}
              </td>
              <td className="h-11 px-3 text-right tabular-nums text-profit">
                {row.roi}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HierarchyExample() {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-bold">Espada do Adepto T4</span>
        <span className="text-base font-bold text-profit">3.812 silver</span>
        <span className="font-semibold text-profit">18,4% ROI</span>
        <span className="text-sm">Martlock → Caerleon</span>
      </div>
      <div className="mt-1 text-sm text-foreground-subtle">
        Compra 1.240 · Venda 1.980 · Qtd. 6
      </div>
      <div className="mt-1 text-xs text-foreground-subtle">
        Taxas 198 silver · Pedido de venda
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className="rounded bg-profit/10 px-2 py-1 text-profit">
          primário — decide em meio segundo
        </span>
        <span className="rounded bg-surface-raised px-2 py-1 text-foreground-subtle">
          secundário — lido em seguida
        </span>
        <span className="rounded bg-surface-raised px-2 py-1 text-foreground-subtle">
          terciário — contexto
        </span>
      </div>
    </div>
  )
}

const ICONS: { icon: typeof Inbox; label: string; use: string }[] = [
  { icon: Inbox, label: 'Inbox', use: 'Estado vazio / sem dado' },
  { icon: AlertTriangle, label: 'AlertTriangle', use: 'Erro' },
  { icon: Info, label: 'Info', use: 'Confiança — observação' },
  { icon: AlertCircle, label: 'AlertCircle', use: 'Confiança — atenção' },
  { icon: TrendingUp, label: 'TrendingUp', use: 'Lucro / tendência' },
  { icon: ArrowLeftRight, label: 'ArrowLeftRight', use: 'Fluxo compra/venda' },
  { icon: Menu, label: 'Menu', use: 'Navegação' },
  { icon: X, label: 'X', use: 'Fechar' },
  { icon: Clock, label: 'Clock', use: 'Frescor / tempo' },
]

function ShellMockup() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border"
    >
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <span className="font-bold text-primary">Albion Profit Pro</span>
        <nav className="hidden gap-4 text-sm sm:flex">
          <span className="flex items-center gap-1.5">
            <ArrowLeftRight className="size-4" /> Market Flip
          </span>
          <span className="flex items-center gap-1.5 text-foreground-subtle">
            <TrendingUp className="size-4" /> Refino
          </span>
        </nav>
        <div className="flex items-center gap-2">
          <Badge variant="outline">West</Badge>
          <Badge variant="outline">Escuro</Badge>
          <Menu className="size-5 sm:hidden" />
        </div>
      </div>
      <div className="bg-background p-4 text-sm text-foreground-subtle">
        conteúdo da tela…
      </div>
    </div>
  )
}

export function LinguagemVisualPage() {
  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          Referência viva · task 3.5/14
        </p>
        <h1 className="mt-2 text-2xl font-bold">Linguagem visual do produto</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground-muted">
          Prova viva das decisões em{' '}
          <code className="rounded bg-surface-raised px-1.5 py-0.5">
            docs/13-linguagem-visual.md
          </code>
          . Rota de desenvolvimento — não é uma tela do produto.
        </p>
      </div>

      <Section number="1" title="Densidade e leitura de tabela">
        <p className="text-sm text-foreground-muted">
          Linha de 44px (<code>h-11</code>), números à direita em{' '}
          <code>tabular-nums</code>, texto à esquerda.
        </p>
        <DensityTable />
      </Section>

      <Section number="2" title="Hierarquia da informação">
        <p className="text-sm text-foreground-muted">
          O que decide em meio segundo (item, lucro, ROI, rota) pesa mais que o
          que dá contexto (taxas, modo).
        </p>
        <HierarchyExample />
      </Section>

      <Section number="3" title="Vocabulário de estado">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground-subtle">
              Carregando (genérico)
            </p>
            <Carregando label="Carregando exemplo…" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground-subtle">
              Carregando (forma de tabela)
            </p>
            <TabelaCarregando columns={4} rows={3} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground-subtle">
              Vazio
            </p>
            <EstadoVazio title="Nenhuma oportunidade encontrada">
              A ausência de dados não representa lucro zero.
            </EstadoVazio>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground-subtle">
              Erro
            </p>
            <EstadoErro title="Não foi possível carregar" onRetry={() => {}} />
          </div>
        </div>
      </Section>

      <Section number="4" title="Sinalização de confiança">
        <p className="text-sm text-foreground-muted">
          Três níveis, não quatro badges soltas — observação, atenção, sem dado.
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_WARNINGS.map((warning) => (
            <ConfidenceBadge key={warning} warning={warning} />
          ))}
        </div>
      </Section>

      <Section number="5" title="Iconografia e microcópia">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ICONS.map(({ icon: Icon, label, use }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs"
            >
              <Icon
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <div className="font-mono">{label}</div>
                <div className="text-foreground-subtle">{use}</div>
              </div>
            </div>
          ))}
        </div>
        <blockquote className="rounded-lg border-l-4 border-primary bg-surface p-4 text-sm italic text-foreground-muted">
          "A ausência de dados não representa lucro zero." — o tom padrão pra
          qualquer mensagem de estado vazio ou de confiança baixa.
        </blockquote>
      </Section>

      <Section number="6" title="Layout do shell">
        <p className="text-sm text-foreground-muted">
          Maquete ilustrativa — implementada de verdade na task 3.5/24, não
          aqui.
        </p>
        <ShellMockup />
      </Section>
    </div>
  )
}
