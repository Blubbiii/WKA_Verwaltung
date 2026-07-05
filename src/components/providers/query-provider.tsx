"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Extracts HTTP status from a react-query error object.
 * Supports common shapes: { status }, { response: { status } }, { statusCode }.
 */
function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  if (e.response && typeof e.response.status === "number") return e.response.status;
  return undefined;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes — reduces unnecessary refetches
            gcTime: 5 * 60 * 1000, // 5 minutes (garbage collection, formerly cacheTime)
            refetchOnWindowFocus: false,
            // Smart retry: never retry client errors (4xx), retry up to 2× for others.
            // Ausnahme: 408/429 werden als transient behandelt und dürfen retryed werden.
            retry: (failureCount, error) => {
              const status = getErrorStatus(error);
              if (typeof status === "number" && status >= 400 && status < 500) {
                if (status !== 408 && status !== 429) return false;
              }
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
