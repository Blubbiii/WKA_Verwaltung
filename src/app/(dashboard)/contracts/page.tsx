"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Search,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Filter,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { SearchFilter } from "@/components/ui/search-filter";
import { CONTRACT_STATUS, getStatusBadge } from "@/lib/status-config";

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
  documentCount: number;
}

interface ContractsResponse {
  data: ContractItem[];
  stats: {
    byStatus: Record<string, number>;
    expiringIn30Days: number;
  };
}

const typeConfig: Record<string, { label: string; color: string }> = {
  LEASE: { label: "Pacht", color: "bg-blue-100 text-blue-800" },
  SERVICE: { label: "Service", color: "bg-purple-100 text-purple-800" },
  INSURANCE: { label: "Versicherung", color: "bg-green-100 text-green-800" },
  GRID_CONNECTION: { label: "Netzanschluss", color: "bg-orange-100 text-orange-800" },
  MARKETING: { label: "Vermarktung", color: "bg-pink-100 text-pink-800" },
  OTHER: { label: "Sonstiges", color: "bg-gray-100 text-gray-800" },
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
        const data = await response.json().catch(() => ({ error: "Fehler beim Loeschen" }));
        throw new Error(data.error || "Fehler beim Loeschen des Vertrags");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["contracts"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Loeschen des Vertrags");
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

  const totalActive = stats.byStatus.ACTIVE || 0;
  const totalExpiring = (stats.byStatus.EXPIRING || 0) + stats.expiringIn30Days;

  function getDaysIndicator(endDate: string | null, noticeDeadline: string | null) {
    if (!endDate) return null;

    const now = new Date();
    const end = new Date(endDate);
    const daysUntilEnd = differenceInDays(end, now);

    if (daysUntilEnd < 0) {
      return <Badge variant="destructive">Abgelaufen</Badge>;
    }

    if (noticeDeadline) {
      const notice = new Date(noticeDeadline);
      const daysUntilNotice = differenceInDays(notice, now);

      if (daysUntilNotice <= 0 && daysUntilEnd > 0) {
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            Kündigungsfrist verpasst
          </Badge>
        );
      }

      if (daysUntilNotice <= 30) {
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-600">
            {daysUntilNotice} Tage bis Kündigung
          </Badge>
        );
      }
    }

    if (daysUntilEnd <= 30) {
      return (
        <Badge variant="outline" className="text-red-600 border-red-600">
          {daysUntilEnd} Tage bis Ende
        </Badge>
      );
    }

    if (daysUntilEnd <= 90) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
          {daysUntilEnd} Tage bis Ende
        </Badge>
      );
    }

    return null;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Vertraege</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Verträge"
        description="Verwalten Sie Verträge und überwachen Sie Fristen"
        createHref="/contracts/new"
        createLabel="Neuer Vertrag"
        actions={
          <Button variant="outline" asChild>
            <Link href="/contracts/calendar">
              <Calendar className="mr-2 h-4 w-4" />
              Kalender
            </Link>
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatsCards
        stats={[
          { label: "Gesamt", value: contracts.length, icon: FileText, subtitle: "Verträge" },
          { label: "Aktiv", value: totalActive, icon: CheckCircle, iconClassName: "text-green-600", valueClassName: "text-green-600", subtitle: "Laufende Verträge" },
          { label: "Auslaufend", value: totalExpiring, icon: AlertTriangle, iconClassName: "text-yellow-600", valueClassName: "text-yellow-600", cardClassName: totalExpiring > 0 ? "border-yellow-500" : "", subtitle: "In den nächsten 30 Tagen" },
          { label: "Auto-Verlängerung", value: contracts.filter((c) => c.autoRenewal).length, icon: RefreshCw, iconClassName: "text-blue-600", subtitle: "Verträge mit Auto-Verlängerung" },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Verträge</CardTitle>
          <CardDescription>Übersicht aller Verträge mit Fristenüberwachung</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Suchen nach Titel, Nummer, Park..."
            filters={[
              {
                value: typeFilter,
                onChange: setTypeFilter,
                placeholder: "Typ",
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[150px]",
                options: [
                  { value: "all", label: "Alle Typen" },
                  ...Object.entries(typeConfig).map(([value, { label }]) => ({ value, label })),
                ],
              },
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: "Status",
                width: "w-[150px]",
                options: [
                  { value: "all", label: "Alle Status" },
                  ...Object.entries(CONTRACT_STATUS).map(([value, { label }]) => ({ value, label })),
                ],
              },
            ]}
          />

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vertrag</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Zuordnung</TableHead>
                  <TableHead>Laufzeit</TableHead>
                  <TableHead>Wert p.a.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Keine Verträge gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts.map((contract) => {
                    const typeConf = typeConfig[contract.contractType];
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
                          <Badge variant="secondary" className={typeConf?.color}>
                            {typeConf?.label || contract.contractType}
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
                                bis{" "}
                                {format(new Date(contract.endDate), "dd.MM.yyyy", {
                                  locale: de,
                                })}
                              </p>
                            ) : (
                              <p className="text-muted-foreground">unbefristet</p>
                            )}
                            {contract.autoRenewal && (
                              <div className="flex items-center gap-1 mt-1">
                                <RefreshCw className="h-3 w-3 text-blue-600" />
                                <span className="text-xs text-blue-600">
                                  Auto-Verlängerung
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
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Details anzeigen"
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
                              aria-label="Bearbeiten"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/contracts/${contract.id}/edit`);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
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
                                  Loeschen
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
        title="Vertrag loeschen"
        itemName={contractToDelete?.title}
      />
    </div>
  );
}
