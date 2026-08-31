import { useEffect, useState } from 'react'
import {
  getItemPrices,
  getLocations,
  type ItemPrices,
  type Location,
} from './service'
import type { components } from '@/api/schema'
export function useItemPrices(
  item: string,
  server: components['schemas']['AlbionServer'] | null,
  scope: 'all' | 'mine',
  locations: string[],
  limit: number,
  offset: number,
) {
  const [data, setData] = useState<ItemPrices | null>(null)
  const [places, setPlaces] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    const c = new AbortController()
    void getLocations(c.signal)
      .then(setPlaces)
      .catch(() => undefined)
    return () => c.abort()
  }, [])
  useEffect(() => {
    if (!server) return
    let timer: number | undefined
    const load = () => {
      setLoading(true)
      void getItemPrices(
        item,
        server,
        scope,
        locations,
        limit,
        offset,
        new AbortController().signal,
      )
        .then((value) => {
          if (value) setData(value)
        })
        .catch(setError)
        .finally(() => setLoading(false))
    }
    load()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        clearInterval(timer)
        timer = window.setInterval(load, 30000)
      } else clearInterval(timer)
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [item, server, scope, locations.join(','), limit, offset])
  return { data, places, loading, error }
}
