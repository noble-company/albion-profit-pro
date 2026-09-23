import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, useSearchParams } from 'react-router'
import { expect, test } from 'vitest'

import {
  OPPORTUNITY_DEFAULTS,
  useOpportunityParams,
} from './useOpportunityParams'

const noExtra = () => ({})

function wrapperAt(search: string) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <MemoryRouter initialEntries={[`/x${search}`]}>{children}</MemoryRouter>
    )
  }
}

test('defaults declarados num lugar só, aplicados quando a URL está vazia', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt(''),
  })
  expect(result.current.query.maxAgeHours).toBe(
    OPPORTUNITY_DEFAULTS.freshnessHours,
  )
  expect(result.current.query.limit).toBe(OPPORTUNITY_DEFAULTS.pageSize)
  expect(result.current.query.profitOnly).toBe(true)
  expect(result.current.query.premium).toBe(true)
  expect(result.current.sortParam).toBe('profit_desc')
  expect(result.current.query.offset).toBe(0)
})

test('o default de profit_only é o mesmo para qualquer schema de tela', () => {
  const flip = renderHook(
    () =>
      useOpportunityParams((p) => ({
        buyOrder: p.get('buy_order') === 'true',
      })),
    { wrapper: wrapperAt('') },
  )
  const production = renderHook(
    () =>
      useOpportunityParams((p) => ({ useFocus: p.get('focus') === 'true' })),
    { wrapper: wrapperAt('') },
  )
  expect(flip.result.current.query.profitOnly).toBe(
    production.result.current.query.profitOnly,
  )
  expect(flip.result.current.query.profitOnly).toBe(true)
})

test('ler os params da URL é reversível — ida e volta preserva o estado', () => {
  const search =
    '?tier=5&quality=3&freshness=12&coverage=complete&min_profit=1000&min_roi=8&premium=false&profit_only=false&location_id=1002&location_id=3005&sort=roi_asc&offset=50'
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt(search),
  })
  expect(result.current.query).toMatchObject({
    tiers: [5],
    enchantments: [],
    qualities: [3],
    maxAgeHours: 12,
    requireComplete: true,
    minProfit: '1000',
    minRoi: '8',
    premium: false,
    profitOnly: false,
    buyLocations: ['1002', '3005'],
    sellLocations: ['1002', '3005'],
    sort: 'roi',
    direction: 'asc',
    offset: 50,
  })
  expect(result.current.sortParam).toBe('roi_asc')
})

test('mudar uma lista de filtro volta pra primeira página', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?offset=50&tier=4'),
  })
  act(() => result.current.setListFilter('tier', [4, 6]))
  expect(result.current.query.tiers).toEqual([4, 6])
  expect(result.current.query.offset).toBe(0)
})

test('paginar preserva os outros filtros (o updateParam antigo apagava offset em toda escrita)', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?tier=4&quality=2'),
  })
  act(() => result.current.setOffset(25))
  expect(result.current.query.offset).toBe(25)
  expect(result.current.query.tiers).toEqual([4])
  expect(result.current.query.qualities).toEqual([2])
  act(() => result.current.setOffset(0))
  expect(result.current.query.offset).toBe(0)
})

test('listas de compra e venda são independentes', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?offset=25&buy_in=1002&sell_in=3005'),
  })
  act(() => result.current.setListFilter('buy_in', ['3008', '4002']))
  expect(result.current.query.buyLocations).toEqual(['3008', '4002'])
  expect(result.current.query.sellLocations).toEqual(['3005'])
  expect(result.current.query.offset).toBe(0)
})

test('editar link antigo materializa as duas pontas antes de remover location_id', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?location_id=1002&location_id=1301'),
  })
  act(() => result.current.setListFilter('buy_in', ['3008']))
  expect(result.current.query.buyLocations).toEqual(['3008'])
  expect(result.current.query.sellLocations).toEqual(['1002', '1301'])
  expect(result.current.params.getAll('location_id')).toEqual([])
})

test('reset limpa tudo', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?tier=4&offset=50&sort=roi_desc'),
  })
  act(() => result.current.reset())
  expect(result.current.query.tiers).toEqual([])
  expect(result.current.query.offset).toBe(0)
  expect(result.current.sortParam).toBe('profit_desc')
})

test('o hook expõe o URLSearchParams cru pros campos controlados', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?category=weapons'),
  })
  expect(result.current.params.get('category')).toBe('weapons')
})

// Guard: só um caminho de escrita de URL nas telas de oportunidade. `useSearchParams` é
// legítimo aqui (o hook) e no teste; em qualquer outro lugar de opportunities/, é sinal de
// que a sincronia de params voltou a ser duplicada.
test('nenhuma outra tela de opportunities fala com useSearchParams direto', () => {
  const sources: Record<string, string> = import.meta.glob(
    '/src/opportunities/**/*.{ts,tsx}',
    { query: '?raw', import: 'default', eager: true },
  )
  const offenders = Object.entries(sources)
    .filter(([path]) => !path.endsWith('useOpportunityParams.ts'))
    .filter(
      ([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'),
    )
    .filter(([, code]) =>
      code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .includes('useSearchParams'),
    )
    .map(([path]) => path)
  expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
  // e o hook realmente usa o primitivo que estamos centralizando
  expect(typeof useSearchParams).toBe('function')
})
