import { useQuery } from "@tanstack/react-query";

interface FeatureFlags {
  "management-billing": boolean;
  "paperless": boolean;
  "communication": boolean;
  "crm": boolean;
  "gis": boolean;
  "inbox": boolean;
  "wirtschaftsplan": boolean;
  /** TF-8: war hier deklariert, wurde von /api/features aber nie geliefert. */
  "meilisearch": boolean;
  "document-routing": boolean;
  "marketData": boolean;
  "ppa-management": boolean;
  "solar": boolean;
  "storage": boolean;
  "predictive-maintenance": boolean;
  "investor-reports": boolean;
  /** New resumable SCADA-Upload (Uppy + tus). Off = legacy uploader. */
  "scada-uploader-v2": boolean;
  /** New resumable generic Uploader (FileUploadDropzone → Uppy + tus). */
  "uploader-v2-generic": boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  "management-billing": false,
  "paperless": false,
  "communication": false,
  "crm": false,
  "gis": false,
  "inbox": false,
  "wirtschaftsplan": false,
  "meilisearch": false,
  "document-routing": false,
  "marketData": false,
  "ppa-management": false,
  "solar": false,
  "storage": false,
  "predictive-maintenance": false,
  "investor-reports": false,
  "scada-uploader-v2": false,
  "uploader-v2-generic": false,
};

const fetcher = (url: string) => fetch(url).then((r) => r.ok ? r.json() : DEFAULT_FLAGS);

export function useFeatureFlags() {
  const { data, isLoading } = useQuery<FeatureFlags>({
    queryKey: ["/api/features"],
    queryFn: () => fetcher("/api/features"),
    refetchOnWindowFocus: false,
    staleTime: 60000, // Cache for 1 minute
    placeholderData: DEFAULT_FLAGS,
  });

  return {
    flags: data ?? DEFAULT_FLAGS,
    loading: isLoading,
    isFeatureEnabled: (key: keyof FeatureFlags): boolean => {
      return (data ?? DEFAULT_FLAGS)[key] ?? false;
    },
  };
}
