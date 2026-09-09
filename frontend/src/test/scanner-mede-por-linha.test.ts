import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

/**
 * Guard textual (task 4/11.5).
 *
 * A altura medida de uma linha expandida tem que ser guardada pela **identidade da linha**, não
 * pela posição dela. `@tanstack/react-virtual` usa por padrão o índice como chave
 * (`defaultKeyExtractor = (index) => index`), e enquanto a lista não muda os dois são a mesma
 * coisa — por isso o defeito não aparece "sem filtro".
 *
 * Ele aparece quando a lista se reordena **com uma linha aberta**, o que acontece sozinho:
 * fixar um preço muda o lucro, e a tabela ordena por lucro. A linha aberta vai para outra
 * posição levando o painel junto; a posição nova diz "44 px"; as linhas seguintes sobem; o
 * painel fica por baixo delas. Foi o que o usuário viu ao fixar um preço de venda com filtros
 * ligados.
 *
 * É textual porque a regressão é invisível para teste de comportamento aqui: jsdom não faz
 * layout, o virtualizador não renderiza linha nenhuma (`W4`) e nenhuma asserção de conteúdo
 * muda ao remover a opção. O que se pode travar é a configuração.
 */

const TABELA = readFileSync('src/scanner/ScannerTable.tsx', 'utf8')
const CODIGO = TABELA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * A opção precisa chegar ao `useVirtualizer`. A primeira versão deste guard casava com o
 * arquivo inteiro e **passava mesmo depois de eu remover a opção da chamada** — a definição do
 * `getItemKey` logo acima bastava para o regex. Guard que passa fácil demais está medindo outra
 * coisa (`W3`).
 */
const CHAMADA = CODIGO.slice(
  CODIGO.indexOf('useVirtualizer({'),
  CODIGO.indexOf('})', CODIGO.indexOf('useVirtualizer({')),
)

test('a medição da linha é chaveada pela linha, não pelo índice', () => {
  expect(CHAMADA, 'a chamada a useVirtualizer não foi encontrada').not.toBe('')
  expect(
    CHAMADA,
    'sem `getItemKey`, a altura da linha expandida fica na posição antiga quando a lista reordena',
  ).toMatch(/getItemKey/)

  // E a chave tem que ser a mesma que o React usa na lista — duas identidades diferentes para a
  // mesma linha reintroduzem o problema por outro caminho.
  expect(CODIGO).toMatch(/rowKey\(row\)/)
})

test('a linha expandida é medida, não estimada', () => {
  // `data-index` é o que liga o nó ao índice na hora de medir; sem ele o virtualizador não sabe
  // de quem é a altura que acabou de mudar.
  expect(CODIGO).toMatch(/data-index=/)
  expect(CODIGO).toMatch(/measureElement/)
})
