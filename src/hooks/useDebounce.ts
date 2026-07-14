import { useEffect, useState } from "react";

/**
 * Custom hook that debounces a value.
 * Returns the debounced value that only updates after the specified delay.
 *
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 300ms)
 * @returns The debounced value
 *
 * @example
 * const [search, setSearch] = useState("");
 * const debouncedSearch = useDebounce(search, 300);
 *
 * useEffect(() => {
 *   // This will only run 300ms after the user stops typing
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay completes
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// FP4: `useDebouncedCallback` wurde entfernt — es hatte ein Anti-Pattern
// (useState fuer die TimeoutID triggerte re-renders + neuen Cleanup pro
// Callback-Call) und war codeweit ungenutzt. Bei Bedarf neu implementieren
// mit useRef fuer die Timeout-Handle.
