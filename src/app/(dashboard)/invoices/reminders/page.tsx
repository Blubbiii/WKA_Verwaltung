"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MailCheck,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ============================================================================
// TYPES
// ============================================================================

interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  grossAmount: string;
  dueDate: string;
  daysOverdue: number;
  reminderLevel: number | null;
  reminderSentAt: string | null;
  nextReminderLevel: 1 | 2 | 3;
  recipientName: string | null;
  recipientEmail: string | null;
  fund: { id: string; name: string } | null;
  park: { id: string; name: string } | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatAmount(value: string | number, locale = "de-DE"): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(n);
}

// formatDate → uses central formatDate from @/lib/format

function getLevelBadgeClass(level: number | null): string {
  if (!level) return "";
  if (level === 1) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  if (level === 2) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

function getOverdueBadgeClass(days: number): string {
  if (days <= 14) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (days <= 30) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function RemindersPage() {
  const t = useTranslations("invoices.reminders");
  const locale = useLocale();
  const amountLocale = locale === "en" ? "en-US" : "de-DE";
  const [invoices, setInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());

  const reminderLevelLabel = useCallback(
    (level: number | null): string => {
      if (!level) return t("levelDash");
      if (level === 1) return t("level1");
      if (level === 2) return t("level2");
      if (level === 3) return t("level3");
      return t("levelOther", { level });
    },
    [t]
  );

  const nextLevelLabel = useCallback(
    (level: 1 | 2 | 3): string => {
      if (level === 1) return t("nextLevel1");
      if (level === 2) return t("nextLevel2");
      return t("nextLevel3");
    },
    [t]
  );

  const nextLevelShortLabel = useCallback(
    (level: 1 | 2 | 3): string => {
      if (level === 1) return t("level1");
      if (level === 2) return t("level2");
      return t("level3");
    },
    [t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices/reminders");
      if (!res.ok) {
        toast.error(t("loadError"));
        return;
      }
      setInvoices(await res.json());
      setSelected(new Set());
    } catch {
      toast.error(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Send single reminder ----
  const sendReminder = useCallback(
    async (invoice: OverdueInvoice, level: 1 | 2 | 3) => {
      setSending((prev) => new Set(prev).add(invoice.id));
      try {
        const res = await fetch(`/api/invoices/${invoice.id}/send-reminder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminderLevel: level }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || t("sendError"));
        } else {
          toast.success(
            t("sentSuccess", {
              label: nextLevelShortLabel(level),
              number: invoice.invoiceNumber,
            })
          );
          await load();
        }
      } catch {
        toast.error(t("connectionError"));
      } finally {
        setSending((prev) => {
          const next = new Set(prev);
          next.delete(invoice.id);
          return next;
        });
      }
    },
    [load, t, nextLevelShortLabel]
  );

  // ---- Batch send ----
  const sendBatch = useCallback(async () => {
    const toSend = invoices.filter((inv) => selected.has(inv.id));
    if (toSend.length === 0) return;

    setSending(new Set(toSend.map((i) => i.id)));

    let ok = 0;
    let failed = 0;

    for (const inv of toSend) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/send-reminder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminderLevel: inv.nextReminderLevel }),
        });
        if (res.ok) {
          ok++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setSending(new Set());

    if (ok > 0) toast.success(t("batchSent", { count: ok }));
    if (failed > 0) toast.warning(t("batchFailed", { count: failed }));

    await load();
  }, [invoices, selected, load, t]);

  // ============================================================================
  // COMPUTE KPIs
  // ============================================================================

  const kpis = {
    total: invoices.length,
    noReminder: invoices.filter((i) => !i.reminderLevel).length,
    level2Due: invoices.filter((i) => i.reminderLevel === 1 && i.daysOverdue >= 21).length,
    critical: invoices.filter((i) => i.daysOverdue >= 42).length,
  };

  const allSelectable = invoices.filter((i) => !sending.has(i.id));
  const allSelected =
    allSelectable.length > 0 && allSelectable.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allSelectable.map((i) => i.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("pageDescription")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("kpiTotal")}</p>
            <p className="text-3xl font-bold mt-1">{loading ? "—" : kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("kpiNoReminder")}</p>
            <p className="text-3xl font-bold mt-1 text-blue-600 dark:text-blue-400">
              {loading ? "—" : kpis.noReminder}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("kpiLevel2Due")}</p>
            <p className="text-3xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              {loading ? "—" : kpis.level2Due}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{t("kpiCritical")}</p>
            <p className="text-3xl font-bold mt-1 text-red-600 dark:text-red-400">
              {loading ? "—" : kpis.critical}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            {t("overdueCount", { count: invoices.length })}
          </CardTitle>
          {someSelected && (
            <Button
              size="sm"
              onClick={sendBatch}
              disabled={sending.size > 0}
            >
              {sending.size > 0 ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <MailCheck className="h-4 w-4 mr-2" />
              )}
              {t("dunCount", { count: selected.size })}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-3" />
              {t("loadingIndicator")}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-sm font-medium">{t("noOverdue")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label={t("selectAllAria")}
                    />
                  </TableHead>
                  <TableHead>{t("colInvoice")}</TableHead>
                  <TableHead className="text-right">{t("colAmount")}</TableHead>
                  <TableHead>{t("colDue")}</TableHead>
                  <TableHead>{t("colOverdue")}</TableHead>
                  <TableHead>{t("colRecipient")}</TableHead>
                  <TableHead>{t("colReminderLevel")}</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const isSending = sending.has(inv.id);
                  const isSelected = selected.has(inv.id);

                  return (
                    <TableRow
                      key={inv.id}
                      className={isSelected ? "bg-muted/30" : undefined}
                    >
                      {/* Checkbox */}
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(inv.id)}
                          disabled={isSending}
                        />
                      </TableCell>

                      {/* Invoice number */}
                      <TableCell>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium text-sm hover:underline flex items-center gap-1"
                        >
                          {inv.invoiceNumber}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </Link>
                        {inv.fund && (
                          <p className="text-xs text-muted-foreground">{inv.fund.name}</p>
                        )}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                        {formatAmount(inv.grossAmount, amountLocale)}
                      </TableCell>

                      {/* Due date */}
                      <TableCell className="text-sm whitespace-nowrap">
                        {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                      </TableCell>

                      {/* Days overdue */}
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getOverdueBadgeClass(inv.daysOverdue)}
                        >
                          <TriangleAlert className="h-3 w-3 mr-1" />
                          {t("daysOverdue", { count: inv.daysOverdue })}
                        </Badge>
                      </TableCell>

                      {/* Recipient */}
                      <TableCell className="text-sm max-w-[160px]">
                        <p className="truncate">{inv.recipientName || "—"}</p>
                        {inv.recipientEmail && (
                          <p className="text-xs text-muted-foreground truncate">
                            {inv.recipientEmail}
                          </p>
                        )}
                      </TableCell>

                      {/* Reminder level */}
                      <TableCell>
                        {inv.reminderLevel ? (
                          <div className="space-y-0.5">
                            <Badge
                              variant="secondary"
                              className={getLevelBadgeClass(inv.reminderLevel)}
                            >
                              {reminderLevelLabel(inv.reminderLevel)}
                            </Badge>
                            {inv.reminderSentAt && (
                              <p className="text-xs text-muted-foreground">
                                {formatDate(inv.reminderSentAt)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSending}
                            >
                              {isSending ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                  {t("sending")}
                                </>
                              ) : (
                                <>
                                  <MailCheck className="h-3.5 w-3.5 mr-1.5" />
                                  {t("dun")}
                                </>
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {([1, 2, 3] as const).map((level) => (
                              <DropdownMenuItem
                                key={level}
                                onClick={() => sendReminder(inv, level)}
                                disabled={
                                  !!inv.reminderLevel && level < inv.reminderLevel
                                }
                              >
                                {nextLevelLabel(level)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
