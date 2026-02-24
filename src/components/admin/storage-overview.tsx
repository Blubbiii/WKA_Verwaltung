"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { HardDrive, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface StorageBreakdownItem {
  category: string;
  label: string;
  count: number;
  totalBytes: number;
  totalFormatted: string;
}

interface StorageData {
  usedBytes: number;
  limitBytes: number;
  usedFormatted: string;
  limitFormatted: string;
  percentUsed: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
  breakdown: StorageBreakdownItem[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StorageOverview() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const fetchStorageInfo = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/storage");
      if (!res.ok) {
        throw new Error("Fehler beim Laden der Speicherinformationen");
      }
      const storageData = await res.json();
      setData(storageData);
    } catch {
      toast.error("Speicherinformationen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStorageInfo();
  }, [fetchStorageInfo]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      const res = await fetch("/api/admin/storage", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Fehler beim Neuberechnen");
      }
      toast.success("Speicherverbrauch wurde neu berechnet");
      // Refresh the data
      await fetchStorageInfo();
    } catch {
      toast.error("Neuberechnung fehlgeschlagen");
    } finally {
      setRecalculating(false);
    }
  };

  // Determine progress bar color class based on usage percentage
  const getProgressColorClass = (percent: number): string => {
    if (percent >= 90) return "[&>div]:bg-red-500";
    if (percent >= 70) return "[&>div]:bg-yellow-500";
    return "[&>div]:bg-green-500";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Speicherplatz
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Speicherinformationen konnten nicht geladen werden.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Speicherplatz
            </CardTitle>
            <CardDescription>
              Speicherverbrauch des Mandanten
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            {recalculating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Neu berechnen
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage summary */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {data.usedFormatted} von {data.limitFormatted} verwendet
            </span>
            <span className="text-muted-foreground">
              {data.percentUsed}%
            </span>
          </div>

          <Progress
            value={Math.min(data.percentUsed, 100)}
            className={`h-3 ${getProgressColorClass(data.percentUsed)}`}
          />

          {/* Warning badges */}
          {data.isOverLimit && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>Speicherlimit überschritten! Neue Uploads sind blockiert.</span>
            </div>
          )}
          {data.isNearLimit && !data.isOverLimit && (
            <div className="flex items-center gap-2 text-sm text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              <span>Speicher fast voll. Bitte nicht benötigte Dateien löschen.</span>
            </div>
          )}
        </div>

        {/* Breakdown by category */}
        {data.breakdown.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Aufschluesselung nach Kategorie
            </h4>
            <div className="space-y-2">
              {data.breakdown.map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{item.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {item.count} {item.count === 1 ? "Datei" : "Dateien"}
                    </Badge>
                  </div>
                  <span className="font-mono text-muted-foreground">
                    {item.totalFormatted}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.breakdown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Noch keine Dateien gespeichert.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
