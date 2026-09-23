import { describe, expect, test } from 'vitest'

import { podeSalvarEmMeusCrafts } from './meusCrafts'

describe('Meus Crafts nas telas do scanner', () => {
  test('aparece em Refino, Craft e Comida & Poções', () => {
    expect(podeSalvarEmMeusCrafts('crafting')).toBe(true)
    expect(podeSalvarEmMeusCrafts('consumables')).toBe(true)
    expect(podeSalvarEmMeusCrafts('refining')).toBe(true)
  })
})
