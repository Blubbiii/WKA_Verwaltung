import { useQuery, useQueryClient } from "@tanstack/react-query";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  const json = await res.json();
  return json.data ?? json;
};

export interface Park {
  id: string;
  name: string;
  status: string;
  location?: string | null;
  commissioningDate?: string | null;
  totalCapacity?: number | null;
  _count?: {
    turbines: number;
    shareholders: number;
  };
}

/**
 * Hook für alle Parks des aktuellen Mandanten
 */
export function useParks() {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<Park[], Error>({
    queryKey: ["/api/parks"],
    queryFn: () => fetcher("/api/parks"),
    refetchOnWindowFocus: false,
  });

  return {
    parks: data,
    isLoading,
    isError: !!error,
    error,
    mutate: () => queryClient.invalidateQueries({ queryKey: ["/api/parks"] }),
  };
}

/**
 * Hook für einen einzelnen Park
 */
export function usePark(id: string | null) {
  const queryClient = useQueryClient();
  const url = id ? `/api/parks/${id}` : null;

  const { data, error, isLoading } = useQuery<Park, Error>({
    queryKey: [url],
    queryFn: () => fetcher(url!),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  return {
    park: data,
    isLoading,
    isError: !!error,
    error,
    mutate: () => url && queryClient.invalidateQueries({ queryKey: [url] }),
  };
}
