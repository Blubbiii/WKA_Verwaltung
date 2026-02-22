import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from "@tanstack/react-query";

// Generic fetcher function
async function apiFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Netzwerkfehler" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Generic hook for GET API requests with React Query.
 *
 * @param key - Query key (string or array). Include all filter/page params
 *              so that React Query refetches when they change.
 * @param url - The API URL to fetch. Pass `null` to disable the query.
 * @param options - Additional React Query options (staleTime, enabled, etc.)
 *
 * @example
 * ```ts
 * const { data, isLoading, error } = useApiQuery<ParksResponse>(
 *   ["parks", search, status, page],
 *   `/api/parks?search=${search}&status=${status}&page=${page}`
 * );
 * ```
 */
export function useApiQuery<T>(
  key: string | string[],
  url: string | null,
  options?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">
) {
  const queryKey = Array.isArray(key) ? key : [key];

  return useQuery<T, Error>({
    queryKey,
    queryFn: () => apiFetcher<T>(url!),
    enabled: !!url,
    ...options,
  });
}

/**
 * Generic hook for mutation requests (POST, PUT, DELETE).
 *
 * @param mutationFn - Async function that performs the mutation.
 * @param options - Additional React Query mutation options (onSuccess, onError, etc.)
 *
 * @example
 * ```ts
 * const deleteMutation = useApiMutation(
 *   (id: string) => fetch(`/api/parks/${id}`, { method: "DELETE" }).then(res => {
 *     if (!res.ok) throw new Error("Fehler");
 *     return res.json();
 *   }),
 *   { onSuccess: () => invalidate(["parks"]) }
 * );
 * ```
 */
export function useApiMutation<TData = unknown, TVariables = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn,
    ...options,
  });
}

/**
 * Hook to invalidate queries after mutations.
 *
 * @example
 * ```ts
 * const invalidate = useInvalidateQuery();
 * // After a successful mutation:
 * invalidate(["parks"]);
 * ```
 */
export function useInvalidateQuery() {
  const queryClient = useQueryClient();

  return (key: string | string[]) => {
    const queryKey = Array.isArray(key) ? key : [key];
    queryClient.invalidateQueries({ queryKey });
  };
}
