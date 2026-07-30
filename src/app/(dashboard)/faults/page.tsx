"use client";

/**
 * Störungsvorgänge.
 *
 * A1 (Audit 2026-07): Die Störungsdaten lagen vollständig vor, der Vorgang
 * fehlte. Diese Liste ist die Arbeitsliste der technischen Betriebsführung —
 * ihr wichtigster Teil ist der Filter „nur fällige": was heute liegen bleibt,
 * verjährt irgendwann.
 */

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { AlertTriangle, Plus, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchFilter } from "@/components/ui/search-filter";
import { PaginationBar, type PaginationInfo } from "@/components/ui/pagination-bar";
import { usePersistedTableState } from "@/hooks/usePersistedTableState";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { PAGE_SIZE_LARGE } from "@/lib/config/pagination";
import { formatCurrency, formatNumber } from "@/lib/format";
import { CAUSE_CATEGORIES, CASE_STATUSES, CLAIM_STATUSES } from "@/lib/faults/constants";

interface FaultCaseRow {
  id: string;
  caseNumber: string;
  title: string;
  startAt: string;
  endAt: string | null;
  status: string;
  causeCategory: string;
  claimStatus: string;
  claimDeadline: string | null;
  followUpAt: string | null;
  lostEnergyKwh: string | null;
  lostRevenueEur: string | null;
  turbine: {
    id: string;
    designation: string;
    park: { id: string; name: string; shortName: string | null } | null;
  };
  statusCode: { description: string; mainCode: number; subCode: number } | null;
  assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
}

interface FaultsResponse {
  data: FaultCaseRow[];
  pagination?: PaginationInfo;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  OPEN: "destructive",
  IN_PROGRESS: "default",
  RESOLVED: "secondary",
  CLOSED: "outline",
};

export default function FaultsPage() {
  const t = useTranslations("faults");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;

  const [tableState, setTableState] = usePersistedTableState("faults", {
    search: "",
    status: "all",
    cause: "all",
    claim: "all",
    dueOnly: "false",
    page: 1,
  });
  const debouncedSearch = useDebounce(tableState.search, 300);
  const set = (patch: Partial<typeof tableState>) => setTableState({ ...patch, page: 1 });

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE_LARGE),
    page: String(tableState.page),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(tableState.status !== "all" && { status: tableState.status }),
    ...(tableState.cause !== "all" && { causeCategory: tableState.cause }),
    ...(tableState.claim !== "all" && { claimStatus: tableState.claim }),
    ...(tableState.dueOnly === "true" && { dueOnly: "true" }),
  });

  const { data, isLoading } = useApiQuery<FaultsResponse>(
    [
      "faults",
      debouncedSearch,
      tableState.status,
      tableState.cause,
      tableState.claim,
      tableState.dueOnly,
      String(tableState.page),
    ],
    `/api/faults?${params}`,
  );

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href="/faults/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("newButton")}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <SearchFilter
            search={tableState.search}
            onSearchChange={(value) => set({ search: value })}
            searchPlaceholder={t("searchPlaceholder")}
            filters={[
              {
                value: tableState.status,
                onChange: (value) => set({ status: value }),
                placeholder: t("filterStatus"),
                width: "w-[170px]",
                options: [
                  { value: "all", label: t("filterAllStatuses") },
                  ...CASE_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
                ],
              },
              {
                value: tableState.cause,
                onChange: (value) => set({ cause: value }),
                placeholder: t("filterCause"),
                width: "w-[190px]",
                options: [
                  { value: "all", label: t("filterAllCauses") },
                  ...CAUSE_CATEGORIES.map((c) => ({ value: c, label: t(`cause.${c}`) })),
                ],
              },
              {
                value: tableState.claim,
                onChange: (value) => set({ claim: value }),
                placeholder: t("filterClaim"),
                width: "w-[190px]",
                options: [
                  { value: "all", label: t("filterAllClaims") },
                  ...CLAIM_STATUSES.map((c) => ({ value: c, label: t(`claim.${c}`) })),
                ],
              },
            ]}
          >
            {/* Der eigentliche Zweck des Vorgangs: nichts liegen lassen.
                Deshalb steht der Schalter neben den Filtern und nicht in einem
                Untermenü. */}
            <Button
              variant={tableState.dueOnly === "true" ? "default" : "outline"}
              onClick={() =>
                set({ dueOnly: tableState.dueOnly === "true" ? "false" : "true" })
              }
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t("filterDueOnly")}
            </Button>
          </SearchFilter>

          <div className="mt-4 rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.caseNumber")}</TableHead>
                  <TableHead>{t("table.turbine")}</TableHead>
                  <TableHead>{t("table.period")}</TableHead>
                  <TableHead>{t("table.cause")}</TableHead>
                  <TableHead className="text-right">{t("table.lostEnergy")}</TableHead>
                  <TableHead className="text-right">{t("table.lostRevenue")}</TableHead>
                  <TableHead>{t("table.claim")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      {tableState.dueOnly === "true" ? t("emptyDue") : t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const deadlineSoon = isSoon(row.claimDeadline);
                    const followUpDue = isDue(row.followUpAt);
                    return (
                      <TableRow key={row.id} className="cursor-pointer">
                        <TableCell className="font-mono text-sm">
                          <Link href={`/faults/${row.id}`} className="text-primary hover:underline">
                            {row.caseNumber}
                          </Link>
                          <p className="max-w-56 truncate text-xs text-muted-foreground">
                            {row.title}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{row.turbine.designation}</p>
                          {row.turbine.park && (
                            <p className="text-xs text-muted-foreground">
                              {row.turbine.park.shortName || row.turbine.park.name}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {format(new Date(row.startAt), "dd.MM.yy HH:mm", { locale: dateLocale })}
                          <p className="text-xs text-muted-foreground">
                            {row.endAt
                              ? format(new Date(row.endAt), "dd.MM.yy HH:mm", { locale: dateLocale })
                              : t("stillRunning")}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{t(`cause.${row.causeCategory}`)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.lostEnergyKwh !== null ? (
                            `${formatNumber(Number(row.lostEnergyKwh))} kWh`
                          ) : (
                            // Nicht "0" zeigen: unbewertet ist etwas anderes
                            // als "kein Ausfall".
                            <span className="text-muted-foreground">{t("notValuated")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.lostRevenueEur !== null ? (
                            formatCurrency(Number(row.lostRevenueEur))
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={row.claimStatus === "TIME_BARRED" ? "destructive" : "outline"}>
                              {t(`claim.${row.claimStatus}`)}
                            </Badge>
                            {deadlineSoon && (
                              <span
                                className="text-xs text-amber-600"
                                title={t("deadlineSoonTitle")}
                              >
                                ⏳
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                              {t(`status.${row.status}`)}
                            </Badge>
                            {followUpDue && (
                              <Zap className="h-3.5 w-3.5 text-amber-600" aria-label={t("followUpDue")} />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            pagination={data?.pagination}
            onPageChange={(page) => setTableState({ page })}
            disabled={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Wiedervorlage fällig? */
function isDue(value: string | null): boolean {
  return value !== null && new Date(value) <= new Date();
}

/** Verjährung in weniger als 30 Tagen? */
function isSoon(value: string | null): boolean {
  if (!value) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  return new Date(value) <= limit;
}
