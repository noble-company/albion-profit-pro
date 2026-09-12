import { describe, expect, test } from 'vitest'

import type { Cidade } from '@/lib/locations'
import { money } from '@/lib/money'

import type { PricingPolicy } from './pricing'
import {
  cidadesFiltradas,
  erroDaQuantidade,
  erroDoRetorno,
  estadoDaTela,
  hrefDaCalculadora,
  podeAnalisar,
  precosNaMaoPara,
} from './tela'

describe('Abrir na Calculadora (task 14)', () => {
  const doScanner = new URLSearchParams(
    [
      'cat=weapons/bow',
      'top=15',
      'q=espada',
      'qty=300',
      'return_rate=24',
      'station_fee=500',
      'sell_in=2004',
      'sell_in=1002',
      'buy_in=1002',
      'px=T4_PLANKS:100',
      'ing_price=min',
      'buy=immediate',
      'focus=true',
      'min_profit=5000',
      'min_roi=10',
      'min_volume=100',
      'no_volume=false',
      'unpriced=false',
      'profit_only=true',
      'max_age=6',
      'tier=4',
      'ench=1',
    ].join('&'),
  )

  test('leva o item e o cenário — é a mesma conta, noutra tela', () => {
    const url = new URL(hrefDaCalculadora(doScanner, 'T4_2H_BOW'), 'http://app')

    expect(url.pathname).toBe('/calculadora')
    expect(url.searchParams.get('item')).toBe('T4_2H_BOW')
    for (const chave of ['qty', 'return_rate', 'station_fee', 'px', 'ing_price', 'buy', 'focus', 'buy_in']) {
      expect(url.searchParams.getAll(chave), chave).toEqual(doScanner.getAll(chave))
    }
    expect(url.searchParams.getAll('sell_in')).toEqual(['2004', '1002'])
  })

  test('deixa de fora o que é da tabela: categoria, Top, busca e filtros de resultado', () => {
    const url = new URL(hrefDaCalculadora(doScanner, 'T4_2H_BOW'), 'http://app')

    for (const chave of [
      'cat',
      'top',
      'q',
      'min_profit',
      'min_roi',
      'min_volume',
      'no_volume',
      'unpriced',
      'profit_only',
      'max_age',
      'tier',
      'ench',
    ]) {
      expect(url.searchParams.has(chave), chave).toBe(false)
    }
  })
})

describe('erro no campo, não botão mudo (task 14, corrige E05)', () => {
  test('quantidade: inteiro a partir de 1; vazio é o padrão, não erro', () => {
    expect(erroDaQuantidade(null)).toBeNull()
    expect(erroDaQuantidade('')).toBeNull()
    expect(erroDaQuantidade('300')).toBeNull()
    for (const invalido of ['0', '-5', '1.5', 'abc']) {
      expect(erroDaQuantidade(invalido), invalido).toMatch(/inteiro a partir de 1/)
    }
  })

  test('retorno: de 0 a 99%, com vírgula ou ponto', () => {
    expect(erroDoRetorno(null)).toBeNull()
    expect(erroDoRetorno('24')).toBeNull()
    expect(erroDoRetorno('36,7')).toBeNull()
    expect(erroDoRetorno('53.9')).toBeNull()
    // `percentageToRate('abc')` dava 0 em silêncio: o jogador via retorno zero sem saber por quê.
    for (const invalido of ['150', '100', '-1', 'abc']) {
      expect(erroDoRetorno(invalido), invalido).toMatch(/entre 0 e 99/i)
    }
  })
})

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

describe('cidadesFiltradas', () => {
  const CIDADES = [
    { id: '1002', name: 'Lymhurst', ids: ['1002', '1301'] },
    { id: '3003', name: 'Caerleon', ids: ['3003'] },
    { id: '4002', name: 'Fort Sterling', ids: ['4002'] },
    { id: '5003', name: 'Brecilien', ids: ['5003'] },
  ] as Cidade[]

  test('nenhuma marcada: todas entram na conta', () => {
    expect(cidadesFiltradas([], CIDADES)).toEqual(['1002', '3003', '4002', '5003'])
  })

  test('marcadas: só elas disputam a melhor cidade', () => {
    // Sem Caerleon e Brecilien, a linha não pode mostrar o lucro de vender lá.
    expect(cidadesFiltradas(['1002', '4002'], CIDADES)).toEqual(['1002', '4002'])
  })

  test('cidade que não existe mais na URL é ignorada', () => {
    expect(cidadesFiltradas(['9999', '4002'], CIDADES)).toEqual(['4002'])
  })

  test('se nenhuma marcada for válida, vale todas — e não uma tabela vazia sem explicação', () => {
    expect(cidadesFiltradas(['9999'], CIDADES)).toEqual(['1002', '3003', '4002', '5003'])
  })
})

describe('precosNaMaoPara', () => {
  // O "Analisar com o livro real" levava só os ingredientes fixados. A venda fixada ficava de
  // fora, e a análise exata respondia com o livro de venda de verdade — uma pergunta diferente da
  // estimativa da linha, que usou o preço declarado.
  const POLITICA = {
    base: { kind: 'average' },
    manual: new Map([['T4_FIBER', '250']]),
    byItemCity: new Map(),
    manualSale: new Map([
      ['T4_CLOTH', '1500'],
      ['T5_CLOTH', '9999'],
    ]),
  } as PricingPolicy

  test('leva os ingredientes fixados E a venda fixada do item analisado', () => {
    expect(precosNaMaoPara(POLITICA, 'T4_CLOTH')).toEqual({
      T4_FIBER: { offer: '250', request: '250' },
      T4_CLOTH: { offer: '1500', request: '1500' },
    })
  })

  test('a venda fixada de OUTRO item não vai junto', () => {
    expect(precosNaMaoPara(POLITICA, 'T6_CLOTH')).toEqual({
      T4_FIBER: { offer: '250', request: '250' },
    })
  })
})

describe('podeAnalisar', () => {
  // "Analisar com o livro real" anda o livro de ordens, que é por mercado. A média não é um
  // mercado: o botão analisaria uma cidade qualquer e o número exato responderia outra pergunta.
  test('venda numa cidade, ou com preço fixo, pode ir para a análise exata', () => {
    expect(podeAnalisar({ profit: money('10'), saleBasis: 'city' })).toBe(true)
    expect(podeAnalisar({ profit: money('10'), saleBasis: 'manual' })).toBe(true)
  })

  test('venda pela média, não', () => {
    expect(podeAnalisar({ profit: money('10'), saleBasis: 'average' })).toBe(false)
  })

  test('sem lucro calculado não há o que comparar', () => {
    expect(podeAnalisar({ profit: null, saleBasis: 'city' })).toBe(false)
  })
})
