"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Plus,
  Search,
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
} from "lucide-react";
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

  // Archive mutation
  const archiveMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/funds/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Fehler beim Archivieren" }));
        throw new Error(error.error || "Fehler beim Archivieren");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        toast.success("Gesellschaft wurde archiviert");
        invalidate(["funds"]);
      },
      onError: () => {
        toast.error("Fehler beim Archivieren");
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
        const data = await response.json().catch(() => ({ error: "Fehler beim Loeschen" }));
        throw new Error(data.error || "Fehler beim Loeschen");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["funds"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Loeschen");
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
        <p className="text-destructive">Fehler beim Laden der Gesellschaften</p>
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
        title="Beteiligungen"
        description="Verwalten Sie Ihre Gesellschaften und Gesellschafter"
        createHref="/funds/new"
        createLabel="Neue Gesellschaft"
        actions={
          <Button variant="outline" asChild>
            <Link href="/funds/onboarding">
              <Users className="mr-2 h-4 w-4" />
              Gesellschafter-Onboarding
            </Link>
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatsCards
        columns={3}
        stats={[
          { label: "Gesellschaften", value: totalStats.funds, icon: Building2, subtitle: `${funds.filter((f) => f.status === "ACTIVE").length} aktiv` },
          { label: "Gesellschafter", value: totalStats.shareholders, icon: Users, subtitle: "Aktive Beteiligungen" },
          { label: "Kapital", value: formatCurrency(totalStats.capital), icon: Wallet, subtitle: "Gesamteinlagen" },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Gesellschaften</CardTitle>
          <CardDescription>Übersicht aller Gesellschaften und Beteiligungsgesellschaften</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Suchen nach Name..."
            filters={[
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: "Status",
                icon: <Filter className="mr-2 h-4 w-4" />,
                options: [
                  { value: "all", label: "Alle Status" },
                  { value: "ACTIVE", label: "Aktiv" },
                  { value: "INACTIVE", label: "Inaktiv" },
                  { value: "ARCHIVED", label: "Archiviert" },
                ],
              },
            ]}
          />

          {/* Table */}
          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Parks</TableHead>
                  <TableHead className="text-center">Gesellschafter</TableHead>
                  <TableHead className="text-right">Kapital</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : funds.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Keine Gesellschaften gefunden
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
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Details anzeigen"
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
                            aria-label="Bearbeiten"
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
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
                                Archivieren
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(fund);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Loeschen
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
                Zeige {(pagination.page - 1) * pagination.limit + 1} bis{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                von {pagination.total} Gesellschaften
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Weiter
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
        title="Archivieren bestaetigen"
        description="Moechten Sie diese Gesellschaft wirklich archivieren?"
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
        title="Gesellschaft loeschen"
        itemName={fundToDelete?.name}
      />
    </div>
  );
}
