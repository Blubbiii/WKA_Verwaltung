"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Loader2,
  Play,
  Clock,
  Power,
  PowerOff,
  AlertCircle,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { AutoImportStatusItem, AutoImportLogEntry } from "./types";
import { STATUS_BADGE_COLORS, STATUS_LABELS, formatDateTime } from "./types";

export default function ScadaAutoImportTab() {
  const t = useTranslations("energy.scada.autoImportTab");
  const tc = useTranslations("energy.scada.common");
  const intervalLabels: Record<string, string> = {
    HOURLY: t("intervalHourly"),
    DAILY: t("intervalDaily"),
    WEEKLY: t("intervalWeekly"),
  };
  const [statusItems, setStatusItems] = useState<AutoImportStatusItem[]>([]);
  const [logs, setLogs] = useState<AutoImportLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [togglingLocation, setTogglingLocation] = useState<string | null>(null);

  // Load auto-import status
  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/auto-import");
      if (!res.ok) throw new Error(t("toastErrorLoadingStatus"));
      const data = await res.json();
      setStatusItems(data.data ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toastErrorLoadingStatus"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Load auto-import logs
  const loadLogs = useCallback(async () => {
    setIsLogsLoading(true);
    try {
      const res = await fetch("/api/energy/scada/auto-import/logs?limit=10");
      if (!res.ok) throw new Error(t("toastErrorLoadingLogs"));
      const data = await res.json();
      setLogs(data.data ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toastErrorLoadingLogs"),
      );
    } finally {
      setIsLogsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadStatus();
    loadLogs();
  }, [loadStatus, loadLogs]);

  // Toggle auto-import for a location
  const handleToggle = async (locationCode: string, currentlyEnabled: boolean) => {
    setTogglingLocation(locationCode);
    try {
      const res = await fetch("/api/energy/scada/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: currentlyEnabled ? "disable" : "enable",
          locationCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toastErrorToggling"));
      }

      toast.success(
        currentlyEnabled
          ? t("toastDisabled", { locationCode })
          : t("toastEnabled", { locationCode }),
      );
      loadStatus();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toastErrorToggling"),
      );
    } finally {
      setTogglingLocation(null);
    }
  };

  // Change interval for a location
  const handleIntervalChange = async (locationCode: string, interval: string) => {
    try {
      const res = await fetch("/api/energy/scada/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          locationCode,
          interval,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toastErrorConfiguring"));
      }

      toast.success(t("toastIntervalSet", { interval: intervalLabels[interval] || interval }));
      loadStatus();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toastErrorConfiguring"),
      );
    }
  };

  // Trigger immediate auto-import
  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/energy/scada/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-now" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("toastErrorStarting"));
      }

      toast.success(t("toastBackgroundStarted"));

      // Reload logs after a delay to show new entry
      setTimeout(() => {
        loadLogs();
        loadStatus();
      }, 3000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toastErrorStarting"),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const enabledCount = statusItems.filter((s) => s.autoImportEnabled).length;

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t("cardTitle")}
              </CardTitle>
              <CardDescription>
                {t("cardDescription")}
                {enabledCount > 0
                  ? t("enabledCount", { count: enabledCount })
                  : t("noneEnabled")}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadStatus();
                  loadLogs();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                {tc("refresh")}
              </Button>
              <Button
                size="sm"
                onClick={handleRunNow}
                disabled={isRunning || enabledCount === 0}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {t("runNow")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statusItems.length === 0 && !isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("noMappings")}</p>
              <p className="text-sm mt-1">{t("createFirst")}</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colLocation")}</TableHead>
                    <TableHead>{t("colPark")}</TableHead>
                    <TableHead>{t("colAutoImport")}</TableHead>
                    <TableHead>{t("colInterval")}</TableHead>
                    <TableHead>{t("colLastImport")}</TableHead>
                    <TableHead>{t("colLastRecord")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    statusItems.map((item) => (
                      <TableRow key={item.locationCode}>
                        <TableCell className="font-mono font-medium">
                          {item.locationCode}
                        </TableCell>
                        <TableCell>{item.parkName}</TableCell>
                        <TableCell>
                          <Switch
                            checked={item.autoImportEnabled}
                            onCheckedChange={() =>
                              handleToggle(item.locationCode, item.autoImportEnabled)
                            }
                            disabled={togglingLocation === item.locationCode}
                          />
                        </TableCell>
                        <TableCell>
                          {item.autoImportEnabled ? (
                            <Select
                              value={item.autoImportInterval}
                              onValueChange={(val) =>
                                handleIntervalChange(item.locationCode, val)
                              }
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="HOURLY">{t("intervalHourly")}</SelectItem>
                                <SelectItem value="DAILY">{t("intervalDaily")}</SelectItem>
                                <SelectItem value="WEEKLY">{t("intervalWeekly")}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-sm">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.lastAutoImport
                            ? formatDateTime(item.lastAutoImport)
                            : "--"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.lastDataTimestamp
                            ? formatDateTime(item.lastDataTimestamp)
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {item.autoImportEnabled ? (
                            <Badge
                              variant="outline"
                              className="bg-green-100 text-green-800 border-green-200"
                            >
                              <Power className="h-3 w-3 mr-1" />
                              {t("active")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-100 text-gray-600 border-gray-200"
                            >
                              <PowerOff className="h-3 w-3 mr-1" />
                              {t("inactive")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Import Log History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("logsCardTitle")}</CardTitle>
              <CardDescription>{t("logsCardDescription")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadLogs}
              disabled={isLogsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLogsLoading ? "animate-spin" : ""}`} />
              {tc("refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colStartTime")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colFound")}</TableHead>
                  <TableHead className="text-right">{t("colImported")}</TableHead>
                  <TableHead className="text-right">{t("colSkipped")}</TableHead>
                  <TableHead>{t("colSummary")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLogsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {t("noLogs")}
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
                      <TableCell className="text-right font-mono">
                        {log.filesFound}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.filesImported}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.filesSkipped}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate" title={log.summary || ""}>
                        {log.summary || "--"}
                        {log.errors && Array.isArray(log.errors) && log.errors.length > 0 && (
                          <span className="ml-2 text-destructive">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            {t("errorsCount", { count: log.errors.length })}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
