"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertCircle, ArrowLeft, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Optional override for the headline. */
  title?: string;
  /** Optional override for the supporting text. */
  description?: string;
}

/**
 * Shared route-level error boundary used by all `app/**\/error.tsx` files.
 *
 * Centralising this avoids 100+ duplicated `error.tsx` implementations that
 * tend to drift apart on i18n strings, accessibility attributes and Sentry
 * reporting.
 *
 * a11y notes:
 * - The wrapper is `role="alert"` + `aria-live="assertive"` so screen readers
 *   announce the error as soon as the boundary mounts.
 * - The Sentry digest is rendered with `aria-label` so it is read as
 *   "Fehler-ID" instead of a meaningless hex string.
 */
export function RouteErrorBoundary({
  error,
  reset,
  title = "Ein Fehler ist aufgetreten",
  description = "Bitte versuchen Sie es erneut oder kehren Sie zum Dashboard zurueck.",
}: RouteErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-[400px] items-center justify-center p-8"
    >
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === "development" && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm font-mono text-muted-foreground break-all">
                {error.message}
              </p>
            </div>
          )}
          {error.digest && (
            <p
              className="text-xs text-center text-muted-foreground font-mono"
              aria-label={`Fehler-ID ${error.digest}`}
            >
              Fehler-ID: {error.digest}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => reset()} variant="default" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Erneut versuchen
            </Button>
            <Button
              onClick={() => window.history.back()}
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Zurueck
            </Button>
            <Button
              onClick={() => {
                window.location.href = "/dashboard";
              }}
              variant="outline"
              size="sm"
            >
              <Home className="mr-2 h-4 w-4" aria-hidden="true" />
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RouteErrorBoundary;
