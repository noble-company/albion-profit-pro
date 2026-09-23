import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryPolicies } from '@/api'
import type { Realm } from '@/app/ServerContext'

import {
  createSavedCraft,
  deleteSavedCraft,
  getSavedCrafts,
  type SavedCraft,
  type SavedCraftCreate,
} from './service'

const EMPTY: SavedCraft[] = []

export const savedCraftsKey = (server: Realm) => ['saved-crafts', server] as const

export function useSavedCrafts(server: Realm | null, enabled = true) {
  const query = useQuery({
    queryKey: server ? savedCraftsKey(server) : ['saved-crafts', 'no-realm'],
    queryFn: ({ signal }) => getSavedCrafts(server!, signal),
    enabled: enabled && server !== null,
    ...queryPolicies.catalog,
  })
  return { ...query, crafts: query.data ?? EMPTY }
}

export function useDeleteSavedCraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; server: Realm }) => deleteSavedCraft(id),
    retry: false,
    onSuccess: (_, { id, server }) => {
      client.setQueryData<SavedCraft[]>(savedCraftsKey(server), (current = []) =>
        current.filter((craft) => craft.id !== id),
      )
    },
  })
}

export function useCreateSavedCraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: SavedCraftCreate) => createSavedCraft(input),
    retry: false,
    onSuccess: (saved) => {
      client.setQueryData<SavedCraft[]>(savedCraftsKey(saved.server), (current = []) => [
        saved,
        ...current,
      ])
    },
  })
}
