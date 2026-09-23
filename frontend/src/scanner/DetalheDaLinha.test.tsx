import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Cidade } from '@/lib/locations'

import { bestPerRecipe, computeScanner, type ScannerCatalog, type ScannerParams } from './engine'
import { DetalheDaLinha } from './DetalheDaLinha'
import { buildPriceIndex, type PriceSnapshotOut } from './prices'
import type { ScannerScenario } from './useScannerFilters'

const T = 1_757_000_000

const SNAPSHOT = {
  server: 'west',
  generated_at: new Date(T * 1000).toISOString(),
  row_count: 6,
  items: ['T4_FIBER', 'T4_CLOTH'],
  locations: ['1002', '3005'],
  sources: ['client'],
  columns: {
    item: [0, 0, 1, 1, 1, 1],
    location: [0, 1, 0, 1, 0, 1],
    quality: [1, 1, 1, 1, 2, 2],
    enchantment: [0, 0, 0, 0, 0, 0],
    sell_min: ['100', '100', '1000', '800', '2000', '3000'],
    sell_observed_at: [T, T, T, T, T, T],
    sell_source: [0, 0, 0, 0, 0, 0],
    buy_max: ['90', '90', '900', '700', '1900', '2900'],
    buy_observed_at: [T, T, T, T, T, T],
    buy_source: [0, 0, 0, 0, 0, 0],
  },
} as unknown as PriceSnapshotOut

const CATALOGO = {
  items: [
    { unique_name: 'T4_FIBER', weight: '0.51', enchantment_level: 0 },
    { unique_name: 'T4_CLOTH', weight: '0.51', enchantment_level: 0 },
  ],
  recipes: [
    {
      output_item: 'T4_CLOTH',
      production_kind: 'crafting',
      enchantment_level: 0,
      silver_cost: '0',
      crafting_focus: 100,
      amount_crafted: 1,
      ingredients: [{ item: 'T4_FIBER', count: 1, enchantment_level: 0 }],
      upgrade_resource: null,
    },
  ],
} as ScannerCatalog

const PARAMS: ScannerParams = {
  locations: ['1002', '3005'],
  priceLocations: ['1002'],
  pricing: {
    base: { kind: 'average' },
    manual: new Map(),
    byItemCity: new Map(),
    manualSale: new Map(),
    saleByItem: new Map(),
    saleBase: 'best',
  },
  strategy: { acquisition: 'best', sale: 'best' },
  quantityMeans: 'initial_recipes',
  destinyBoard: new Map(),
  premium: true,
  returnRate: '0',
  stationFeePer100Nutrition: '0',
  useFocus: false,
  outputQuality: 1,
  quantity: 1,
}

const CENARIO: ScannerScenario = {
  premium: PARAMS.premium,
  quantityMeans: 'initial_recipes',
  returnRate: PARAMS.returnRate,
  stationFeePer100Nutrition: PARAMS.stationFeePer100Nutrition,
  useFocus: PARAMS.useFocus,
  outputQuality: PARAMS.outputQuality,
  quantity: PARAMS.quantity,
}

const CIDADES = [
  { id: '1002', name: 'Lymhurst', ids: ['1002'] },
  { id: '3005', name: 'Caerleon', ids: ['3005'] },
] as Cidade[]

test('a qualidade do painel muda só a análise aberta', async () => {
  const user = userEvent.setup()
  const indice = buildPriceIndex(SNAPSHOT)
  const row = bestPerRecipe(computeScanner(CATALOGO, indice, PARAMS))[0]!
  const qualidadeDaAcao = vi.fn((quality: number) => (
    <button type="button">Salvar qualidade {quality}</button>
  ))

  render(
    <DetalheDaLinha
      row={row}
      catalog={CATALOGO}
      indice={indice}
      params={PARAMS}
      cidades={CIDADES}
      nomeItem={(item) => item}
      locationName={(id) => (id === '3005' ? 'Caerleon' : 'Lymhurst')}
      pricing={PARAMS.pricing}
      scenario={CENARIO}
      realm={null}
      onOrigem={vi.fn()}
      indiceDeVendas={null}
      comSeletorDeQualidade
      savedCraftAction={qualidadeDaAcao}
    />,
  )

  const seletor = screen.getByLabelText('Qualidade analisada')
  expect(seletor).toHaveValue('1')

  expect(screen.getAllByText('Lymhurst').length).toBeGreaterThan(0)
  expect(screen.getAllByText('1.000').length).toBeGreaterThan(0)

  await user.selectOptions(seletor, '2')

  expect(seletor).toHaveValue('2')
  expect(screen.getAllByText('3.000').length).toBeGreaterThan(0)
  expect(screen.getAllByText(/Caerleon/).length).toBeGreaterThan(0)
  expect(PARAMS.outputQuality).toBe(1)
  expect(screen.getByRole('button', { name: 'Salvar qualidade 2' })).toBeInTheDocument()
  expect(qualidadeDaAcao).toHaveBeenLastCalledWith(2)
})
