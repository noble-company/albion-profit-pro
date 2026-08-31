import { useEffect, useState } from 'react'
import type { components } from '@/api/schema'
import {
  getFlipOpportunities,
  getProductionOpportunities,
  type OpportunityQuery,
  type OpportunityPage,
  type ProductionKind,
} from './service'

export function useFlipOpportunities(
  server: components['schemas']['AlbionServer'] | null,
  query: OpportunityQuery,
) {
  const [data, setData] = useState<OpportunityPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const key = JSON.stringify([server, query])
  useEffect(() => {
    if (!server) return
    let controller = new AbortController()
    let disposed = false

    const fetchOpportunities = () => {
      controller.abort()
      controller = new AbortController()
      const requestController = controller
      // The request lifecycle is external state synchronized by this effect.
      setLoading(true)
      setError(null)
      void getFlipOpportunities(server, query, requestController.signal)
        .then((value) => {
          if (!disposed && !requestController.signal.aborted)
            setData(value ?? null)
        })
        .catch((reason: unknown) => {
          if (!disposed && !requestController.signal.aborted) {
            setData(null)
            setError(reason)
          }
        })
        .finally(() => {
          if (!disposed && !requestController.signal.aborted) setLoading(false)
        })
    }

    // Never show rows from the previous filter while the new query is pending.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null)
    fetchOpportunities()
    const interval = window.setInterval(fetchOpportunities, 30_000)

    return () => {
      disposed = true
      window.clearInterval(interval)
      controller.abort()
    }
  }, [key, query, server])
  return { data, loading, error }
}

export function useProductionOpportunities(
  kind: ProductionKind,
  server: components['schemas']['AlbionServer'] | null,
  query: OpportunityQuery,
) {
  const [data, setData] = useState<OpportunityPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const key = JSON.stringify([kind, server, query])

  useEffect(() => {
    if (!server) return
    let controller = new AbortController()
    let disposed = false

    const fetchOpportunities = () => {
      controller.abort()
      controller = new AbortController()
      const requestController = controller
      setLoading(true)
      setError(null)
      void getProductionOpportunities(
        kind,
        server,
        query,
        requestController.signal,
      )
        .then((value) => {
          if (!disposed && !requestController.signal.aborted)
            setData(value ?? null)
        })
        .catch((reason: unknown) => {
          if (!disposed && !requestController.signal.aborted) {
            setData(null)
            setError(reason)
          }
        })
        .finally(() => {
          if (!disposed && !requestController.signal.aborted) setLoading(false)
        })
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null)
    fetchOpportunities()
    const interval = window.setInterval(fetchOpportunities, 30_000)
    return () => {
      disposed = true
      window.clearInterval(interval)
      controller.abort()
    }
  }, [key, kind, query, server])

  return { data, loading, error }
}
