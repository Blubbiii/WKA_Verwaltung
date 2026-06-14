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
      title="Fehler bei Service-Events"
      description="Beim Laden der Service-Events ist ein Fehler aufgetreten."
    />
  );
}
