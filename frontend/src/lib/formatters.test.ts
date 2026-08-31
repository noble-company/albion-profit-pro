import { describe, expect, it } from 'vitest'
import { formatarIdade, formatarPct, formatarSilver } from './formatters'

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
