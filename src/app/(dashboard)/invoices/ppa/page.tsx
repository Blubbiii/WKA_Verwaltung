"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText,
  Search,
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Zap,
  Clock,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ============================================================================
// Types
// ============================================================================

interface PPA {
  id: string;
  title: string;
  contractNumber: string | null;
  counterparty: string;
  pricingMode: "FIXED" | "INDEXED" | "COLLAR";
  fixedPriceCentKwh: number | null;
  floorPriceCentKwh: number | null;
  capPriceCentKwh: number | null;
  indexBase: string | null;
  indexMarkupCentKwh: number | null;
  minQuantityMwh: number | null;
  maxQuantityMwh: number | null;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";
  notes: string | null;
  park: { id: string; name: string } | null;
}

type StatusFilter = "ALL" | "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";

// ============================================================================
// Helpers
// ============================================================================

const STATUS_CONFIG: Record<
  PPA["status"],
  { label: string; variant: "outline" | "default" | "secondary" | "destructive" }
> = {
  DRAFT: { label: "Entwurf", variant: "outline" },
  ACTIVE: { label: "Aktiv", variant: "default" },
  EXPIRED: { label: "Abgelaufen", variant: "secondary" },
  TERMINATED: { label: "Beendet", variant: "destructive" },
};

const PRICING_MODE_LABELS: Record<PPA["pricingMode"], string> = {
  FIXED: "Festpreis",
  INDEXED: "Indexbasiert",
  COLLAR: "Collar (Floor/Cap)",
};

function formatPrice(ppa: PPA): string {
  switch (ppa.pricingMode) {
    case "FIXED":
      return ppa.fixedPriceCentKwh != null
        ? `${Number(ppa.fixedPriceCentKwh).toFixed(2)} ct/kWh`
        : "—";
    case "INDEXED":
      return ppa.indexMarkupCentKwh != null
        ? `${ppa.indexBase ?? "Index"} +${Number(ppa.indexMarkupCentKwh).toFixed(2)} ct`
        : ppa.indexBase ?? "Indexbasiert";
    case "COLLAR":
      if (ppa.floorPriceCentKwh != null && ppa.capPriceCentKwh != null) {
        return `${Number(ppa.floorPriceCentKwh).toFixed(2)}–${Number(ppa.capPriceCentKwh).toFixed(2)} ct/kWh`;
      }
      return "—";
    default:
      return "—";
  }
}

// ============================================================================
// Main Page
// ============================================================================

export default function PPAPage() {
  const { isFeatureEnabled, loading: flagsLoading } = useFeatureFlags();
  const [ppas, setPpas] = useState<PPA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [deletePpa, setDeletePpa] = useState<PPA | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/ppa?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPpas(data.ppas ?? []);
      }
    } catch {
      toast.error("Fehler beim Laden der PPAs");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!flagsLoading) {
      load();
    }
  }, [flagsLoading, load]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return ppas;
    const q = search.toLowerCase();
    return ppas.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.counterparty.toLowerCase().includes(q) ||
        (p.contractNumber && p.contractNumber.toLowerCase().includes(q))
    );
  }, [ppas, search]);

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const activePpas = ppas.filter((p) => p.status === "ACTIVE");
    const avgPrice =
      activePpas.length > 0
        ? activePpas
            .filter((p) => p.fixedPriceCentKwh != null)
            .reduce((sum, p) => sum + Number(p.fixedPriceCentKwh), 0) /
          (activePpas.filter((p) => p.fixedPriceCentKwh != null).length || 1)
        : 0;
    const totalVolume = ppas
      .filter((p) => p.status === "ACTIVE" && p.maxQuantityMwh != null)
      .reduce((sum, p) => sum + Number(p.maxQuantityMwh), 0);
    const expiringCount = ppas.filter((p) => {
      if (p.status !== "ACTIVE") return false;
      const daysLeft = differenceInDays(new Date(p.endDate), now);
      return daysLeft >= 0 && daysLeft <= 90;
    }).length;

    return [
      {
        label: "Aktive PPAs",
        value: activePpas.length,
        icon: Zap,
      },
      {
        label: "Ø Vertragspreis",
        value: avgPrice > 0 ? `${avgPrice.toFixed(2)} ct/kWh` : "—",
        icon: TrendingUp,
      },
      {
        label: "Vertragsvolumen",
        value:
          totalVolume > 0
            ? `${totalVolume.toLocaleString("de-DE")} MWh/a`
            : "—",
        icon: FileText,
      },
      {
        label: "Auslaufend (<90 Tage)",
        value: expiringCount,
        icon: Clock,
        ...(expiringCount > 0
          ? { iconClassName: "text-yellow-600", cardClassName: "border-l-yellow-400" }
          : {}),
      },
    ];
  }, [ppas]);

  const handleDelete = async () => {
    if (!deletePpa) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ppa/${deletePpa.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("PPA gelöscht");
      setDeletePpa(null);
      load();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setDeleting(false);
    }
  };

  if (flagsLoading) return null;

  if (!isFeatureEnabled("ppa-management")) {
    return (
      <div className="p-8">
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">PPA-Management nicht aktiviert</h2>
            <p className="text-muted-foreground">
              Das PPA-Modul ist für diesen Mandanten nicht aktiviert. Bitte wenden Sie sich
              an Ihren Administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Power Purchase Agreements"
        description="Verwaltung von Stromlieferverträgen"
        actions={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Neuer PPA
          </Button>
        }
      />

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Titel, Vertragspartner suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle Status</SelectItem>
            <SelectItem value="DRAFT">Entwurf</SelectItem>
            <SelectItem value="ACTIVE">Aktiv</SelectItem>
            <SelectItem value="EXPIRED">Abgelaufen</SelectItem>
            <SelectItem value="TERMINATED">Beendet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                {ppas.length === 0
                  ? "Noch keine PPAs vorhanden"
                  : "Keine PPAs gefunden"}
              </p>
              {ppas.length === 0 && (
                <Button variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Ersten PPA anlegen
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Vertragspartner</TableHead>
                    <TableHead>Preismodell</TableHead>
                    <TableHead>Preis</TableHead>
                    <TableHead>Laufzeit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ppa) => {
                    const sc = STATUS_CONFIG[ppa.status];
                    return (
                      <TableRow key={ppa.id}>
                        <TableCell className="font-medium">
                          {ppa.title}
                          {ppa.contractNumber && (
                            <span className="block text-xs text-muted-foreground">
                              {ppa.contractNumber}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{ppa.park?.name ?? "—"}</TableCell>
                        <TableCell>{ppa.counterparty}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {PRICING_MODE_LABELS[ppa.pricingMode]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatPrice(ppa)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(ppa.startDate), "dd.MM.yyyy", {
                            locale: de,
                          })}{" "}
                          –{" "}
                          {format(new Date(ppa.endDate), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="h-4 w-4 mr-2" />
                                Anzeigen
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Pencil className="h-4 w-4 mr-2" />
                                Bearbeiten
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletePpa(ppa)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Löschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletePpa}
        onOpenChange={(v) => !v && setDeletePpa(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PPA löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deletePpa?.title}&rdquo; wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Lösche..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
