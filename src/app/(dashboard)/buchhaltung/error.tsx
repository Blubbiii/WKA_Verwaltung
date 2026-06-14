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
      title="Fehler in der Buchhaltung"
      description="Beim Laden der Buchhaltungsdaten ist ein Fehler aufgetreten."
    />
  );
}
