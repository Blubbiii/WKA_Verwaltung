"use client";

/**
 * Dead-Letter-Queue Tab
 *
 * F18 (Audit 2026-07): Die Tabelle `FailedJob` wurde befuellt, aber nirgends
 * gelesen — endgueltig gescheiterte Jobs verschwanden lautlos. Das ist der
 * Lesepfad dazu: sehen, was gescheitert ist, warum, und es abhaken.
 */

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatDateTime } from "@/lib/format";
import { PAGE_SIZE_ADMIN } from "@/lib/config/pagination";

interface FailedJob {
  id: string;
  tenantId: string | null;
  queueName: string;
  jobName: string;
  jobId: string | null;
  payload: unknown;
  attemptsMade: number;
  error: string;
  stackTrace: string | null;
  failedAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

interface FailedJobsResponse {
  data: FailedJob[];
  summary: {
    openCount: number;
    byQueue: Array<{ queueName: string; count: number }>;
  };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function FailedJobsTab() {
  const t = useTranslations("admin.failedJobs");
  const queryClient = useQueryClient();

  const [queueFilter, setQueueFilter] = useState("ALL");
  const [resolvedFilter, setResolvedFilter] = useState("false");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const queryKey = [
    "/api/admin/failed-jobs",
    queueFilter,
    resolvedFilter,
    page,
  ] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE_ADMIN),
      });
      if (queueFilter !== "ALL") params.set("queue", queueFilter);
      if (resolvedFilter !== "ALL") params.set("resolved", resolvedFilter);

      const res = await fetch(`/api/admin/failed-jobs?${params}`, { signal });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as FailedJobsResponse;
    },
    staleTime: 30_000,
  });

  const setResolved = useMutation({
    mutationFn: async (input: { id: string; resolved: boolean; note?: string }) => {
      const res = await fetch(`/api/admin/failed-jobs/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolved: input.resolved,
          resolutionNote: input.note,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/failed-jobs"] });
      setNoteDraft("");
      toast.success(input.resolved ? t("markedResolved") : t("markedOpen"));
    },
    onError: (err) => toast.error(err.message || t("updateFailed")),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">{t("loadError")}</p>
        </div>
      </div>
    );
  }

  const jobs = data?.data ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;
  const queueOptions = summary?.byQueue.map((q) => q.queueName) ?? [];

  return (
    <div className="space-y-4 pt-4">
      {/* Offene Fehlschlaege — die Zahl, die zaehlt */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("openTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary && summary.openCount === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {t("noOpenFailures")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">
                {t("openCount", { count: summary?.openCount ?? 0 })}
              </Badge>
              {summary?.byQueue.map((q) => (
                <Badge key={q.queueName} variant="outline">
                  {q.queueName}: {q.count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={queueFilter}
          onValueChange={(v) => {
            setQueueFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("filterQueue")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("allQueues")}</SelectItem>
            {queueOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={resolvedFilter}
          onValueChange={(v) => {
            setResolvedFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">{t("filterOpen")}</SelectItem>
            <SelectItem value="true">{t("filterResolved")}</SelectItem>
            <SelectItem value="ALL">{t("filterAll")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {jobs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8" />
            <p className="text-sm">{t("empty")}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t("table.failedAt")}</TableHead>
                <TableHead>{t("table.queue")}</TableHead>
                <TableHead>{t("table.job")}</TableHead>
                <TableHead className="text-right">{t("table.attempts")}</TableHead>
                <TableHead>{t("table.error")}</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const expanded = expandedId === job.id;
                return (
                  <Fragment key={job.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => {
                        setExpandedId(expanded ? null : job.id);
                        setNoteDraft(job.resolutionNote ?? "");
                      }}
                    >
                      <TableCell>
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(job.failedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{job.queueName}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{job.jobName}</span>
                        {job.jobId && (
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {job.jobId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {job.attemptsMade}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm text-destructive">
                        {job.error}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {job.resolved ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={setResolved.isPending}
                            onClick={() =>
                              setResolved.mutate({ id: job.id, resolved: false })
                            }
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            {t("reopen")}
                          </Button>
                        ) : (
                          <Badge variant="destructive">{t("statusOpen")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>

                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="space-y-3 py-2">
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                {t("detail.error")}
                              </p>
                              <p className="text-sm text-destructive">{job.error}</p>
                            </div>

                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                {t("detail.payload")}
                              </p>
                              <pre className="max-h-64 overflow-auto rounded bg-background p-2 text-xs">
                                {JSON.stringify(job.payload, null, 2)}
                              </pre>
                            </div>

                            {job.stackTrace && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  {t("detail.stackTrace")}
                                </p>
                                <pre className="max-h-64 overflow-auto rounded bg-background p-2 text-xs">
                                  {job.stackTrace}
                                </pre>
                              </div>
                            )}

                            {job.resolved ? (
                              <p className="text-xs text-muted-foreground">
                                {t("detail.resolvedAt", {
                                  date: job.resolvedAt
                                    ? formatDateTime(job.resolvedAt)
                                    : "—",
                                })}
                                {job.resolutionNote ? ` · ${job.resolutionNote}` : ""}
                              </p>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  placeholder={t("detail.notePlaceholder")}
                                  maxLength={2000}
                                  className="max-w-md"
                                />
                                <Button
                                  size="sm"
                                  disabled={setResolved.isPending}
                                  onClick={() =>
                                    setResolved.mutate({
                                      id: job.id,
                                      resolved: true,
                                      note: noteDraft.trim() || undefined,
                                    })
                                  }
                                >
                                  {setResolved.isPending && (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  )}
                                  {t("markResolved")}
                                </Button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("pagination", {
              page: pagination.page,
              totalPages: pagination.totalPages,
              total: pagination.total,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("prev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
