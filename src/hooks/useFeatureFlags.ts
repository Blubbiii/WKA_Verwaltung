import useSWR from "swr";

interface FeatureFlags {
  "management-billing": boolean;
  "paperless": boolean;
  "communication": boolean;
  "crm": boolean;
  "inbox": boolean;
  "wirtschaftsplan": boolean;
  "meilisearch": boolean;
  "accounting": boolean;
  "document-routing": boolean;
  // Accounting sub-modules
  "accounting.reports": boolean;
  "accounting.bank": boolean;
  "accounting.dunning": boolean;
  "accounting.sepa": boolean;
  "accounting.ustva": boolean;
  "accounting.assets": boolean;
  "accounting.cashbook": boolean;
  "accounting.datev": boolean;
  "accounting.yearend": boolean;
  "accounting.costcenter": boolean;
  "accounting.budget": boolean;
  "accounting.quotes": boolean;
  "accounting.liquidity": boolean;
  "accounting.ocr": boolean;
  "accounting.multibanking": boolean;
  "accounting.zm": boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  "management-billing": false,
  "paperless": false,
  "communication": false,
  "crm": false,
  "inbox": false,
  "wirtschaftsplan": false,
  "meilisearch": false,
  "accounting": false,
  "document-routing": false,
  "accounting.reports": false,
  "accounting.bank": false,
  "accounting.dunning": false,
  "accounting.sepa": false,
  "accounting.ustva": false,
  "accounting.assets": false,
  "accounting.cashbook": false,
  "accounting.datev": false,
  "accounting.yearend": false,
  "accounting.costcenter": false,
  "accounting.budget": false,
  "accounting.quotes": false,
  "accounting.liquidity": false,
  "accounting.ocr": false,
  "accounting.multibanking": false,
  "accounting.zm": false,
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
