import { describe, expect, it } from 'vitest'
import {
  formatarIdade,
  formatarNomeCurto,
  formatarNomeItem,
  formatarPct,
  formatarSilver,
  partesDoNomeCurto,
} from './formatters'

describe('nome e grau separados (pedido no uso, 2026-09-12)', () => {
  // O tier colado no fim do nome era cortado junto com ele: "Elmo de Soldado T..." escondia
  // exatamente o que distingue uma linha da outra. A tabela mostra o grau embaixo do nome.
  it('equipamento: o nome do jogo sem o tier, e o grau à parte', () => {
    expect(partesDoNomeCurto('Espada Larga do Adepto', 'T4_2H_CLAYMORE@1')).toEqual({
      nome: 'Espada Larga',
      grau: 'T4.1',
    })
    expect(partesDoNomeCurto('Sopa de Cenoura', 'T3_MEAL_SOUP')).toEqual({
      nome: 'Sopa de Cenoura',
      grau: 'T3',
    })
  })

  it('recurso continua curto', () => {
    expect(partesDoNomeCurto('Minério de Titânio Excepcional', 'T5_ORE_LEVEL3@3')).toEqual({
      nome: 'Minério',
      grau: 'T5.3',
    })
  })

  it('item sem tier no código não inventa grau', () => {
    expect(partesDoNomeCurto('Smoking de Casamento', 'UNIQUE_ARMOR_VANITY_WEDDING_TUXEDO')).toEqual({
      nome: 'Smoking de Casamento',
      grau: null,
    })
  })

  it('juntar as partes dá exatamente o nome curto de antes — ordenação e busca não mudam', () => {
    for (const [nome, codigo] of [
      ['Espada Larga do Adepto', 'T4_2H_CLAYMORE@1'],
      ['Minério de Titânio Excepcional', 'T5_ORE_LEVEL3@3'],
      ['Smoking de Casamento', 'UNIQUE_ARMOR_VANITY_WEDDING_TUXEDO'],
    ] as const) {
      const partes = partesDoNomeCurto(nome, codigo)
      expect([partes.nome, partes.grau].filter(Boolean).join(' ')).toBe(
        formatarNomeCurto(nome, codigo),
      )
    }
  })
})

describe('nome curto de recurso', () => {
  // O jogador lê "Minério T5.3" mais rápido do que "Minério de Titânio Excepcional T5.3", e a
  // espécie ("de Titânio") e o adjetivo de encantamento ("Excepcional") já estão ditos pelo
  // tier e pelo `.3`. Numa tabela de 15 colunas isso é a diferença entre ler e não ler.
  it('bruto e refinado usam o substantivo da família, com tier e encantamento', () => {
    expect(formatarNomeCurto('Minério de Titânio Excepcional', 'T5_ORE_LEVEL3@3')).toBe(
      'Minério T5.3',
    )
    expect(formatarNomeCurto('Troncos de Freixo Raros', 'T7_WOOD_LEVEL2@2')).toBe(
      'Madeira T7.2',
    )
    expect(formatarNomeCurto('Tábuas de Cedro', 'T5_PLANKS')).toBe('Tábua T5')
    expect(formatarNomeCurto('Barra de Aço', 'T4_METALBAR')).toBe('Barra T4')
    expect(formatarNomeCurto('Pelego Médio', 'T4_HIDE')).toBe('Pelego T4')
    expect(formatarNomeCurto('Couro Endurecido', 'T6_LEATHER')).toBe('Couro T6')
  })

  it('o que NÃO é recurso mantém o nome do jogo', () => {
    // Encurtar equipamento apagaria a identidade do item: "Espada" serve para dezenas de armas
    // diferentes, enquanto "Minério" é sempre a mesma coisa dentro do tier.
    expect(formatarNomeCurto('Espada Larga', 'T4_2H_CLAYMORE@1')).toBe('Espada Larga T4.1')
    expect(formatarNomeCurto('Sopa de Cenoura', 'T3_MEAL_SOUP')).toBe('Sopa de Cenoura T3')
  })

  it('encurtar é decisão de tabela: onde o item é o assunto, o nome do jogo fica', () => {
    // As telas de Preços, Craft e a gaveta de detalhe mostram UM item — ali o nome completo é
    // o que a pessoa digitou e o que ela confere.
    expect(formatarNomeItem('Minério de Titânio Excepcional', 'T5_ORE_LEVEL3@3')).toBe(
      'Minério de Titânio Excepcional T5.3',
    )
  })
})

describe('formatadores da interface', () => {
  it('formata silver sem perder inteiros grandes', () =>
    expect(formatarSilver('12345678901234567890.55')).toBe(
      '12.345.678.901.234.567.890 silver',
    ))
  it('formata idade, nulo e desatualizado', () => {
    const now = new Date('2026-08-23T12:00:00Z')
    expect(formatarIdade(null, now)).toBe('Sem atualização')
    expect(formatarIdade('2026-08-23T05:00:00Z', now)).toContain(
      'desatualizado',
    )
    expect(formatarIdade('2026-08-23T12:01:00Z', now)).toBe(
      'Relógio fora de sincronia',
    )
  })
  it('formata percentual em pt-BR', () =>
    expect(formatarPct('10.5')).toBe('10,5%'))
})
