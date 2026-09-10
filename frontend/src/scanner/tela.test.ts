import { describe, expect, test } from 'vitest'

import type { Cidade } from '@/lib/locations'

import { cidadesDeVendaPara, estadoDaTela } from './tela'

/**
 * Task 4/12, segunda correção de desempenho.
 *
 * **Recalcular não é carregar.** A tela tratava os dois como a mesma coisa, e trocava a tabela
 * inteira pelo `Carregando` a cada recálculo. No craft o cálculo leva 2,7 s: a cada mudança de
 * quantidade a tabela sumia, a rolagem voltava ao topo e a linha aberta fechava — o que o
 * usuário lê como travamento, mesmo quando o número que chega no fim está certo.
 */

const PARADO = { dadosCarregando: false, calculando: false, temLinhas: true }

describe('estadoDaTela', () => {
  test('sem catálogo ou sem preço, não há o que mostrar', () => {
    expect(estadoDaTela({ ...PARADO, dadosCarregando: true })).toBe('carregando')
  })

  test('a PRIMEIRA conta do craft ainda esconde a tabela', () => {
    // Mostrar a tabela vazia aqui escreveria "0 linhas", que é uma afirmação sobre o mercado
    // — e não é: é uma conta que ainda não terminou.
    expect(estadoDaTela({ ...PARADO, calculando: true, temLinhas: false })).toBe(
      'carregando',
    )
  })

  test('recálculo COM linhas na tela mantém a tabela', () => {
    // O defeito. As linhas na tela são de um cenário anterior, mas continuam sendo a melhor
    // informação que existe até a conta nova chegar — melhor que tela em branco.
    expect(estadoDaTela({ ...PARADO, calculando: true })).toBe('recalculando')
  })

  test('parado é pronto', () => {
    expect(estadoDaTela(PARADO)).toBe('pronto')
  })
})

describe('cidadesDeVendaPara', () => {
  const CIDADES = [
    { id: '1002', name: 'Lymhurst', ids: ['1002', '1301'] },
    { id: '3003', name: 'Caerleon', ids: ['3003'] },
    { id: '4002', name: 'Fort Sterling', ids: ['4002'] },
    { id: '5003', name: 'Brecilien', ids: ['5003'] },
  ] as Cidade[]

  test('nenhuma marcada: todas entram na conta', () => {
    expect(cidadesDeVendaPara([], CIDADES)).toEqual(['1002', '3003', '4002', '5003'])
  })

  test('marcadas: só elas disputam a melhor cidade', () => {
    // Sem Caerleon e Brecilien, a linha não pode mostrar o lucro de vender lá.
    expect(cidadesDeVendaPara(['1002', '4002'], CIDADES)).toEqual(['1002', '4002'])
  })

  test('cidade que não existe mais na URL é ignorada', () => {
    expect(cidadesDeVendaPara(['9999', '4002'], CIDADES)).toEqual(['4002'])
  })

  test('se nenhuma marcada for válida, vale todas — e não uma tabela vazia sem explicação', () => {
    expect(cidadesDeVendaPara(['9999'], CIDADES)).toEqual(['1002', '3003', '4002', '5003'])
  })
})
