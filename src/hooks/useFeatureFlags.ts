import useSWR from "swr";

interface FeatureFlags {
  "management-billing": boolean;
  "paperless": boolean;
  "communication": boolean;
  "crm": boolean;
  "inbox": boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  "management-billing": false,
  "paperless": false,
  "communication": false,
  "crm": false,
  "inbox": false,
};

const fetcher = (url: string) => fetch(url).then((r) => r.ok ? r.json() : DEFAULT_FLAGS);

export function useFeatureFlags() {
  const { data, isLoading } = useSWR<FeatureFlags>("/api/features", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // Cache for 1 minute
    fallbackData: DEFAULT_FLAGS,
  });

  return {
    flags: data ?? DEFAULT_FLAGS,
    loading: isLoading,
    isFeatureEnabled: (key: keyof FeatureFlags): boolean => {
      return (data ?? DEFAULT_FLAGS)[key] ?? false;
    },
  };
}
