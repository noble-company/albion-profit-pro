import { describe, expect, test } from 'vitest'

import { percentageToRate } from '@/lib/money'

import { RETORNOS_PADRAO, rendimentoPorCemRecursos } from './return-rates'

describe('taxas de retorno do jogo', () => {
  test('os quatro atalhos batem com os valores praticados', () => {
    // Derivados de `1 − 1/(1 + bônus)`, não digitados. O `36.7` é o que medimos dentro do
    // jogo (10× T2_FIBER devolveram 4 algodões); os outros três saem da mesma fórmula com o
    // bônus de foco (0,59) e o bônus de cidade (18% → 58%).
    expect(RETORNOS_PADRAO.map((r) => r.percent)).toEqual([
      '15.2',
      '36.7',
      '43.5',
      '53.9',
    ])
  })

  test('o atalho entra no cenário como decimal exato', () => {
    // Se um atalho gerasse `0.36700000000000005`, ele reintroduziria o `E01` pela porta dos
    // fundos — o mesmo bug que a task 3.6/01 corrigiu na digitação.
    expect(RETORNOS_PADRAO.map((r) => percentageToRate(r.percent))).toEqual([
      '0.152',
      '0.367',
      '0.435',
      '0.539',
    ])
  })
})

describe('rendimento anunciado na barra', () => {
  test('100 recursos com 15,2% rendem ~118 itens', () => {
    expect(rendimentoPorCemRecursos('0.152')).toBe('118')
  })

  test('taxa de 100% não divide por zero — devolve ausência', () => {
    // Digitar `100` no campo de retorno derrubaria a tela: `decimal.js` lança na divisão por
    // zero, e isso acontece durante o render.
    expect(rendimentoPorCemRecursos('1')).toBeNull()
    expect(rendimentoPorCemRecursos('1.5')).toBeNull()
    expect(rendimentoPorCemRecursos('0')).toBeNull()
  })
})
