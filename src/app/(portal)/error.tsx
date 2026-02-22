"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <AlertCircle className="h-16 w-16 text-destructive" />
      <h2 className="text-2xl font-semibold">Ein Fehler ist aufgetreten</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Es tut uns leid, aber bei der Verarbeitung Ihrer Anfrage ist ein
        unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground font-mono">
          Fehler-ID: {error.digest}
        </p>
      )}
      <div className="flex gap-4">
        <Button onClick={() => reset()} variant="default">
          <RefreshCw className="mr-2 h-4 w-4" />
          Erneut versuchen
        </Button>
        <Button asChild variant="outline">
          <Link href="/portal">{`Zur\u00FCck zur Startseite`}</Link>
        </Button>
      </div>
    </div>
  );
}
