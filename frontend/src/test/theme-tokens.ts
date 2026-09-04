import { readFileSync } from 'node:fs'

// Helper compartilhado por contrast.test.ts e theme.test.tsx: os dois precisam ler os blocos
// de tokens reais de src/index.css (fonte única), não uma cópia mantida à mão no teste.

/** Recorta o conteúdo de uma regra CSS top-level (sem chaves aninhadas dentro dela). */
export function extractBlock(source: string, selectorPattern: string): string {
  const match = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 'm').exec(
    source,
  )
  if (!match?.[1]) {
    throw new Error(
      `bloco não encontrado para /${selectorPattern}/ em index.css`,
    )
  }
  return match[1]
}

/** Extrai as primitivas `--nome: <cor>;` de um bloco (ignora as linhas var(--...)). */
export function readTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  const re = /--([a-z-]+):\s*(oklch\([^;]+\)|#[0-9a-fA-F]+)\s*;/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const [, name, value] = match
    if (name && value) tokens[name] = value.trim()
  }
  return tokens
}

/** Os dois blocos de tema (:root e :root[data-theme='light']) de src/index.css, crus. */
export function readThemeBlocks(cssPath = 'src/index.css') {
  const css = readFileSync(cssPath, 'utf8')
  return {
    dark: extractBlock(css, ':root(?!\\[)'),
    light: extractBlock(css, ':root\\[data-theme=[\'"]light[\'"]\\]'),
  }
}
