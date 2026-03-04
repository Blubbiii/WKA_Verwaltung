"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { ImportJob } from "./types";
import { STATUS_BADGE_COLORS, STATUS_LABELS, formatDateTime } from "./types";

export default function ScadaLogsTab() {
  const [logs, setLogs] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/import?limit=100");
      if (!res.ok) throw new Error("Fehler beim Laden der Protokolle");
      const data = await res.json();
      setLogs(data.data ?? data);
    } catch {
      toast.error("Fehler beim Laden der Protokolle");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Import-Protokolle</CardTitle>
            <CardDescription>
              Detaillierte Protokolle aller SCADA-Importe
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Startzeit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Standort</TableHead>
                <TableHead>Dateityp</TableHead>
                <TableHead className="text-right">Dateien</TableHead>
                <TableHead className="text-right">Importiert</TableHead>
                <TableHead className="text-right">Übersprungen</TableHead>
                <TableHead className="text-right">Fehlerhaft</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Keine Protokolle vorhanden
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(log.startedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE_COLORS[log.status] || ""}
                      >
                        {STATUS_LABELS[log.status] || log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {log.locationCode}
                    </TableCell>
                    <TableCell className="font-mono">{log.fileType}</TableCell>
                    <TableCell className="text-right font-mono">
                      {log.filesProcessed}/{log.filesTotal}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {log.recordsImported}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {log.recordsSkipped}
                    </TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      {log.recordsFailed}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
