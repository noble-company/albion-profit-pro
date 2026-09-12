/**
 * Altura da linha da tabela do scanner, em **rem** (pedido no uso, 2026-09-12).
 *
 * Nome em até 2 linhas com o grau embaixo não cabe nos 44 px (`h-11`) da §1 de
 * `docs/13-linguagem-visual.md`, que comportavam uma linha de texto só. E em rem, e não em px,
 * para acompanhar o Tamanho da interface: com px, a fonte cresceria e a linha não.
 *
 * Fora de `ScannerTable.tsx` pelo *fast refresh* — ver `tela.ts`.
 */
export const ALTURA_DA_LINHA_REM = 3.5

/** O `font-size` da raiz em px — 16 no tamanho normal, 27,2 a 170%. */
function fonteDaRaiz(): number {
  if (typeof document === 'undefined') return 16
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px : 16
}

/** O virtualizador fala em pixels; a linha, em rem. */
export function remEmPx(rem: number, raiz: number = fonteDaRaiz()): number {
  return rem * raiz
}
