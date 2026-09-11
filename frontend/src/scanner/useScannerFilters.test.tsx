import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test } from 'vitest'

import { useScannerFilters } from './useScannerFilters'

/**
 * Task 4/09. A URL é o estado: um filtro interessante vira link, e o F5 não perde o que a
 * pessoa montou. Nada disso dispara requisição — tudo alimenta o predicado ou o engine.
 */

function wrapper(url: string) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  }
}

const render = (url = '/refino') =>
  renderHook(() => useScannerFilters(), { wrapper: wrapper(url) })

describe('leitura da URL', () => {
  test('sem parâmetros, os padrões do produto valem', () => {
    const { result } = render()

    // O padrão que inverte X01/X02: mostrar tudo.
    expect(result.current.filters.showUnpriced).toBe(true)
    expect(result.current.filters.tiers).toEqual([])
    expect(result.current.filters.maxAgeHours).toBeNull()
    expect(result.current.scenario.premium).toBe(true)
  })

  test('a quantidade padrão é um LOTE, não uma unidade', () => {
    // Com `qty=1` o retorno de recurso não muda nada: `ceil(2 × 0,848) = 2`. O arredondamento
    // para a unidade comprável come o efeito inteiro, e a tela mostrava o mesmo lucro com 0% e
    // com 36,7% de retorno — foi o que o usuário viu. Num lote o retorno aparece.
    expect(render().result.current.scenario.quantity).toBe(100)
    expect(render('/refino?qty=1').result.current.scenario.quantity).toBe(1)
  })

  test('número absurdo no filtro não pode derrubar a tela', () => {
    // `validateRate` do engine **lança** para taxa fora de [0,1], e quantidade ≤ 0 idem. Como
    // o valor vem da URL e alimenta o cálculo durante o render, um `150` digitado no campo de
    // retorno derrubava a tela inteira no ErrorBoundary — o mesmo sintoma que o usuário viu
    // por outro caminho.
    expect(render('/refino?return_rate=150').result.current.scenario.returnRate).toBe('0.99')
    expect(render('/refino?return_rate=-30').result.current.scenario.returnRate).toBe('0')
    expect(render('/refino?qty=-5').result.current.scenario.quantity).toBe(1)
    expect(render('/refino?qty=0').result.current.scenario.quantity).toBe(100)
    expect(render('/refino?qty=7.9').result.current.scenario.quantity).toBe(7)
  })

  test('multi-seleção viaja como lista separada por vírgula', () => {
    const { result } = render('/refino?tier=4,6,8&ench=1,3')

    expect(result.current.filters.tiers).toEqual([4, 6, 8])
    expect(result.current.filters.enchantments).toEqual([1, 3])
  })

  test('a base do preço de ingrediente é a MÉDIA por padrão (task 11.3)', () => {
    // "no fim do dia, a maioria dos players que refinam usam preço médio" — então é o padrão,
    // não uma opção escondida.
    expect(render().result.current.pricing.base).toEqual({ kind: 'average' })
    expect(render('/refino?ing_price=4002').result.current.pricing.base).toEqual({
      kind: 'city',
      locationId: '4002',
    })
    expect(render('/refino?ing_price=sale').result.current.pricing.base).toEqual({
      kind: 'sale_city',
    })
  })

  test('exceção por item viaja na URL e sobrevive ao F5', () => {
    const { result } = render('/refino?px=T5_FIBER:250&pc=T4_CLOTH:4002')

    expect(result.current.pricing.manual.get('T5_FIBER')).toBe('250')
    expect(result.current.pricing.byItemCity.get('T4_CLOTH')).toBe('4002')
  })

  test('vender em: nenhuma cidade marcada = todas entram na conta', () => {
    expect(render().result.current.sellIn).toEqual([])
  })

  test('vender em: várias cidades viajam como parâmetro repetido', () => {
    // O jogador tira Brecilien e Caerleon da conta: vendem caro, mas o caminho é zona de PvP
    // e morrer lá perde o inventário. A melhor cidade é escolhida só entre as marcadas.
    expect(render('/refino?sell_in=1002&sell_in=4002').result.current.sellIn).toEqual([
      '1002',
      '4002',
    ])
  })

  test('links antigos continuam abrindo (task 19)', () => {
    // Uma cidade só era o formato anterior; `all` era o modo de uma linha por cidade.
    expect(render('/refino?sell_in=3005').result.current.sellIn).toEqual(['3005'])
    expect(render('/refino?sell_in=all').result.current.sellIn).toEqual([])
  })

  test('só `unpriced=false` esconde — qualquer outra coisa mostra', () => {
    expect(render('/refino?unpriced=false').result.current.filters.showUnpriced).toBe(
      false,
    )
    expect(render('/refino?unpriced=true').result.current.filters.showUnpriced).toBe(
      true,
    )
    expect(render('/refino').result.current.filters.showUnpriced).toBe(true)
  })

  test('o retorno digitado entra como decimal exato (task 3.6/01)', () => {
    const { result } = render('/refino?return_rate=36,7')
    expect(result.current.scenario.returnRate).toBe('0.367')
  })
})

describe('escrita na URL', () => {
  test('alternar um tier adiciona e remove, mantendo ordenado', () => {
    const { result } = render('/refino?tier=6')

    act(() => result.current.toggleNumber('tier', 4))
    expect(result.current.filters.tiers).toEqual([4, 6])

    act(() => result.current.toggleNumber('tier', 6))
    expect(result.current.filters.tiers).toEqual([4])

    act(() => result.current.toggleNumber('tier', 4))
    // Lista vazia sai da URL em vez de virar `tier=` — link limpo.
    expect(result.current.filters.tiers).toEqual([])
    expect(result.current.params.has('tier')).toBe(false)
  })

  test('marcar cidade de venda adiciona e remove o parâmetro repetido', () => {
    const { result } = render('/refino?sell_in=1002')

    act(() => result.current.toggleText('sell_in', '4002'))
    expect(result.current.sellIn).toEqual(['1002', '4002'])

    act(() => result.current.toggleText('sell_in', '1002'))
    expect(result.current.sellIn).toEqual(['4002'])

    act(() => result.current.toggleText('sell_in', '4002'))
    // Desmarcar a última volta a "todas" e some da URL — link limpo.
    expect(result.current.params.has('sell_in')).toBe(false)
  })

  test('valor vazio remove o parâmetro em vez de gravar string vazia', () => {
    const { result } = render('/refino?q=tecido')

    act(() => result.current.setParam('q', ''))
    expect(result.current.params.has('q')).toBe(false)
  })

  test('reset limpa tudo e devolve os padrões', () => {
    const { result } = render('/refino?tier=4&unpriced=false&q=fibra')

    act(() => result.current.reset())

    expect(result.current.filters.tiers).toEqual([])
    expect(result.current.filters.search).toBe('')
    expect(result.current.filters.showUnpriced).toBe(true)
  })
})

describe('o que dispara recálculo (task 12)', () => {
  test('filtro de EXIBIÇÃO não troca a identidade do que alimenta o engine', () => {
    // No craft o cálculo leva 2,5 s e roda no Worker. Se digitar na busca trocar a referência
    // de `scenario`/`pricing`/`strategy`, a tela recalcula 5.523 receitas para esconder linhas
    // que já estavam calculadas — foi exatamente o que o usuário sentiu como "demora a cada
    // alteração nos filtros".
    const { result } = render('/refino?qty=100')

    const cenario = result.current.scenario
    const precos = result.current.pricing
    const estrategia = result.current.strategy

    act(() => result.current.setParam('q', 'tecido'))

    expect(result.current.scenario).toBe(cenario)
    expect(result.current.pricing).toBe(precos)
    expect(result.current.strategy).toBe(estrategia)
    // E o filtro em si mudou, senão o teste passaria por não ter feito nada.
    expect(result.current.filters.search).toBe('tecido')
  })

  test('mexer no cenário TROCA a identidade — aí recalcular é o certo', () => {
    const { result } = render('/refino?qty=100')
    const antes = result.current.scenario

    act(() => result.current.setParam('qty', '500'))

    expect(result.current.scenario).not.toBe(antes)
    expect(result.current.scenario.quantity).toBe(500)
  })

  test('fixar preço de ingrediente troca a política, e só ela', () => {
    const { result } = render('/refino')
    const cenario = result.current.scenario

    act(() => result.current.setExcecao('px', 'T5_FIBER', '250'))

    expect(result.current.pricing.manual.get('T5_FIBER')).toBe('250')
    expect(result.current.scenario).toBe(cenario)
  })
})

describe('comprar em e origem por item (task 24)', () => {
  test('comprar em: nenhuma marcada = todas; várias viajam repetidas', () => {
    expect(render().result.current.buyIn).toEqual([])
    expect(render('/refino?buy_in=1002&buy_in=4002').result.current.buyIn).toEqual([
      '1002',
      '4002',
    ])
  })

  test('a origem da venda por item viaja na URL e sobrevive ao F5', () => {
    const { result } = render('/refino?sc=T4_CLOTH:media&sc=T5_CLOTH:3005')

    expect(result.current.pricing.saleByItem.get('T4_CLOTH')).toBe('media')
    expect(result.current.pricing.saleByItem.get('T5_CLOTH')).toBe('3005')
  })

  test('escolher uma cidade apaga o preço fixo do mesmo item, numa escrita só', () => {
    // Duas chamadas de `setExcecao` seguidas leriam o mesmo `params` antigo, e a segunda
    // desfaria a primeira: a cidade entraria e o preço fixo continuaria lá, vencendo ela.
    const { result } = render('/refino?px=T4_FIBER:250')

    act(() =>
      result.current.definirOrigem('compra', 'T4_FIBER', { tipo: 'cidade', locationId: '4002' }),
    )

    expect(result.current.pricing.manual.has('T4_FIBER')).toBe(false)
    expect(result.current.pricing.byItemCity.get('T4_FIBER')).toBe('4002')
  })

  test('fixar o preço apaga a cidade escolhida do mesmo item', () => {
    const { result } = render('/refino?sc=T4_CLOTH:3005')

    act(() =>
      result.current.definirOrigem('venda', 'T4_CLOTH', { tipo: 'fixo', valor: '1200' }),
    )

    expect(result.current.pricing.saleByItem.has('T4_CLOTH')).toBe(false)
    expect(result.current.pricing.manualSale.get('T4_CLOTH')).toBe('1200')
  })

  test('voltar ao padrão apaga as duas escolhas — e só daquele item', () => {
    const { result } = render('/refino?px=T4_FIBER:250&pc=T3_CLOTH:1002')

    act(() => result.current.definirOrigem('compra', 'T4_FIBER', { tipo: 'padrao' }))

    expect(result.current.pricing.manual.size).toBe(0)
    expect(result.current.pricing.byItemCity.get('T3_CLOTH')).toBe('1002')
  })

  test('mudar a origem da venda troca a política — e não o cenário', () => {
    // Se `sc` não entrasse na chave de conteúdo da política, ela ficaria velha e o engine não
    // recalcularia (task 12).
    const { result } = render('/refino')
    const cenario = result.current.scenario

    act(() => result.current.definirOrigem('venda', 'T4_CLOTH', { tipo: 'media' }))

    expect(result.current.pricing.saleByItem.get('T4_CLOTH')).toBe('media')
    expect(result.current.scenario).toBe(cenario)
  })
})

describe('preço de compra e de venda na barra (task 25)', () => {
  test('o padrão de cada lado viaja na URL e sobrevive ao F5', () => {
    expect(render('/refino?ing_price=min').result.current.pricing.base).toEqual({
      kind: 'cheapest',
    })
    expect(render('/refino?sale_price=avg').result.current.pricing.saleBase).toBe('average')
    // Ausente = melhor cidade, o comportamento de antes da task.
    expect(render().result.current.pricing.saleBase).toBe('best')
  })

  test('mudar o preço de venda da barra troca a política — e não o cenário', () => {
    // Se `sale_price` não entrasse na chave de conteúdo da política, ela ficaria velha e o
    // engine não recalcularia (task 12).
    const { result } = render('/refino')
    const precos = result.current.pricing
    const cenario = result.current.scenario

    act(() => result.current.setParam('sale_price', 'avg'))

    expect(result.current.pricing).not.toBe(precos)
    expect(result.current.pricing.saleBase).toBe('average')
    expect(result.current.scenario).toBe(cenario)
  })

  test('limpar um lado apaga fixo e origem só daquele lado, numa escrita só', () => {
    const { result } = render(
      '/refino?px=T4_FIBER:250&pc=T3_CLOTH:1002&sx=T4_CLOTH:1200&sc=T5_CLOTH:3005&q=tecido',
    )

    act(() => result.current.limparEscolhas('compra'))

    expect(result.current.pricing.manual.size).toBe(0)
    expect(result.current.pricing.byItemCity.size).toBe(0)
    expect(result.current.pricing.manualSale.get('T4_CLOTH')).toBe('1200')
    expect(result.current.pricing.saleByItem.get('T5_CLOTH')).toBe('3005')
    expect(result.current.filters.search).toBe('tecido')
  })

  test('menor e melhor escolhidos no item viajam na URL', () => {
    const { result } = render('/refino')

    act(() => result.current.definirOrigem('compra', 'T4_FIBER', { tipo: 'menor' }))
    expect(result.current.pricing.byItemCity.get('T4_FIBER')).toBe('menor')

    act(() => result.current.definirOrigem('venda', 'T4_CLOTH', { tipo: 'melhor' }))
    expect(result.current.pricing.saleByItem.get('T4_CLOTH')).toBe('melhor')
  })
})

describe('o que analisar (task 21)', () => {
  test('sem nada na URL, nada está selecionado', () => {
    expect(render().result.current.selecao).toEqual({
      categoria: null,
      subcategoria: null,
      top: false,
    })
  })

  test('categoria, subcategoria e top sobrevivem ao F5', () => {
    expect(render('/craft?cat=weapons/bow').result.current.selecao).toEqual({
      categoria: 'weapons',
      subcategoria: 'bow',
      top: false,
    })
    expect(render('/refino?cat=cloth').result.current.selecao.categoria).toBe('cloth')
    expect(render('/refino?top=15').result.current.selecao.top).toBe(true)
  })

  test('escolher categoria desliga o top, e ligar o top desliga a categoria', () => {
    const { result } = render('/craft?top=15&q=espada')

    act(() => result.current.escolherCategoria('weapons', 'sword'))
    expect(result.current.selecao).toEqual({
      categoria: 'weapons',
      subcategoria: 'sword',
      top: false,
    })

    act(() => result.current.alternarTop())
    expect(result.current.selecao).toEqual({ categoria: null, subcategoria: null, top: true })
    // A busca não é seleção exclusiva: continua filtrando o que aparece.
    expect(result.current.filters.search).toBe('espada')

    act(() => result.current.alternarTop())
    expect(result.current.params.has('top')).toBe(false)
  })

  test('limpar a categoria volta a não ter nada selecionado', () => {
    const { result } = render('/craft?cat=weapons/bow')

    act(() => result.current.escolherCategoria(null))

    expect(result.current.params.has('cat')).toBe(false)
    expect(result.current.selecao.categoria).toBeNull()
  })
})
