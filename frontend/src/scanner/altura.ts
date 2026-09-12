/**
 * Medidas da tabela do scanner que acompanham o Tamanho do conteúdo (pedidos no uso, 2026-09-12).
 *
 * Nome em até 2 linhas com o grau embaixo não cabe nos 44 px (`h-11`) da §1 de
 * `docs/13-linguagem-visual.md`, que comportavam uma linha de texto só. E nenhuma medida é um rem
 * fixo: o centro tem `--escala` (ver `.escala-do-conteudo` em `index.css`), e uma largura ou altura
 * que não passa por ela ficaria do tamanho de sempre no meio da tabela ampliada.
 *
 * Fora de `ScannerTable.tsx` pelo *fast refresh* — ver `tela.ts`.
 */
export const ALTURA_DA_LINHA_REM = 3.5

/** Uma medida em rem que cresce com o Tamanho do conteúdo, para `style` e grid. */
export function emEscala(rem: number): string {
  return `calc(${rem}rem * var(--escala, 1))`
}

/** O `font-size` da raiz em px — 16, a não ser que o navegador tenha outra fonte padrão. */
function fonteDaRaiz(): number {
  if (typeof document === 'undefined') return 16
  const px = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(px) && px > 0 ? px : 16
}

/** A altura da linha em px, para o virtualizador, que não lê CSS. `escala` em %, como o seletor. */
export function alturaDaLinhaPx(escala: number, raiz: number = fonteDaRaiz()): number {
  return ALTURA_DA_LINHA_REM * raiz * (escala / 100)
}
