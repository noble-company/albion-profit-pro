import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { EstadoErro, EstadoVazio } from '@/components/ui/states'
import { useBuscaItens } from './hooks'
import type { CatalogItem } from './service'

function ItemLabel({ item }: { item: CatalogItem }) {
  return (
    <>
      <span>{item.name_pt ?? item.name_en ?? item.unique_name}</span>
      <span className="ml-2 text-xs text-stone-500">
        {item.unique_name}
        {item.tier ? ` · T${item.tier}` : ''}
        {item.enchantment_level ? `.${item.enchantment_level}` : ''}
      </span>
      {!item.has_recipe && (
        <span className="ml-2 rounded bg-stone-700 px-1.5 py-0.5 text-xs text-stone-300">
          sem receita
        </span>
      )}
    </>
  )
}
export function BuscaItem() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [tier, setTier] = useState('')
  const [enchantment, setEnchantment] = useState('')
  const [category, setCategory] = useState('')
  const [craftable, setCraftable] = useState(false)
  const filters = useMemo(
    () => ({
      tier: tier ? Number(tier) : undefined,
      enchantment_level: enchantment ? Number(enchantment) : undefined,
      categoria: category || undefined,
      apenas_craftaveis: craftable || undefined,
    }),
    [category, craftable, enchantment, tier],
  )
  const result = useBuscaItens(query, filters)
  const hasError = Boolean(result.error)
  const select = (item: CatalogItem) => {
    setOpen(false)
    void navigate(`/item/${encodeURIComponent(item.unique_name)}`)
  }
  return (
    <section>
      <h1 className="text-3xl font-bold">Busca de itens</h1>
      <p className="mt-2 text-stone-400">
        Pesquise em português, inglês ou pelo identificador do item.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="lg:col-span-2">
          Item
          <input
            role="combobox"
            aria-controls="resultados-itens"
            aria-expanded={open && result.data.length > 0}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
              if (event.key === 'ArrowDown' && result.data[0]) {
                event.preventDefault()
                select(result.data[0])
              }
            }}
            placeholder="Ex.: algodão, cotton, T4_CLOTH"
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
          />
        </label>
        <label>
          Tier
          <select
            aria-label="Filtrar por tier"
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
          >
            <option value="">Todos</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
              <option key={value} value={value}>
                T{value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Encantamento
          <select
            aria-label="Filtrar por encantamento"
            value={enchantment}
            onChange={(event) => setEnchantment(event.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
          >
            <option value="">Todos</option>
            {[0, 1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                .{value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <input
            aria-label="Filtrar por categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
          />
        </label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={craftable}
          onChange={(event) => setCraftable(event.target.checked)}
        />{' '}
        Somente craftáveis
      </label>
      <div className="relative">
        {open && query.trim().length >= 2 && (
          <div
            id="resultados-itens"
            role="listbox"
            aria-label="Resultados de itens"
            className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-stone-700 bg-stone-900 p-2 shadow-xl"
          >
            {result.isLoading && (
              <p role="status" className="p-3 text-stone-400">
                Buscando…
              </p>
            )}
            {hasError && <EstadoErro title="Não foi possível buscar itens" />}
            {!result.isLoading && !hasError && result.data.length === 0 && (
              <EstadoVazio title="Nenhum item encontrado" />
            )}
            {result.data.map((item) => (
              <button
                role="option"
                aria-label={item.name_pt ?? item.name_en ?? item.unique_name}
                key={item.unique_name}
                className="block w-full rounded-lg p-3 text-left hover:bg-stone-800 focus:bg-stone-800 focus:outline-none"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
              >
                <ItemLabel item={item} />
              </button>
            ))}
          </div>
        )}
        {result.needsMore && (
          <p className="mt-2 text-sm text-stone-500">
            Digite pelo menos 2 caracteres.
          </p>
        )}
      </div>
    </section>
  )
}
