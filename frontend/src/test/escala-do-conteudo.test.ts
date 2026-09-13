import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

/**
 * Tamanho do conteúdo central (pedido no uso, 2026-09-12: "aumenta só o conteúdo da tabela, não
 * de tudo").
 *
 * O Tailwind v4 escreve espaçamento e texto como `calc(var(--spacing) * n)` e `var(--text-sm)`.
 * Redefinir essas variáveis no `main` escala tudo o que está dentro dele — e só isso. O que não
 * passa por variável (um `text-[0.6875rem]` escrito à mão) ficaria do tamanho de sempre no meio da
 * tabela ampliada: é o que este guard pega.
 */

test('o CSS redefine espaçamento e texto dentro de escala-do-conteudo', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const bloco = css.match(/@utility escala-do-conteudo\s*\{([^}]*)\}/)?.[1] ?? ''

  for (const variavel of ['--spacing', '--text-2xs', '--text-xs', '--text-sm', '--text-base', '--text-2xl']) {
    expect(bloco, `falta ${variavel}`).toMatch(new RegExp(`${variavel}:\\s*calc\\([^;]*var\\(--escala`))
  }
  expect(bloco).toMatch(/font-size:\s*calc\([^;]*var\(--escala/)
})

const sources: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

test('nenhum tamanho de texto escrito à mão em rem, que não acompanharia o Tamanho', () => {
  const ofensores = Object.entries(sources)
    .filter(([caminho]) => !/\.test\.tsx?$/.test(caminho))
    .filter(([, codigo]) => /text-\[\d+(\.\d+)?rem\]/.test(codigo))
    .map(([caminho]) => caminho)

  expect(ofensores).toEqual([])
})
