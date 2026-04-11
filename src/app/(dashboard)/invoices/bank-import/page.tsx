"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import {
  CheckCircle2,
  CircleAlert,
  CircleMinus,
  Landmark,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MatchResult } from "@/lib/bank-import/types";

// ============================================================================
// TYPES
// ============================================================================

type PageState = "idle" | "loading" | "review" | "confirming" | "done";

interface ParseResponse {
  format: "MT940" | "CAMT054";
  count: number;
  highMatches: number;
  mediumMatches: number;
  matches: MatchResult[];
}

// ============================================================================
// HELPERS
// ============================================================================

function formatAmount(amount: number, currency = "EUR", locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

// formatDate → uses central formatDate from @/lib/format

// ============================================================================
// MATCH BADGE
// ============================================================================

function MatchBadge({
  result,
  labelAmount,
  labelNoMatch,
}: {
  result: MatchResult;
  labelAmount: string;
  labelNoMatch: string;
}) {
  if (result.confidence === "high") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">{result.matchedInvoiceNumber}</span>
      </span>
    );
  }

  if (result.confidence === "medium") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
        <CircleAlert className="h-4 w-4 shrink-0" />
        <span>
          {result.matchedInvoiceNumber}{" "}
          <span className="text-xs text-muted-foreground">({labelAmount})</span>
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <CircleMinus className="h-4 w-4 shrink-0" />
      <span>{labelNoMatch}</span>
    </span>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function BankImportPage() {
  const t = useTranslations("invoices.bankImport");
  const locale = useLocale();
  const amountLocale = locale === "en" ? "en-US" : "de-DE";
  const [state, setState] = useState<PageState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  // Map of matchIndex → selected (for confirmation)
  const [selectedMatches, setSelectedMatches] = useState<
    Map<number, boolean>
  >(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // UPLOAD & PARSE
  // ============================================================================

  const handleFile = useCallback(async (file: File) => {
    setState("loading");
    setParseResult(null);
    setSelectedMatches(new Map());

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/invoices/bank-import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t("parsingError"));
        setState("idle");
        return;
      }

      const result: ParseResponse = data;
      setParseResult(result);

      // Pre-select high-confidence matches
      const initial = new Map<number, boolean>();
      result.matches.forEach((m, i) => {
        if (m.confidence === "high" && m.matchedInvoiceId) {
          initial.set(i, true);
        }
      });
      setSelectedMatches(initial);

      setState("review");
    } catch {
      toast.error(t("uploadConnectionError"));
      setState("idle");
    }
  }, [t]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  // ============================================================================
  // CONFIRM
  // ============================================================================

  const handleConfirm = async () => {
    if (!parseResult) return;

    const confirmations = parseResult.matches
      .filter((m, i) => selectedMatches.get(i) && m.matchedInvoiceId)
      .map((m) => ({
        invoiceId: m.matchedInvoiceId!,
        paidAt: new Date(m.transaction.date).toISOString(),
        paymentReference: m.transaction.reference || undefined,
      }));

    if (confirmations.length === 0) {
      toast.warning(t("noMatchesSelected"));
      return;
    }

    setState("confirming");

    try {
      const res = await fetch("/api/invoices/bank-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmations }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t("confirmError"));
        setState("review");
        return;
      }

      if (data.confirmed > 0) {
        toast.success(t("confirmedCount", { count: data.confirmed }));
      }
      if (data.failed > 0) {
        toast.warning(t("failedCount", { count: data.failed }));
      }

      setState("done");
    } catch {
      toast.error(t("confirmConnectionError"));
      setState("review");
    }
  };

  const handleReset = () => {
    setState("idle");
    setParseResult(null);
    setSelectedMatches(new Map());
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const selectedCount = Array.from(selectableMatches(parseResult)).filter(
    (i) => selectedMatches.get(i)
  ).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Landmark className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("pageDescription")}
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      {(state === "idle" || state === "loading") && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`
                relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed
                p-12 text-center transition-colors cursor-pointer
                ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                }
                ${state === "loading" ? "pointer-events-none opacity-60" : ""}
              `}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".sta,.mt940,.txt,.xml"
                onChange={handleFileInput}
              />
              {state === "loading" ? (
                <>
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">
                    {t("analyzing")}
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {t("dropFilePrompt")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("acceptedFormats")}
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done state */}
      {state === "done" && (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">{t("importDone")}</p>
            <Button onClick={handleReset} variant="outline">
              {t("importAnother")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Review Table */}
      {(state === "review" || state === "confirming") && parseResult && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">
              {t("transactionsFound", { count: parseResult.count })}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {t("badgeHigh", { count: parseResult.highMatches })}
              </Badge>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {t("badgeMedium", { count: parseResult.mediumMatches })}
              </Badge>
              <Badge variant="secondary">
                {t("badgeOpen", { count: parseResult.count - parseResult.highMatches - parseResult.mediumMatches })}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleReset}
                title={t("resetTitle")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4" />
                  <TableHead>{t("colDate")}</TableHead>
                  <TableHead className="text-right">{t("colAmount")}</TableHead>
                  <TableHead>{t("colReference")}</TableHead>
                  <TableHead>{t("colMatchedInvoice")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parseResult.matches.map((match, i) => {
                  const canSelect =
                    match.confidence !== "none" && !!match.matchedInvoiceId;
                  const isSelected = !!selectedMatches.get(i);

                  return (
                    <TableRow
                      key={i}
                      className={
                        canSelect && isSelected
                          ? "bg-muted/30"
                          : undefined
                      }
                    >
                      {/* Checkbox */}
                      <TableCell className="pl-4">
                        {canSelect && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedMatches((prev) => {
                                const next = new Map(prev);
                                next.set(i, !!checked);
                                return next;
                              });
                            }}
                            disabled={state === "confirming"}
                          />
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(match.transaction.date)}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                        <span
                          className={
                            match.transaction.amount >= 0
                              ? "text-green-700 dark:text-green-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {formatAmount(
                            match.transaction.amount,
                            match.transaction.currency,
                            amountLocale
                          )}
                        </span>
                      </TableCell>

                      {/* Reference */}
                      <TableCell className="max-w-[280px]">
                        <p
                          className="text-sm truncate text-muted-foreground"
                          title={match.transaction.reference}
                        >
                          {match.transaction.reference || "—"}
                        </p>
                        {match.transaction.counterpartName && (
                          <p className="text-xs text-muted-foreground truncate">
                            {match.transaction.counterpartName}
                          </p>
                        )}
                      </TableCell>

                      {/* Match */}
                      <TableCell>
                        <MatchBadge
                          result={match}
                          labelAmount={t("matchAmount")}
                          labelNoMatch={t("noMatch")}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>

          {/* Footer action */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {t("selectedSummary", {
                selected: selectedCount,
                total: [...selectableMatches(parseResult)].length,
              })}
            </p>
            <Button
              onClick={handleConfirm}
              disabled={selectedCount === 0 || state === "confirming"}
            >
              {state === "confirming" ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t("processing")}
                </>
              ) : (
                t("confirmButton", { count: selectedCount })
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// UTILS
// ============================================================================

function* selectableMatches(result: ParseResponse | null): Generator<number> {
  if (!result) return;
  for (let i = 0; i < result.matches.length; i++) {
    const m = result.matches[i];
    if (m.confidence !== "none" && m.matchedInvoiceId) {
      yield i;
    }
  }
}
