import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

/**
 * Guard textual (task 4/08, achado `X05`).
 *
 * O shell antigo prendia **tudo** em `max-w-7xl` — 1280 px num produto que é uma tabela densa
 * de 10+ colunas. Em monitor largo sobrava faixa vazia dos dois lados enquanto a tabela rolava
 * horizontalmente.
 *
 * É textual porque a regressão é invisível para teste de comportamento: reintroduzir a classe
 * não quebra nenhuma asserção de conteúdo, nenhum papel de acessibilidade e nenhuma rota — só
 * devolve silenciosamente o problema que a fase inteira existe para resolver. jsdom não faz
 * layout; não há como medir largura de verdade aqui.
 */

const SHELL = readFileSync('src/components/AppShell.tsx', 'utf8')

/**
 * Comentários fora antes de casar: a primeira versão deste guard falhou contra a própria
 * docstring do shell, que **cita** `max-w-7xl` para explicar o problema que a task removeu.
 * Um guard textual que proíbe falar sobre o defeito empurra a explicação para fora do código,
 * que é o oposto do que se quer.
 */
const CODIGO = SHELL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

test('o shell não impõe largura máxima ao conteúdo', () => {
  const largurasMaximas = CODIGO.match(
    /\bmax-w-(?:screen-)?(?:\d?xl|7xl|6xl|5xl|4xl|3xl)\b/g,
  )

  // `RequireRealm` é um cartão de aviso, não conteúdo de scanner — pode ter largura própria.
  const foraDoCartao = (largurasMaximas ?? []).filter(
    (classe) => classe !== 'max-w-lg',
  )

  expect(
    foraDoCartao,
    `largura máxima no shell devolve o X05: ${foraDoCartao.join(', ')}`,
  ).toEqual([])
})

test('a sidebar existe e o conteúdo ocupa o restante', () => {
  expect(CODIGO).toMatch(/<aside/)
  // `flex-1` no container do conteúdo é o que faz a tabela usar toda a largura sobrante.
  expect(CODIGO).toMatch(/flex-1/)
})
