"use client";

/**
 * Anteilsübertragungen und Gesellschafterliste zum Stichtag.
 *
 * A8 (Audit 2026-07): Der Anteilsübergang war nicht abgebildet — beim Verkauf
 * wurde der Stammsatz überschrieben. Die Gesellschafterliste zum letzten
 * Bilanzstichtag war danach nicht mehr rekonstruierbar.
 *
 * ## Warum der Vollzug ein eigener Knopf ist
 *
 * Anlegen und Vollziehen sind zwei Vorgänge. Bei vinkulierten Anteilen ist die
 * Übertragung ohne Zustimmung schwebend unwirksam — sie darf erfasst, aber
 * nicht gebucht werden. Ein einziger „Speichern"-Knopf würde diesen
 * Unterschied verwischen, und der Anteilsverlauf trüge dann eine Übertragung,
 * die gesellschaftsvertraglich noch scheitern kann.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";
import { formatCurrency } from "@/lib/format";

interface PersonRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  personType: string;
}

interface ShareholderRef {
  id: string;
  shareholderNumber: string | null;
  person: PersonRef;
}

interface Transfer {
  id: string;
  transferNumber: string;
  type: "SALE" | "GIFT" | "INHERITANCE" | "REDEMPTION" | "ISSUE";
  status: "DRAFT" | "PENDING_CONSENT" | "EXECUTED" | "CANCELLED";
  effectiveDate: string;
  sharePercent: string;
  priceEur: string | null;
  consentRequired: boolean;
  consentGrantedAt: string | null;
  fromShareholder: ShareholderRef | null;
  toShareholder: ShareholderRef | null;
}

interface RegisterEntry {
  shareholderId: string;
  shareholderNumber: string | null;
  person: PersonRef | null;
  sharePercent: number;
  capitalContribution: number | null;
}

interface RegisterResponse {
  date: string;
  source: "SHARE_HISTORY" | "MASTER_DATA_FALLBACK";
  entries: RegisterEntry[];
  sumPercent: number;
  warnings: string[];
}

function personName(person: PersonRef | null): string {
  if (!person) return "–";
  return (
    person.companyName || [person.firstName, person.lastName].filter(Boolean).join(" ") || "–"
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ShareTransfersCard({ fundId }: { fundId: string }) {
  const t = useTranslations("shareTransfers");
  const invalidate = useInvalidateQuery();

  const [registerDate, setRegisterDate] = useState(today);
  const [executing, setExecuting] = useState<string | null>(null);

  const { data: transfersData, isLoading } = useApiQuery<{ transfers: Transfer[] }>(
    ["share-transfers", fundId],
    `/api/share-transfers?fundId=${fundId}`,
  );
  const transfers = transfersData?.transfers ?? [];

  const { data: register } = useApiQuery<RegisterResponse>(
    ["share-register", fundId, registerDate],
    `/api/funds/${fundId}/share-register?date=${registerDate}`,
  );

  async function execute(transfer: Transfer) {
    setExecuting(transfer.id);
    try {
      const res = await fetch(`/api/share-transfers/${transfer.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok) {
        // Die Begründung ist die genaue — fehlende Zustimmung, falsche
        // Reihenfolge der Stichtage, zu hohe Quote.
        throw new Error(result.message || t("executeError"));
      }

      invalidate(["share-transfers", fundId]);
      invalidate(["share-register", fundId, registerDate]);

      if (result.warnings?.length > 0) {
        toast.warning(t("executed", { number: transfer.transferNumber }), {
          description: result.warnings.slice(0, 2).join(" · "),
          duration: 15_000,
        });
      } else {
        toast.success(t("executed", { number: transfer.transferNumber }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("executeError"), {
        duration: 15_000,
      });
    } finally {
      setExecuting(null);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowLeftRight className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {/* Gesellschafterliste zum Stichtag */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="registerDate">
                {t("registerDate")}
              </Label>
              <Input
                id="registerDate"
                type="date"
                className="w-44"
                value={registerDate}
                onChange={(e) => setRegisterDate(e.target.value || today())}
              />
            </div>
            {register && (
              <span className="pb-2 text-xs text-muted-foreground">
                {t(`sources.${register.source}`)}
              </span>
            )}
          </div>

          {register && register.entries.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("register.shareholder")}</TableHead>
                    <TableHead className="text-right">{t("register.share")}</TableHead>
                    <TableHead className="text-right">{t("register.capital")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {register.entries.map((entry) => (
                    <TableRow key={entry.shareholderId}>
                      <TableCell className="text-xs">
                        {personName(entry.person)}
                        {entry.shareholderNumber && (
                          <span className="ml-1 font-mono text-muted-foreground">
                            {entry.shareholderNumber}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {entry.sharePercent.toFixed(2).replace(".", ",")} %
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {entry.capitalContribution !== null
                          ? formatCurrency(entry.capitalContribution)
                          : "–"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell className="text-xs">{t("register.total")}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {register.sumPercent.toFixed(2).replace(".", ",")} %
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("registerEmpty")}</p>
          )}

          {/* Eine Summe unter 100 % ist nicht zwingend ein Fehler — eingezogene
              Anteile sehen genau so aus. Sie zu verschweigen wäre falsch. */}
          {register?.warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-600">
              {warning}
            </p>
          ))}
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium">{t("transfersTitle")}</p>

          {transfers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("transfersEmpty")}</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.number")}</TableHead>
                    <TableHead>{t("table.type")}</TableHead>
                    <TableHead>{t("table.parties")}</TableHead>
                    <TableHead className="text-right">{t("table.share")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer) => {
                    const pending = transfer.status === "DRAFT" || transfer.status === "PENDING_CONSENT";
                    const consentMissing = transfer.consentRequired && !transfer.consentGrantedAt;
                    return (
                      <TableRow key={transfer.id}>
                        <TableCell className="text-xs">
                          <span className="font-mono">{transfer.transferNumber}</span>
                          <br />
                          <span className="text-muted-foreground">
                            {new Date(transfer.effectiveDate).toLocaleDateString("de-DE")}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{t(`types.${transfer.type}`)}</TableCell>
                        <TableCell className="text-xs">
                          {personName(transfer.fromShareholder?.person ?? null)}
                          {" → "}
                          {transfer.type === "REDEMPTION"
                            ? t("redeemed")
                            : personName(transfer.toShareholder?.person ?? null)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {Number(transfer.sharePercent).toFixed(2).replace(".", ",")} %
                          {transfer.priceEur && (
                            <>
                              <br />
                              <span className="text-muted-foreground">
                                {formatCurrency(Number(transfer.priceEur))}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              transfer.status === "EXECUTED"
                                ? "secondary"
                                : transfer.status === "CANCELLED"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-xs"
                          >
                            {t(`statuses.${transfer.status}`)}
                          </Badge>
                          {consentMissing && pending && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                              <CalendarClock className="h-3 w-3" aria-hidden />
                              {t("consentMissing")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {pending && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={executing === transfer.id || consentMissing}
                              title={consentMissing ? t("consentBlocks") : undefined}
                              onClick={() => void execute(transfer)}
                            >
                              {executing === transfer.id ? (
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-2 h-3 w-3" />
                              )}
                              {t("execute")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t("executeHint")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
