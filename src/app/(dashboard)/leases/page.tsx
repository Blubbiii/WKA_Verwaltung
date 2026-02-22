"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Search,
  MapPin,
  Calendar,
  AlertTriangle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Filter,
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
import { LeaseDialogs } from "@/components/leases";
import { toast } from "sonner";
import { CONTRACT_STATUS, getStatusBadge } from "@/lib/status-config";

interface Plot {
  id: string;
  cadastralDistrict: string | null;
  fieldNumber: string | null;
  plotNumber: string | null;
  areaSqm: number | null;
  park: {
    id: string;
    name: string;
    shortName: string | null;
  } | null;
}

interface Lease {
  id: string;
  contractNumber: string | null;
  startDate: string;
  endDate: string | null;
  annualRent: number | null;
  status: string;
  plots: Plot[];
  lessor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    personType: string;
  };
}

interface LeasesResponse {
  data: Lease[];
}

export default function LeasesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaseToDelete, setLeaseToDelete] = useState<Lease | null>(null);

  const invalidate = useInvalidateQuery();

  // Build query URL
  const queryParams = new URLSearchParams({
    limit: "100",
    ...(statusFilter !== "all" && { status: statusFilter }),
  });

  const { data: leasesData, isLoading: loading, error, refetch } = useApiQuery<LeasesResponse>(
    ["leases", statusFilter],
    `/api/leases?${queryParams}`
  );

  const leases = leasesData?.data ?? [];

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/leases/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Fehler beim Loeschen" }));
        throw new Error(data.error || "Fehler beim Loeschen des Pachtvertrags");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["leases"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Loeschen des Pachtvertrags");
      },
    }
  );

  function getLessorName(lessor: Lease["lessor"]): string {
    if (lessor.personType === "legal") {
      return lessor.companyName || "-";
    }
    return [lessor.firstName, lessor.lastName].filter(Boolean).join(" ") || "-";
  }

  function getPlotLabel(plot: Plot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber ? `Flur ${plot.fieldNumber}` : null,
      plot.plotNumber ? `Flurstück ${plot.plotNumber}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Unbekannt";
  }

  function getPlotsLabel(plots: Plot[]): string {
    if (!plots || plots.length === 0) return "-";
    if (plots.length === 1) return getPlotLabel(plots[0]);
    return `${plots.length} Flurstücke`;
  }

  function getTotalArea(plots: Plot[]): number {
    if (!plots || plots.length === 0) return 0;
    return plots.reduce((sum, plot) => sum + (Number(plot.areaSqm) || 0), 0);
  }

  function getParksLabel(plots: Plot[]): string {
    if (!plots || plots.length === 0) return "-";
    const parks = [...new Set(plots.map(p => p.park?.shortName || p.park?.name).filter(Boolean))];
    if (parks.length === 0) return "-";
    if (parks.length === 1) return parks[0] || "-";
    return `${parks.length} Parks`;
  }

  function getDaysUntilEnd(endDate: string | null): number | null {
    if (!endDate) return null;
    return differenceInDays(new Date(endDate), new Date());
  }

  // Filter by search
  const filteredLeases = leases.filter((lease) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    const plotsMatch = lease.plots?.some(plot =>
      getPlotLabel(plot).toLowerCase().includes(searchLower) ||
      plot.park?.name.toLowerCase().includes(searchLower)
    );
    return (
      getLessorName(lease.lessor).toLowerCase().includes(searchLower) ||
      plotsMatch ||
      lease.contractNumber?.toLowerCase().includes(searchLower)
    );
  });

  // Expiring leases (within 90 days)
  const expiringLeases = leases.filter((l) => {
    const days = getDaysUntilEnd(l.endDate);
    return days !== null && days > 0 && days <= 90;
  });

  const totalAnnualRent = leases
    .filter((l) => l.status === "ACTIVE")
    .reduce((sum, l) => sum + (l.annualRent || 0), 0);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Pachtvertraege</p>
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
        title="Pachtvertraege"
        description="Verwalten Sie Pachtvertraege mit integrierten Flurstuecken"
        createHref="/leases/new"
        createLabel="Neuer Vertrag"
      />

      {/* Stats Cards */}
      <StatsCards
        columns={3}
        stats={[
          { label: "Pachtverträge", value: leases.length, icon: MapPin, subtitle: `${leases.filter((l) => l.status === "ACTIVE").length} aktiv` },
          { label: "Jährliche Pacht", value: formatCurrency(totalAnnualRent), icon: Calendar, subtitle: "Aktive Verträge" },
          { label: "Auslaufend", value: expiringLeases.length, icon: AlertTriangle, iconClassName: expiringLeases.length > 0 ? "text-yellow-500" : undefined, cardClassName: expiringLeases.length > 0 ? "border-yellow-500" : "", subtitle: "In den nächsten 90 Tagen" },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pachtverträge</CardTitle>
          <CardDescription>Übersicht aller Pachtverträge</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Suchen nach Verpächter, Flurstück..."
            filters={[
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: "Status",
                icon: <Filter className="mr-2 h-4 w-4" />,
                options: [
                  { value: "all", label: "Alle Status" },
                  { value: "ACTIVE", label: "Aktiv" },
                  { value: "EXPIRING", label: "Läuft aus" },
                  { value: "EXPIRED", label: "Abgelaufen" },
                ],
              },
            ]}
          />

          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vertrag</TableHead>
                  <TableHead>Verpächter</TableHead>
                  <TableHead>Flurstück</TableHead>
                  <TableHead>Park</TableHead>
                  <TableHead>Laufzeit</TableHead>
                  <TableHead className="text-right">Jahrespacht</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredLeases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      Keine Pachtverträge gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeases.map((lease) => {
                    const daysUntilEnd = getDaysUntilEnd(lease.endDate);
                    return (
                      <TableRow
                        key={lease.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedLease(lease);
                          setIsDetailOpen(true);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedLease(lease); setIsDetailOpen(true); } }}
                      >
                        <TableCell className="font-medium">
                          {lease.contractNumber || "-"}
                        </TableCell>
                        <TableCell>{getLessorName(lease.lessor)}</TableCell>
                        <TableCell className="text-sm">
                          {getPlotsLabel(lease.plots)}
                          {getTotalArea(lease.plots) > 0 && (
                            <span className="ml-1 text-muted-foreground">
                              ({(getTotalArea(lease.plots) / 10000).toFixed(2)} ha)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getParksLabel(lease.plots)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(lease.startDate), "dd.MM.yyyy", { locale: de })}
                            {" - "}
                            {lease.endDate
                              ? format(new Date(lease.endDate), "dd.MM.yyyy", { locale: de })
                              : "unbefristet"}
                          </div>
                          {daysUntilEnd !== null && daysUntilEnd <= 90 && daysUntilEnd > 0 && (
                            <div className="text-xs text-yellow-600">
                              Noch {daysUntilEnd} Tage
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {lease.annualRent ? formatCurrency(lease.annualRent) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getStatusBadge(CONTRACT_STATUS, lease.status).className}>
                            {getStatusBadge(CONTRACT_STATUS, lease.status).label}
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
                                setSelectedLease(lease);
                                setIsDetailOpen(true);
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
                                router.push(`/leases/${lease.id}/edit`);
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
                                    setLeaseToDelete(lease);
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

      {/* Lease Dialogs */}
      <LeaseDialogs
        onSuccess={() => invalidate(["leases"])}
        isDetailOpen={isDetailOpen}
        setIsDetailOpen={setIsDetailOpen}
        viewingLease={selectedLease}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (leaseToDelete) {
            await deleteMutation.mutateAsync(leaseToDelete.id);
            setLeaseToDelete(null);
          }
        }}
        title="Pachtvertrag loeschen"
        itemName={leaseToDelete?.contractNumber || (leaseToDelete?.lessor ? `Vertrag mit ${getLessorName(leaseToDelete.lessor)}` : "Pachtvertrag")}
      />
    </div>
  );
}
