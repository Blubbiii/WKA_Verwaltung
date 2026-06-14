"use client";

import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      title="Fehler bei Windparks"
      description="Beim Laden der Parkdaten ist ein Fehler aufgetreten."
    />
  );
}
