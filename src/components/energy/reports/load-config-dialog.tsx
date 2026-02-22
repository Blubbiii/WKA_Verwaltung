"use client";

import { useState, useEffect } from "react";
import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";
import type { ReportConfig } from "./save-config-dialog";

// =============================================================================
// Types
// =============================================================================

interface SavedConfig {
  id: string;
  name: string;
  description: string | null;
  portalVisible: boolean;
  portalLabel: string | null;
  config: ReportConfig;
  createdAt: string;
}

interface LoadConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (config: ReportConfig) => void;
}

// =============================================================================
// Component
// =============================================================================

export function LoadConfigDialog({
  open,
  onOpenChange,
  onLoad,
}: LoadConfigDialogProps) {
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchConfigs();
    }
  }, [open]);

  async function fetchConfigs() {
    setLoading(true);
    try {
      const res = await fetch("/api/energy/reports/configs");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setConfigs(data.data ?? data ?? []);
    } catch {
      toast.error("Fehler beim Laden der Konfigurationen");
    } finally {
      setLoading(false);
    }
  }

  function handleLoad(config: SavedConfig) {
    onLoad(config.config);
    onOpenChange(false);
    toast.success(`Konfiguration "${config.name}" geladen`);
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      const res = await fetch(`/api/energy/reports/configs/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Fehler beim Loeschen");

      setConfigs((prev) => prev.filter((c) => c.id !== deleteId));
      toast.success("Konfiguration geloescht");
    } catch {
      toast.error("Fehler beim Loeschen der Konfiguration");
    } finally {
      setDeleteId(null);
    }
  }

  function formatDate(dateString: string): string {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(dateString));
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Konfiguration laden
            </DialogTitle>
            <DialogDescription>
              Waehlen Sie eine gespeicherte Berichtskonfiguration aus.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FolderOpen className="h-10 w-10 mb-3" />
                <p className="text-sm">Keine gespeicherten Konfigurationen vorhanden</p>
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((config, idx) => (
                  <div key={config.id}>
                    {idx > 0 && <Separator className="my-2" />}
                    <div className="flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => handleLoad(config)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {config.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {config.config.modules.length} Module
                          </Badge>
                        </div>
                        {config.description && (
                          <p className="text-xs text-muted-foreground mb-1">
                            {config.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {config.config.parkId && (
                            <span>Park-Filter aktiv</span>
                          )}
                          <span>{formatDate(config.createdAt)}</span>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(config.id)}
                        aria-label={`${config.name} loeschen`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(value) => {
          if (!value) setDeleteId(null);
        }}
        onConfirm={handleDelete}
        title="Konfiguration loeschen"
        description="Moechten Sie diese Konfiguration wirklich loeschen?"
      />
    </>
  );
}
