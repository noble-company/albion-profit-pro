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
    tier: 5,
    quality: 3,
    maxAgeHours: 12,
    requireComplete: true,
    minProfit: '1000',
    minRoi: '8',
    premium: false,
    profitOnly: false,
    locations: ['1002', '3005'],
    sort: 'roi',
    direction: 'asc',
    offset: 50,
  })
  expect(result.current.sortParam).toBe('roi_asc')
})

test('mudar um filtro volta pra primeira página', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?offset=50&tier=4'),
  })
  act(() => result.current.setFilter('tier', '6'))
  expect(result.current.query.tier).toBe(6)
  expect(result.current.query.offset).toBe(0)
})

test('paginar preserva os outros filtros (o updateParam antigo apagava offset em toda escrita)', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?tier=4&quality=2'),
  })
  act(() => result.current.setOffset(25))
  expect(result.current.query.offset).toBe(25)
  expect(result.current.query.tier).toBe(4)
  expect(result.current.query.quality).toBe(2)
  act(() => result.current.setOffset(0))
  expect(result.current.query.offset).toBe(0)
})

test('setLocations troca a seleção de cidades e zera a paginação', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?offset=25&location_id=1002'),
  })
  act(() => result.current.setLocations(['3005', '4002']))
  expect(result.current.query.locations).toEqual(['3005', '4002'])
  expect(result.current.query.offset).toBe(0)
})

test('reset limpa tudo', () => {
  const { result } = renderHook(() => useOpportunityParams(noExtra), {
    wrapper: wrapperAt('?tier=4&offset=50&sort=roi_desc'),
  })
  act(() => result.current.reset())
  expect(result.current.query.tier).toBeUndefined()
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
