import type { components } from '@/api/schema'
import type { Cidade } from '@/lib/locations'
import type { Money } from '@/lib/money'
import {
  bestPerRecipe,
  computeScanner,
  DEFAULT_STRATEGY,
  type ScannerCatalog,
  type ScannerParams,
  type ScannerRow,
} from '@/scanner/engine'
import type { PriceIndex } from '@/scanner/prices'
import { DEFAULT_PRICING } from '@/scanner/pricing'
import { volumeDaVenda, type SalesIndex } from '@/scanner/vendas'

import type { SavedCraft } from './service'

type CatalogItem = components['schemas']['CatalogItemOut']

export interface SavedCraftView {
  saved: SavedCraft
  item: CatalogItem | undefined
  productionKind: string | null
  row: ScannerRow | null
  volume: Money | null
  params: ScannerParams
}

export function defaultSavedCraftParams(
  saved: SavedCraft,
  locations: readonly string[],
): ScannerParams {
  return {
    locations: [...locations],
    priceLocations: [...locations],
    recipes: [saved.output_item],
    pricing: DEFAULT_PRICING,
    strategy: DEFAULT_STRATEGY,
    premium: true,
    returnRate: '0',
    stationFeePer100Nutrition: '0',
    useFocus: false,
    outputQuality: saved.output_quality,
    quantity: saved.quantity,
    quantityMeans: 'initial_recipes',
    destinyBoard: new Map(),
  }
}

export function calculateSavedCrafts(
  savedCrafts: readonly SavedCraft[],
  catalog: ScannerCatalog,
  prices: PriceIndex,
  cities: readonly Cidade[],
  sales: SalesIndex | null,
): SavedCraftView[] {
  const recipes = new Map(catalog.recipes.map((recipe) => [recipe.output_item, recipe]))
  const items = new Map(catalog.items.map((item) => [item.unique_name, item]))
  const locations = cities.map((city) => city.id)

  return savedCrafts.map((saved) => {
    const params = defaultSavedCraftParams(saved, locations)
    const recipe = recipes.get(saved.output_item)
    const row = recipe
      ? (bestPerRecipe(
          computeScanner({ items: catalog.items, recipes: [recipe] }, prices, params),
        )[0] ?? null)
      : null
    return {
      saved,
      item: items.get(saved.output_item),
      productionKind: recipe?.production_kind ?? null,
      row,
      volume:
        row && sales
          ? volumeDaVenda(row, sales, locations, saved.output_quality)
          : null,
      params,
    }
  })
}
