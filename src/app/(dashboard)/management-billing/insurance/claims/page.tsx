"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileWarning, Eye } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatCurrency } from "@/lib/format";

// =============================================================================
// TYPES
// =============================================================================

interface Claim {
  id: string;
  claimNumber: string | null;
  title: string;
  claimType: "INSURANCE" | "SERVICE_PROVIDER";
  incidentDate: string;
  status: string;
  estimatedCostEur: number | string | null;
  reimbursedEur: number | string | null;
  parkName: string | null;
  vendorName: string | null;
  contractTitle: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusBadgeColors: Record<string, string> = {
  REPORTED: "bg-yellow-100 text-yellow-800",
  CLAIM_IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const typeBadgeColors: Record<string, string> = {
  INSURANCE: "bg-purple-100 text-purple-800",
  SERVICE_PROVIDER: "bg-orange-100 text-orange-800",
};

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ClaimsListPage() {
  const t = useTranslations("managementBilling.claimsList");
  const router = useRouter();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch("/api/management-billing/insurance-claims");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled) {
          setClaims(json.claims ?? json.data ?? []);
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          c.title.toLowerCase().includes(q) ||
          (c.claimNumber?.toLowerCase().includes(q) ?? false) ||
          (c.parkName?.toLowerCase().includes(q) ?? false) ||
          (c.vendorName?.toLowerCase().includes(q) ?? false) ||
          (c.contractTitle?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.claimType !== typeFilter) return false;
      return true;
    });
  }, [claims, search, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        createHref="/management-billing/insurance/claims/new"
        createLabel={t("createLabel")}
      />

      {/* Filter Bar */}
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: t("filter.allStatus"),
            options: [
              { value: "all", label: t("filter.allStatus") },
              { value: "REPORTED", label: t("status.REPORTED") },
              { value: "CLAIM_IN_PROGRESS", label: t("status.CLAIM_IN_PROGRESS") },
              { value: "RESOLVED", label: t("status.RESOLVED") },
              { value: "REJECTED", label: t("status.REJECTED") },
            ],
          },
          {
            value: typeFilter,
            onChange: setTypeFilter,
            placeholder: t("filter.allTypes"),
            options: [
              { value: "all", label: t("filter.allTypes") },
              { value: "INSURANCE", label: t("type.INSURANCE") },
              { value: "SERVICE_PROVIDER", label: t("type.SERVICE_PROVIDER") },
            ],
            width: "w-[180px]",
          },
        ]}
      />

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-40 flex-1" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-8 w-10" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              {t("errorLoading")}
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileWarning}
              title={claims.length === 0 ? t("empty.none.title") : t("empty.noResults.title")}
              description={
                claims.length === 0
                  ? t("empty.none.description")
                  : t("empty.noResults.description")
              }
              action={
                claims.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/insurance/claims/new">
                      {t("empty.action")}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.claimNumber")}</TableHead>
                    <TableHead>{t("table.title")}</TableHead>
                    <TableHead>{t("table.type")}</TableHead>
                    <TableHead>{t("table.incidentDate")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead className="text-right">{t("table.estimatedCost")}</TableHead>
                    <TableHead className="text-right">{t("table.reimbursed")}</TableHead>
                    <TableHead>{t("table.insuranceOrVendor")}</TableHead>
                    <TableHead className="text-right">{t("table.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((claim) => (
                    <TableRow
                      key={claim.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/management-billing/insurance/claims/${claim.id}`)}
                    >
                      <TableCell className="font-mono text-sm">
                        {claim.claimNumber ?? "–"}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {claim.title}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={typeBadgeColors[claim.claimType] ?? ""}
                        >
                          {t(`type.${claim.claimType}` as never)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(claim.incidentDate)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusBadgeColors[claim.status] ?? ""}
                        >
                          {t(`status.${claim.status}` as never)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(claim.estimatedCostEur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(claim.reimbursedEur)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                        {claim.contractTitle ?? claim.vendorName ?? "–"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          title={t("actionShowDetails")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/management-billing/insurance/claims/${claim.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
