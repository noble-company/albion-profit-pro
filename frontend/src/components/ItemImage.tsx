import { Package } from 'lucide-react'
import { useState } from 'react'

/**
 * Arte do item, do serviço de render oficial da Sandbox Interactive.
 *
 * O identificador **é** o `unique_name` que já está no banco, sufixo de encantamento incluído —
 * nenhuma tabela de-para, nenhum asset hospedado por nós. Detalhes e medições em
 * `docs/06-fontes-de-dados-estaticos.md`.
 *
 * Dois modos de falha, tratados pelo mesmo `onError` porque não vale distinguir no cliente:
 * - **502** = render frio, transitório (a primeira renderização de uma variante pode levar
 *   17-24 s);
 * - **404** = o item não tem arte mesmo (itens internos/protótipo do dump).
 *
 * `loading="lazy"` não é detalhe: numa tabela de 5.523 receitas é a diferença entre ~44 MB e
 * ~200 KB, porque só a linha visível baixa.
 */

const RENDER_BASE = 'https://render.albiononline.com/v1/item'

/** Tamanhos aceitos pelo serviço; qualquer outro devolve 502. Medido. */
export type ItemImageSize = 32 | 64 | 96 | 128 | 217

export function ItemImage({
  uniqueName,
  quality,
  size = 64,
  className,
  alt = '',
}: {
  uniqueName: string
  quality?: number
  size?: ItemImageSize
  className?: string
  alt?: string
}) {
  const [failed, setFailed] = useState(false)

  const box = `inline-flex shrink-0 items-center justify-center ${className ?? 'size-8'}`

  if (failed) {
    return (
      <span className={box} aria-hidden={alt === '' ? true : undefined}>
        <Package className="size-4 text-foreground-subtle" aria-hidden="true" />
      </span>
    )
  }

  const query = new URLSearchParams({ size: String(size) })
  if (quality && quality > 1) query.set('quality', String(quality))

  return (
    <img
      src={`${RENDER_BASE}/${encodeURIComponent(uniqueName)}.png?${query.toString()}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={box}
    />
  )
}
