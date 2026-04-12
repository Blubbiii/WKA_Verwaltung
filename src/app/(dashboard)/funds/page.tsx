"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { cn } from "@/lib/utils";
import { EditableCell } from "@/components/ui/editable-cell";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import {
  Building2,
  Users,
  Wallet,
  MoreHorizontal,
  Eye,
  Pencil,
  Archive,
  Filter,
  Wind,
  Trash2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { SearchFilter } from "@/components/ui/search-filter";
import { ENTITY_STATUS, getStatusBadge } from "@/lib/status-config";

interface FundPark {
  park: {
    id: string;
    name: string;
    shortName: string | null;
  };
  ownershipPercentage: number | null;
}

interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
  totalCapital: number | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  fundParks: FundPark[];
  stats: {
    shareholderCount: number;
    activeShareholderCount: number;
    totalContributions: number;
    voteCount: number;
    documentCount: number;
    parkCount: number;
  };
}

interface FundsResponse {
  data: Fund[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}


export default function FundsPage() {
  const router = useRouter();
  const t = useTranslations("funds");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fundToDelete, setFundToDelete] = useState<Fund | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [fundToArchive, setFundToArchive] = useState<string | null>(null);

  const invalidate = useInvalidateQuery();

  // Build query URL
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== "all" && { status: statusFilter }),
  });

  const { data: fundsData, isLoading: loading, error, refetch } = useApiQuery<FundsResponse>(
    ["funds", debouncedSearch, statusFilter, page.toString()],
    `/api/funds?${queryParams}`
  );

  const funds = fundsData?.data ?? [];
  const pagination = fundsData?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };

  // Batch selection
  const {
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
    selectedCount,
  } = useBatchSelection({ items: funds });

  // Archive mutation
  const archiveMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/funds/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: t("list.archiveError") }));
        throw new Error(error.error || t("list.archiveError"));
      }
      return response.json();
    },
    {
      onSuccess: () => {
        toast.success(t("list.archiveSuccess"));
        invalidate(["funds"]);
      },
      onError: () => {
        toast.error(t("list.archiveError"));
      },
      onSettled: () => {
        setArchiveDialogOpen(false);
        setFundToArchive(null);
      },
    }
  );

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/funds/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("list.deleteError") }));
        throw new Error(data.error || t("list.deleteError"));
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["funds"]);
      },
      onError: (error) => {
        toast.error(error.message || t("list.deleteError"));
      },
    }
  );

  function handleArchive(id: string) {
    setFundToArchive(id);
    setArchiveDialogOpen(true);
  }

  function handleConfirmArchive() {
    if (!fundToArchive) return;
    archiveMutation.mutate(fundToArchive);
  }

  function openDeleteDialog(fund: Fund) {
    setFundToDelete(fund);
    setDeleteDialogOpen(true);
  }

  // CSV export of selected funds
  function handleCsvExport() {
    const selected = funds.filter((f) => selectedIds.has(f.id));
    const header = [
      t("list.csvHeaders.name"),
      t("list.csvHeaders.legalForm"),
      t("list.csvHeaders.status"),
      t("list.csvHeaders.shareholders"),
      t("list.csvHeaders.capital"),
      t("list.csvHeaders.parks"),
    ];
    const rows = selected.map((f) => [
      f.name,
      f.legalForm ?? "",
      f.status,
      String(f.stats.activeShareholderCount),
      String(f.stats.totalContributions),
      f.fundParks.map((fp) => fp.park.shortName || fp.park.name).join("; "),
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t("list.csvFilename");
    a.click();
    URL.revokeObjectURL(url);
  }

  // Bulk delete selected funds
  async function handleBulkDelete() {
    if (!confirm(t("list.bulkDeleteConfirm", { count: selectedCount }))) return;
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/funds/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch { /* skip */ }
    }
    toast.success(t("list.bulkDeleteSuccess", { count: deleted }));
    clearSelection();
    refetch();
  }

  // Berechne Gesamtstatistiken
  const totalStats = funds.reduce(
    (acc, fund) => ({
      funds: acc.funds + 1,
      shareholders: acc.shareholders + fund.stats.activeShareholderCount,
      capital: acc.capital + fund.stats.totalContributions,
    }),
    { funds: 0, shareholders: 0, capital: 0 }
  );

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">{t("list.errorLoading")}</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          {t("list.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t("list.title")}
        description={t("list.description")}
        createHref="/funds/new"
        createLabel={t("list.newFund")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/funds/onboarding">
              <Users className="mr-2 h-4 w-4" />
              {t("list.onboarding")}
            </Link>
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatsCards
        columns={3}
        stats={[
          { label: t("list.statsCompanies"), value: totalStats.funds, icon: Building2, subtitle: t("list.statsCompaniesActive", { count: funds.filter((f) => f.status === "ACTIVE").length }) },
          { label: t("list.statsShareholders"), value: totalStats.shareholders, icon: Users, subtitle: t("list.statsShareholdersSubtitle") },
          { label: t("list.statsCapital"), value: formatCurrency(totalStats.capital), icon: Wallet, subtitle: t("list.statsCapitalSubtitle") },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("list.tableTitle")}</CardTitle>
          <CardDescription>{t("list.tableDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("list.searchPlaceholder")}
            filters={[
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: t("list.filterStatus"),
                icon: <Filter className="mr-2 h-4 w-4" />,
                options: [
                  { value: "all", label: t("list.filterAll") },
                  { value: "ACTIVE", label: t("status.active") },
                  { value: "INACTIVE", label: t("status.inactive") },
                  { value: "ARCHIVED", label: t("status.archived") },
                ],
              },
            ]}
          />

          {/* Table */}
          <div className={cn("mt-4 rounded-md border overflow-x-auto transition-opacity", loading && funds.length > 0 && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleAll}
                      aria-label={t("list.selectAll")}
                      {...(isSomeSelected ? { "data-state": "indeterminate" } : {})}
                    />
                  </TableHead>
                  <TableHead>{t("list.colName")}</TableHead>
                  <TableHead>{t("list.colParks")}</TableHead>
                  <TableHead className="text-center">{t("list.colShareholders")}</TableHead>
                  <TableHead className="text-right">{t("list.colCapital")}</TableHead>
                  <TableHead>{t("list.colStatus")}</TableHead>
                  <TableHead>{t("list.colNotes")}</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : funds.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {t("list.noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  funds.map((fund) => (
                    <TableRow
                      key={fund.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/funds/${fund.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/funds/${fund.id}`); } }}
                    >
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(fund.id)}
                          onCheckedChange={() => toggleItem(fund.id)}
                          aria-label={t("list.selectItem", { name: fund.name })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{fund.name}</div>
                        {fund.legalForm && (
                          <div className="text-sm text-muted-foreground">
                            {fund.legalForm}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {fund.fundParks.length > 0 ? (
                          <div className="flex items-center gap-1">
                            <Wind className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {fund.fundParks
                                .map((fp) => fp.park.shortName || fp.park.name)
                                .join(", ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">
                          {fund.stats.activeShareholderCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fund.stats.totalContributions > 0
                          ? formatCurrency(fund.stats.totalContributions)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusBadge(ENTITY_STATUS, fund.status).className}
                        >
                          {getStatusBadge(ENTITY_STATUS, fund.status).label}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableCell
                          value={fund.notes}
                          onSave={async (val) => {
                            await fetch(`/api/funds/${fund.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ notes: val }),
                            });
                            refetch();
                          }}
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("list.showDetails")}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/funds/${fund.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("list.edit")}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/funds/${fund.id}/edit`);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("list.moreActions")}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchive(fund.id);
                                }}
                              >
                                <Archive className="mr-2 h-4 w-4" />
                                {t("list.archive")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(fund);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("list.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("list.pagination", {
                  from: (pagination.page - 1) * pagination.limit + 1,
                  to: Math.min(pagination.page * pagination.limit, pagination.total),
                  total: pagination.total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("list.prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("list.next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleConfirmArchive}
        title={t("list.archiveTitle")}
        description={t("list.archiveDescription")}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (fundToDelete) {
            await deleteMutation.mutateAsync(fundToDelete.id);
            setFundToDelete(null);
          }
        }}
        title={t("list.deleteTitle")}
        itemName={fundToDelete?.name}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          {
            label: t("list.csvExport"),
            icon: <Download className="h-4 w-4" />,
            onClick: handleCsvExport,
          },
          {
            label: t("list.batchDelete"),
            icon: <Trash2 className="h-4 w-4" />,
            onClick: handleBulkDelete,
            variant: "destructive",
          },
        ]}
      />
    </div>
  );
}
