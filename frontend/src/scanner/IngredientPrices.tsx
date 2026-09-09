import { X } from 'lucide-react'
import { useState } from 'react'

import { filterControl, filterLabel, FilterSelectField } from '@/components/filters'
import { Button } from '@/components/ui/button'
import type { Cidade } from '@/lib/locations'
import { formatSilver } from '@/lib/money'

import type { PricingPolicy } from './pricing'

/**
 * Exceções de preço por ingrediente (task 4/11.3).
 *
 * A base global responde "de onde vem o preço em geral"; isto responde "menos o desse aqui".
 * A exceção é **por item**, não por receita: quem fixa a fibra T5 em 250 está dizendo por
 * quanto compra fibra T5, e isso vale em toda receita que a use.
 *
 * Preço na mão vence cidade fixa, que vence a base global — a mesma ordem de `pricing.ts`.
 */
export function IngredientPrices({
  pricing,
  ingredientes,
  cidades,
  nomeItem,
  locationName,
  onExcecao,
}: {
  pricing: PricingPolicy
  /** ingredientes distintos do catálogo, já ordenados por nome */
  ingredientes: Array<{ value: string; label: string }>
  cidades: Cidade[]
  nomeItem: (unique: string) => string
  locationName: (id: string) => string
  onExcecao: (key: 'px' | 'pc', item: string, valor: string | null) => void
}) {
  const [item, setItem] = useState('')
  const [preco, setPreco] = useState('')
  const [cidade, setCidade] = useState('')

  const adicionar = () => {
    if (!item) return
    if (preco.trim()) onExcecao('px', item, preco.trim())
    else if (cidade) onExcecao('pc', item, cidade)
    setPreco('')
    setCidade('')
  }

  const excecoes = [
    ...[...pricing.manual].map(([chave, valor]) => ({
      chave,
      tipo: 'px' as const,
      texto: formatSilver(valor),
    })),
    ...[...pricing.byItemCity].map(([chave, valor]) => ({
      chave,
      tipo: 'pc' as const,
      texto: locationName(valor),
    })),
  ]

  return (
    <div className="space-y-2">
      <FilterSelectField
        label="Ingrediente"
        value={item}
        onChange={setItem}
        options={ingredientes}
        allLabel="escolha um item…"
      />

      {item && (
        <div className="space-y-2 rounded-lg border border-border-strong p-2">
          <label className={filterLabel}>
            Preço na mão
            <input
              type="text"
              inputMode="decimal"
              value={preco}
              placeholder="ex.: 250"
              onChange={(event) => setPreco(event.target.value)}
              className={`${filterControl} tabular-nums`}
            />
          </label>
          <FilterSelectField
            label="ou cotar em"
            value={cidade}
            onChange={setCidade}
            options={cidades.map((c) => ({ value: c.id, label: c.name }))}
            allLabel="—"
          />
          <Button size="sm" className="w-full" onClick={adicionar}>
            Fixar {nomeItem(item)}
          </Button>
        </div>
      )}

      {excecoes.length > 0 && (
        <ul className="space-y-1">
          {excecoes.map((excecao) => (
            <li
              key={`${excecao.tipo}:${excecao.chave}`}
              className="flex items-center gap-1 rounded-md bg-surface-raised px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">
                {nomeItem(excecao.chave)}
                <span className="ml-1 text-foreground-subtle">· {excecao.texto}</span>
              </span>
              <button
                type="button"
                aria-label={`Remover exceção de ${nomeItem(excecao.chave)}`}
                onClick={() => onExcecao(excecao.tipo, excecao.chave, null)}
                className="shrink-0 rounded p-0.5 text-foreground-subtle transition hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
