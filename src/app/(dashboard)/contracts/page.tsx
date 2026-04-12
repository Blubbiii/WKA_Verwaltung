"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Download,
  Filter,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { EditableCell } from "@/components/ui/editable-cell";
import { toast } from "sonner";
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { SearchFilter } from "@/components/ui/search-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { CONTRACT_STATUS, getStatusBadge } from "@/lib/status-config";
import { CONTRACT_WARNING_DAYS, CONTRACT_CALENDAR_LOOKAHEAD_DAYS } from "@/lib/config/business-thresholds";

interface ContractItem {
  id: string;
  contractType: string;
  contractNumber: string | null;
  title: string;
  startDate: string;
  endDate: string | null;
  noticeDeadline: string | null;
  autoRenewal: boolean;
  annualValue: number | null;
  status: string;
  park: { id: string; name: string; shortName: string | null } | null;
  fund: { id: string; name: string } | null;
  partner: { id: string; name: string } | null;
  notes: string | null;
  documentCount: number;
}

interface ContractsResponse {
  data: ContractItem[];
  stats: {
    byStatus: Record<string, number>;
    expiringIn30Days: number;
  };
}

const typeVariants: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning"> = {
  LEASE: "default",
  SERVICE: "secondary",
  INSURANCE: "success",
  GRID_CONNECTION: "warning",
  MARKETING: "outline",
  OTHER: "secondary",
};

const statusIcons: Record<string, React.ElementType> = {
  DRAFT: Pencil,
  ACTIVE: CheckCircle,
  EXPIRING: AlertTriangle,
  EXPIRED: XCircle,
  TERMINATED: XCircle,
};

export default function ContractsPage() {
  const router = useRouter();
  const t = useTranslations("contracts");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<ContractItem | null>(null);

  const invalidate = useInvalidateQuery();

  // Build query URL
  const queryParams = new URLSearchParams({
    limit: "100",
    ...(typeFilter !== "all" && { contractType: typeFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
  });

  const { data: contractsData, isLoading: loading, error, refetch } = useApiQuery<ContractsResponse>(
    ["contracts", typeFilter, statusFilter],
    `/api/contracts?${queryParams}`
  );

  const contracts = contractsData?.data ?? [];
  const stats = contractsData?.stats ?? { byStatus: {}, expiringIn30Days: 0 };

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/contracts/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: t("list.errorDelete") }));
        throw new Error(data.error || t("list.errorDeleteContract"));
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["contracts"]);
      },
      onError: (error) => {
        toast.error(error.message || t("list.errorDeleteContract"));
      },
    }
  );

  // Client-side search filtering (same as original)
  const filteredContracts = contracts.filter((contract) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    return (
      contract.title.toLowerCase().includes(searchLower) ||
      contract.contractNumber?.toLowerCase().includes(searchLower) ||
      contract.park?.name.toLowerCase().includes(searchLower) ||
      contract.partner?.name.toLowerCase().includes(searchLower)
    );
  });

  // Batch selection
  const {
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
    selectedCount,
  } = useBatchSelection({ items: filteredContracts });

  // CSV export for selected contracts
  function handleCsvExport() {
    const selected = filteredContracts.filter((c) => selectedIds.has(c.id));
    const header = [t("list.csvHeaderTitle"), t("list.csvHeaderType"), t("list.csvHeaderAssignment"), t("list.csvHeaderAnnualValue"), t("list.csvHeaderStatus")].join(";");
    const rows = selected.map((c) => {
      const zuordnung = c.park?.shortName || c.park?.name || c.partner?.name || "-";
      return [
        c.title,
        t(`types.${c.contractType}`),
        zuordnung,
        c.annualValue != null ? c.annualValue.toString().replace(".", ",") : "-",
        getStatusBadge(CONTRACT_STATUS, c.status).label,
      ].join(";");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vertraege_export_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("list.exportedCount", { count: selected.length }));
  }

  // Bulk delete for selected contracts
  async function handleBulkDelete() {
    const ids = [...selectedIds];
    let successCount = 0;
    for (const id of ids) {
      try {
        const response = await fetch(`/api/contracts/${id}`, { method: "DELETE" });
        if (response.ok) successCount++;
      } catch {
        // continue with next
      }
    }
    clearSelection();
    invalidate(["contracts"]);
    if (successCount === ids.length) {
      toast.success(t("list.deletedCount", { count: successCount }));
    } else {
      toast.warning(t("list.deletedPartial", { success: successCount, total: ids.length }));
    }
  }

  const totalActive = stats.byStatus.ACTIVE || 0;
  const totalExpiring = (stats.byStatus.EXPIRING || 0) + stats.expiringIn30Days;

  function getDaysIndicator(endDate: string | null, noticeDeadline: string | null) {
    if (!endDate) return null;

    const now = new Date();
    const end = new Date(endDate);
    const daysUntilEnd = differenceInDays(end, now);

    if (daysUntilEnd < 0) {
      return <Badge variant="destructive">{t("list.expired")}</Badge>;
    }

    if (noticeDeadline) {
      const notice = new Date(noticeDeadline);
      const daysUntilNotice = differenceInDays(notice, now);

      if (daysUntilNotice <= 0 && daysUntilEnd > 0) {
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            {t("list.noticeMissed")}
          </Badge>
        );
      }

      if (daysUntilNotice <= CONTRACT_WARNING_DAYS) {
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-600">
            {t("list.daysUntilNotice", { days: daysUntilNotice })}
          </Badge>
        );
      }
    }

    if (daysUntilEnd <= CONTRACT_WARNING_DAYS) {
      return (
        <Badge variant="outline" className="text-red-600 border-red-600">
          {t("list.daysUntilEnd", { days: daysUntilEnd })}
        </Badge>
      );
    }

    if (daysUntilEnd <= CONTRACT_CALENDAR_LOOKAHEAD_DAYS) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
          {t("list.daysUntilEnd", { days: daysUntilEnd })}
        </Badge>
      );
    }

    return null;
  }

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
        createHref="/contracts/new"
        createLabel={t("list.newContract")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/contracts/calendar">
              <Calendar className="mr-2 h-4 w-4" />
              {t("list.calendar")}
            </Link>
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatsCards
        stats={[
          { label: t("list.statsTotal"), value: contracts.length, icon: FileText, subtitle: t("list.statsContracts") },
          { label: t("list.statsActive"), value: totalActive, icon: CheckCircle, iconClassName: "text-green-600", valueClassName: "text-green-600", subtitle: t("list.statsActiveRunning") },
          { label: t("list.statsExpiring"), value: totalExpiring, icon: AlertTriangle, iconClassName: "text-yellow-600", valueClassName: "text-yellow-600", cardClassName: totalExpiring > 0 ? "border-yellow-500" : "", subtitle: t("list.statsExpiringSubtitle") },
          { label: t("list.statsAutoRenewal"), value: contracts.filter((c) => c.autoRenewal).length, icon: RefreshCw, iconClassName: "text-blue-600", subtitle: t("list.statsAutoRenewalSubtitle") },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("list.allContracts")}</CardTitle>
          <CardDescription>{t("list.allContractsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("list.searchPlaceholder")}
            filters={[
              {
                value: typeFilter,
                onChange: setTypeFilter,
                placeholder: t("list.filterType"),
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[150px]",
                options: [
                  { value: "all", label: t("list.filterAllTypes") },
                  ...Object.keys(typeVariants).map((value) => ({ value, label: t(`types.${value}`) })),
                ],
              },
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: t("list.filterStatus"),
                width: "w-[150px]",
                options: [
                  { value: "all", label: t("list.filterAllStatus") },
                  ...Object.entries(CONTRACT_STATUS).map(([value, { label }]) => ({ value, label })),
                ],
              },
            ]}
          />

          <div className={cn("rounded-md border overflow-x-auto transition-opacity", loading && contracts.length > 0 && "opacity-50 pointer-events-none")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleAll} aria-label={t("list.selectAll")}
                      {...(isSomeSelected ? { "data-state": "indeterminate" } : {})} />
                  </TableHead>
                  <TableHead>{t("list.tableContract")}</TableHead>
                  <TableHead>{t("list.tableType")}</TableHead>
                  <TableHead>{t("list.tableAssignment")}</TableHead>
                  <TableHead>{t("list.tableDuration")}</TableHead>
                  <TableHead>{t("list.tableAnnualValue")}</TableHead>
                  <TableHead>{t("list.tableStatus")}</TableHead>
                  <TableHead>{t("list.tableNotes")}</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <EmptyState
                        icon={FileText}
                        title={t("list.emptyTitle")}
                        description={t("list.emptyDescription")}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts.map((contract) => {
                    const typeVariant = typeVariants[contract.contractType];
                    const statusConf = getStatusBadge(CONTRACT_STATUS, contract.status);
                    const StatusIcon = statusIcons[contract.status] || FileText;
                    const daysIndicator = getDaysIndicator(
                      contract.endDate,
                      contract.noticeDeadline
                    );

                    return (
                      <TableRow
                        key={contract.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/contracts/${contract.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/contracts/${contract.id}`); } }}
                      >
                        <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(contract.id)} onCheckedChange={() => toggleItem(contract.id)} aria-label={t("list.select")} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{contract.title}</p>
                            {contract.contractNumber && (
                              <p className="text-sm text-muted-foreground">
                                {contract.contractNumber}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={typeVariant || "secondary"}>
                            {t(`types.${contract.contractType}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {contract.park && (
                              <p>{contract.park.shortName || contract.park.name}</p>
                            )}
                            {contract.partner && (
                              <p className="text-muted-foreground">
                                {contract.partner.name}
                              </p>
                            )}
                            {!contract.park && !contract.partner && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>
                              {format(new Date(contract.startDate), "dd.MM.yyyy", {
                                locale: de,
                              })}
                            </p>
                            {contract.endDate ? (
                              <p className="text-muted-foreground">
                                {t("list.until")}{" "}
                                {format(new Date(contract.endDate), "dd.MM.yyyy", {
                                  locale: de,
                                })}
                              </p>
                            ) : (
                              <p className="text-muted-foreground">{t("list.unlimited")}</p>
                            )}
                            {contract.autoRenewal && (
                              <div className="flex items-center gap-1 mt-1">
                                <RefreshCw className="h-3 w-3 text-blue-600" />
                                <span className="text-xs text-blue-600">
                                  {t("list.autoRenewal")}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(contract.annualValue)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="secondary" className={statusConf.className}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {statusConf.label}
                            </Badge>
                            {daysIndicator}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          <EditableCell
                            value={contract.notes}
                            placeholder="—"
                            onSave={async (newValue) => {
                              const res = await fetch(`/api/contracts/${contract.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ notes: newValue || null }),
                              });
                              if (!res.ok) {
                                const data = await res.json().catch(() => ({ error: t("list.errorGeneric") }));
                                throw new Error(data.error || t("list.errorSaving"));
                              }
                              toast.success(t("list.noteSaved"));
                              invalidate(["contracts"]);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t("list.viewDetails")}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/contracts/${contract.id}`);
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
                                router.push(`/contracts/${contract.id}/edit`);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("list.moreActions")}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setContractToDelete(contract);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("list.deleteAction")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (contractToDelete) {
            await deleteMutation.mutateAsync(contractToDelete.id);
            setContractToDelete(null);
          }
        }}
        title={t("list.deleteTitle")}
        itemName={contractToDelete?.title}
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
            label: t("list.deleteAction"),
            icon: <Trash2 className="h-4 w-4" />,
            onClick: handleBulkDelete,
            variant: "destructive",
          },
        ]}
      />
    </div>
  );
}
