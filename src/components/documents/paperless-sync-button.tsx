"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  FileArchive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// =============================================================================
// TYPES
// =============================================================================

interface PaperlessSyncButtonProps {
  documentId: string;
  syncStatus?: string | null;
  syncError?: string | null;
  paperlessDocumentId?: number | null;
  onSyncStarted?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PaperlessSyncButton({
  documentId,
  syncStatus,
  syncError,
  paperlessDocumentId,
  onSyncStarted,
}: PaperlessSyncButtonProps) {
  const { flags } = useFeatureFlags();
  const [syncing, setSyncing] = useState(false);

  // Don't render if Paperless is not enabled
  if (!flags.paperless) {
    return null;
  }

  async function handleSync() {
    try {
      setSyncing(true);
      const res = await fetch("/api/integrations/paperless/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Fehler" }));
        throw new Error(data.error || "Fehler beim Senden an Paperless");
      }

      toast.success("Dokument wird an Paperless-ngx gesendet...");
      onSyncStarted?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Senden an Paperless"
      );
    } finally {
      setSyncing(false);
    }
  }

  // Show status badge for already-synced documents
  if (syncStatus === "SYNCED") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100">
              <CheckCircle2 className="h-3 w-3" />
              Archiviert
              {paperlessDocumentId && (
                <span className="text-xs opacity-70">#{paperlessDocumentId}</span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            In Paperless-ngx archiviert
            {paperlessDocumentId && ` (Dokument #${paperlessDocumentId})`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Show pending status
  if (syncStatus === "PENDING") {
    return (
      <Badge variant="secondary" className="gap-1 text-amber-700 bg-amber-100">
        <Loader2 className="h-3 w-3 animate-spin" />
        Wird synchronisiert...
      </Badge>
    );
  }

  // Show failed status with retry
  if (syncStatus === "FAILED") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="gap-1 text-red-700 border-red-200 hover:bg-red-50"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Erneut senden
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Synchronisierung fehlgeschlagen</p>
            {syncError && <p className="text-xs opacity-80">{syncError}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default: Send to Paperless button
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
    >
      {syncing ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileArchive className="mr-2 h-4 w-4" />
      )}
      An Paperless senden
    </Button>
  );
}
