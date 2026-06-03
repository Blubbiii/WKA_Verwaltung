"use client";

import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      {...props}
      title="Fehler bei Benachrichtigungen"
      description="Beim Laden der Benachrichtigungen ist ein Fehler aufgetreten."
    />
  );
}
