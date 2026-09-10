import { ItemImage } from '@/components/ItemImage'
import { formatQuantity } from '@/lib/money'

import type { ScannerIngredient } from './engine'
import { idadeDaCotacao, TRACO } from './tela'

/**
 * Um ingrediente na coluna Compra (task 4/20): preço unitário, quantidade e de quando é o preço.
 *
 * Arquivo próprio de propósito: declarado dentro de `columns.tsx`, que exporta funções, ele
 * quebrava o *fast refresh* do Vite (`react-refresh/only-export-components`) — cada edição
 * recarregaria a tela inteira.
 */
export function CardDeCompra({
  ingrediente,
  nomeItem,
  agora,
  largura,
}: {
  ingrediente: ScannerIngredient
  nomeItem: (uniqueName: string) => string
  agora: Date
  /** largura fixa: as linhas da tabela são grids independentes e precisam alinhar */
  largura: string
}) {
  const quantidade = ingrediente.purchaseQuantity.toLocaleString('pt-BR')
  const idade =
    ingrediente.unitPrice === null
      ? null
      : (idadeDaCotacao(ingrediente.observedAt, agora) ?? 'preço fixo')

  return (
    // O nome não cabe no card; ele fica no título, para o hover — o ícone já identifica.
    <li
      title={`${nomeItem(ingrediente.item)} ×${quantidade}`}
      className="flex min-w-0 items-center gap-1"
      style={{ width: largura }}
    >
      <ItemImage uniqueName={ingrediente.item} size={64} className="size-5 shrink-0" />
      <span className="flex min-w-0 flex-col text-[0.6875rem] leading-tight">
        <span className="tabular-nums text-foreground">
          {ingrediente.unitPrice ? formatQuantity(ingrediente.unitPrice, 0) : TRACO}
        </span>
        <span className="truncate text-foreground-subtle">
          {/* A quantidade primeiro e nunca cortada: é o número que manda comprar. */}
          <span className="tabular-nums">×{quantidade}</span>
          {idade && (
            <>
              <span aria-hidden="true"> · </span>
              <span>{idade}</span>
            </>
          )}
        </span>
      </span>
    </li>
  )
}
