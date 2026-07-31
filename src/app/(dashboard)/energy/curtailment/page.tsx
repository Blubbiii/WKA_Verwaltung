"use client";

/**
 * Abregelungen und Entschädigungsforderungen.
 *
 * A4 (Audit 2026-07): Abregelung war im System nicht abgebildet — weder die
 * Ausfallarbeit noch die Forderung dagegen.
 *
 * ## Warum das eine Forderungsliste ist und keine Ereignisliste
 *
 * Der Netzbetreiber zahlt, was er selbst gerechnet hat. Der Zweck des Vorgangs
 * ist der Abgleich: Anspruch gegen Zahlung, eigene Ausfallarbeit gegen die
 * gemeldete. Eine reine Chronik der Ereignisse würde genau das nicht zeigen.
 *
 * ## Die Frist steht neben dem Betrag
 *
 * Ein Anspruch verjährt, während die Zeile in der Liste unverändert dasteht.
 * Deshalb sind ablaufende und abgelaufene Fristen hier hervorgehoben und nicht
 * in einem Detailfeld versteckt.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, Clock, Euro, Wind } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiQuery } from "@/hooks/useApiQuery";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAGE_SIZE_DEFAULT } from "@/lib/config/pagination";

const CLAIM_STATUSES = [
  "OPEN",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PARTIALLY_PAID",
  "PAID",
  "REJECTED",
  "TIME_BARRED",
] as const;

/** Vorlauf, ab dem eine Frist als ablaufend gilt. */
const DEADLINE_WARN_DAYS = 90;

interface CurtailmentEvent {
  id: string;
  eventNumber: string;
  startAt: string;
  endAt: string | null;
  legalBasis: "EEG_15" | "ENWG_13A" | "OTHER";
  gridOperator: string | null;
  reason: string | null;
  lostWorkKwh: string | null;
  gridOperatorReportedKwh: string | null;
  claimEur: string | null;
  compensationPaidEur: string | null;
  claimStatus: string;
  claimDeadline: string | null;
  park: { id: string; name: string; shortName: string | null };
  turbine: { id: string; designation: string } | null;
}

interface Response {
  data: CurtailmentEvent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  totals: { claimedEur: number; paidEur: number; openEur: number; lostWorkKwh: number };
}

export default function CurtailmentPage() {
  const t = useTranslations("curtailment");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("ALL");
  const [openOnly, setOpenOnly] = useState(false);

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE_DEFAULT) });
  if (status !== "ALL") query.set("claimStatus", status);
  if (openOnly) query.set("openOnly", "true");

  const { data, isLoading, error } = useApiQuery<Response>(
    ["curtailment", query.toString()],
    `/api/curtailment?${query.toString()}`,
  );

  const events = data?.data ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      {totals && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={<Euro className="h-5 w-5" />} label={t("totals.claimed")} value={formatCurrency(totals.claimedEur)} />
          <Tile icon={<Euro className="h-5 w-5" />} label={t("totals.paid")} value={formatCurrency(totals.paidEur)} />
          <Tile
            icon={<AlertTriangle className="h-5 w-5" />}
            label={t("totals.open")}
            value={formatCurrency(totals.openEur)}
            emphasis={totals.openEur > 0}
            hint={t("totals.openHint")}
          />
          <Tile
            icon={<Wind className="h-5 w-5" />}
            label={t("totals.lostWork")}
            value={`${Math.round(totals.lostWorkKwh / 1000).toLocaleString("de-DE")} MWh`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t("filterStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filterAll")}</SelectItem>
            {CLAIM_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`statuses.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={openOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setOpenOnly((current) => !current);
            setPage(1);
          }}
        >
          {t("filterOpenOnly")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <EmptyState icon={AlertTriangle} title={t("loadError")} description={t("loadErrorHint")} />
      ) : events.length === 0 ? (
        <EmptyState icon={Ban} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.event")}</TableHead>
                  <TableHead>{t("table.park")}</TableHead>
                  <TableHead>{t("table.basis")}</TableHead>
                  <TableHead className="text-right">{t("table.lostWork")}</TableHead>
                  <TableHead className="text-right">{t("table.claim")}</TableHead>
                  <TableHead className="text-right">{t("table.paid")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.deadline")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            pagination={data?.pagination}
            onPageChange={setPage}
            disabled={isLoading}
          />
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("enwgHint")}</p>
    </div>
  );
}

function EventRow({ event }: { event: CurtailmentEvent }) {
  const t = useTranslations("curtailment");

  const claim = event.claimEur !== null ? Number(event.claimEur) : null;
  const paid = event.compensationPaidEur !== null ? Number(event.compensationPaidEur) : null;
  const own = event.lostWorkKwh !== null ? Number(event.lostWorkKwh) : null;
  const reported =
    event.gridOperatorReportedKwh !== null ? Number(event.gridOperatorReportedKwh) : null;

  // Die Abweichung zur Meldung des Netzbetreibers ist der Anlass für eine
  // Nachfrage — sie gehört an die Zahl und nicht in ein Detailblatt.
  const deviationPercent =
    own !== null && reported !== null && own > 0 ? ((reported - own) / own) * 100 : null;

  const deadline = event.claimDeadline ? new Date(event.claimDeadline) : null;
  const daysLeft = deadline
    ? Math.round((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  const settled = event.claimStatus === "PAID" || event.claimStatus === "REJECTED";

  return (
    <TableRow>
      <TableCell className="text-xs">
        <span className="font-mono">{event.eventNumber}</span>
        <br />
        <span className="text-muted-foreground">{formatDate(event.startAt)}</span>
      </TableCell>
      <TableCell className="text-xs">
        {event.park.shortName || event.park.name}
        {event.turbine && <span className="text-muted-foreground"> · {event.turbine.designation}</span>}
      </TableCell>
      <TableCell className="text-xs">{t(`bases.${event.legalBasis}`)}</TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {own !== null ? (
          <>
            {Math.round(own).toLocaleString("de-DE")} kWh
            {deviationPercent !== null && Math.abs(deviationPercent) >= 1 && (
              <>
                <br />
                <span className="text-amber-600">
                  {t("deviation", {
                    percent: `${deviationPercent > 0 ? "+" : ""}${deviationPercent.toFixed(1).replace(".", ",")}`,
                  })}
                </span>
              </>
            )}
          </>
        ) : (
          // Nicht als 0 darstellen — das sähe aus wie „kein Ausfall".
          <span className="text-muted-foreground">{t("notComputed")}</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {claim !== null ? formatCurrency(claim) : <span className="text-muted-foreground">–</span>}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {paid !== null ? (
          <span className={claim !== null && paid < claim - 0.01 ? "text-destructive" : ""}>
            {formatCurrency(paid)}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={badgeVariant(event.claimStatus)} className="text-xs">
          {t(`statuses.${event.claimStatus}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        {deadline === null ? (
          <span className="text-muted-foreground">{t("noDeadline")}</span>
        ) : settled ? (
          <span className="text-muted-foreground">{formatDate(event.claimDeadline!)}</span>
        ) : daysLeft !== null && daysLeft < 0 ? (
          <span className="font-medium text-destructive">
            <Clock className="mr-1 inline h-3 w-3" aria-hidden />
            {t("deadlinePassed")}
          </span>
        ) : daysLeft !== null && daysLeft <= DEADLINE_WARN_DAYS ? (
          <span className="font-medium text-amber-600">
            <Clock className="mr-1 inline h-3 w-3" aria-hidden />
            {t("deadlineSoon", { days: daysLeft })}
          </span>
        ) : (
          formatDate(event.claimDeadline!)
        )}
      </TableCell>
    </TableRow>
  );
}

function badgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "PAID") return "secondary";
  if (status === "REJECTED" || status === "TIME_BARRED") return "destructive";
  return "outline";
}

function Tile({
  icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <div className={emphasis ? "mt-0.5 text-destructive" : "mt-0.5 text-muted-foreground"}>
          {icon}
        </div>
        <div>
          <p className={emphasis ? "text-xl font-semibold text-destructive" : "text-xl font-semibold"}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
