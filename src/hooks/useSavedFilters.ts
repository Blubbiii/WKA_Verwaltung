/**
 * useSavedFilters — B6: Saved Filters in Tabellen
 *
 * Liefert pro Tabellen-Surface die gespeicherten Filter des aktuellen Users
 * + Mutations (save, update, remove) mit optimistic updates.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SavedFilter {
  id: string;
  tenantId: string;
  userId: string;
  surface: string;
  name: string;
  filters: Record<string, unknown>;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  data: SavedFilter[];
}

interface MutationResponse {
  data: SavedFilter;
}

export interface SaveInput {
  name: string;
  filters: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdateInput {
  name?: string;
  filters?: Record<string, unknown>;
  isDefault?: boolean;
  sortOrder?: number;
}

export function useSavedFilters(surface: string) {
  const queryClient = useQueryClient();
  const queryKey = ["saved-filters", surface] as const;

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/saved-filters?surface=${encodeURIComponent(surface)}`);
      if (!res.ok) throw new Error("Failed to load saved filters");
      return res.json();
    },
    staleTime: 30_000,
  });

  const filters = data?.data ?? [];

  const saveMutation = useMutation<MutationResponse, Error, SaveInput, { previous?: ListResponse }>({
    mutationFn: async (input) => {
      const res = await fetch(`/api/saved-filters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface, ...input }),
      });
      if (!res.ok) throw new Error("Failed to save filter");
      return res.json();
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListResponse>(queryKey);
      const optimistic: SavedFilter = {
        id: `optimistic-${Date.now()}`,
        tenantId: "",
        userId: "",
        surface,
        name: input.name,
        filters: input.filters,
        sortOrder: previous?.data.length ?? 0,
        isDefault: input.isDefault ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next: ListResponse = {
        data: [
          ...(input.isDefault
            ? (previous?.data ?? []).map((f) => ({ ...f, isDefault: false }))
            : (previous?.data ?? [])),
          optimistic,
        ],
      };
      queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation<MutationResponse, Error, { id: string; input: UpdateInput }, { previous?: ListResponse }>({
    mutationFn: async ({ id, input }) => {
      const res = await fetch(`/api/saved-filters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update filter");
      return res.json();
    },
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListResponse>(queryKey);
      if (previous) {
        const next: ListResponse = {
          data: previous.data.map((f) => {
            if (input.isDefault === true) {
              return f.id === id
                ? { ...f, ...input, isDefault: true }
                : { ...f, isDefault: false };
            }
            return f.id === id ? { ...f, ...input } : f;
          }),
        };
        queryClient.setQueryData(queryKey, next);
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation<{ success: true }, Error, string, { previous?: ListResponse }>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/saved-filters/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete filter");
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ListResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<ListResponse>(queryKey, {
          data: previous.data.filter((f) => f.id !== id),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const save = useCallback(
    (input: SaveInput) => saveMutation.mutateAsync(input),
    [saveMutation]
  );
  const update = useCallback(
    (id: string, input: UpdateInput) => updateMutation.mutateAsync({ id, input }),
    [updateMutation]
  );
  const remove = useCallback(
    (id: string) => removeMutation.mutateAsync(id),
    [removeMutation]
  );

  return {
    filters,
    save,
    update,
    remove,
    isLoading,
    isSaving: saveMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
