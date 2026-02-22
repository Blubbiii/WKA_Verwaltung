import useSWR from "swr";

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
 * Hook fuer alle Parks des aktuellen Mandanten
 */
export function useParks() {
  const { data, error, isLoading, mutate } = useSWR<Park[]>(
    "/api/parks",
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    parks: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

/**
 * Hook fuer einen einzelnen Park
 */
export function usePark(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Park>(
    id ? `/api/parks/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    park: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
