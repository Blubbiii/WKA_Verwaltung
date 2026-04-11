"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { de, enUS } from "date-fns/locale";
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

const STATUS_VARIANTS: Record<
  PPA["status"],
  "outline" | "default" | "secondary" | "destructive"
> = {
  DRAFT: "outline",
  ACTIVE: "default",
  EXPIRED: "secondary",
  TERMINATED: "destructive",
};

// ============================================================================
// Main Page
// ============================================================================

export default function PPAPage() {
  const t = useTranslations("invoices.ppa");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const numberLocale = locale === "en" ? "en-US" : "de-DE";
  const { isFeatureEnabled, loading: flagsLoading } = useFeatureFlags();
  const [ppas, setPpas] = useState<PPA[]>([]);

  const statusLabel = useCallback(
    (s: PPA["status"]) => {
      switch (s) {
        case "DRAFT":
          return t("statusDraft");
        case "ACTIVE":
          return t("statusActive");
        case "EXPIRED":
          return t("statusExpired");
        case "TERMINATED":
          return t("statusTerminated");
      }
    },
    [t]
  );

  const pricingModeLabel = useCallback(
    (m: PPA["pricingMode"]) => {
      switch (m) {
        case "FIXED":
          return t("pricingFixed");
        case "INDEXED":
          return t("pricingIndexed");
        case "COLLAR":
          return t("pricingCollar");
      }
    },
    [t]
  );

  const formatPrice = useCallback(
    (ppa: PPA): string => {
      const unit = t("priceUnit");
      const dash = t("emptyDash");
      switch (ppa.pricingMode) {
        case "FIXED":
          return ppa.fixedPriceCentKwh != null
            ? `${Number(ppa.fixedPriceCentKwh).toFixed(2)} ${unit}`
            : dash;
        case "INDEXED":
          return ppa.indexMarkupCentKwh != null
            ? `${ppa.indexBase ?? t("indexFallback")} +${Number(ppa.indexMarkupCentKwh).toFixed(2)} ct`
            : ppa.indexBase ?? t("pricingIndexed");
        case "COLLAR":
          if (ppa.floorPriceCentKwh != null && ppa.capPriceCentKwh != null) {
            return `${Number(ppa.floorPriceCentKwh).toFixed(2)}–${Number(ppa.capPriceCentKwh).toFixed(2)} ${unit}`;
          }
          return dash;
        default:
          return dash;
      }
    },
    [t]
  );
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
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

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
        label: t("statActive"),
        value: activePpas.length,
        icon: Zap,
      },
      {
        label: t("statAvgPrice"),
        value: avgPrice > 0 ? `${avgPrice.toFixed(2)} ${t("priceUnit")}` : t("emptyDash"),
        icon: TrendingUp,
      },
      {
        label: t("statVolume"),
        value:
          totalVolume > 0
            ? `${totalVolume.toLocaleString(numberLocale)} ${t("volumeUnit")}`
            : t("emptyDash"),
        icon: FileText,
      },
      {
        label: t("statExpiring"),
        value: expiringCount,
        icon: Clock,
        ...(expiringCount > 0
          ? { iconClassName: "text-yellow-600", cardClassName: "border-l-yellow-400" }
          : {}),
      },
    ];
  }, [ppas, t, numberLocale]);

  const handleDelete = async () => {
    if (!deletePpa) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ppa/${deletePpa.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("loadError"));
      }
      toast.success(t("deleteSuccess"));
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
            <h2 className="text-xl font-semibold mb-2">{t("notEnabledTitle")}</h2>
            <p className="text-muted-foreground">
              {t("notEnabledHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t("newPpa")}
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
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("statusFilterPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("statusAll")}</SelectItem>
            <SelectItem value="DRAFT">{t("statusDraft")}</SelectItem>
            <SelectItem value="ACTIVE">{t("statusActive")}</SelectItem>
            <SelectItem value="EXPIRED">{t("statusExpired")}</SelectItem>
            <SelectItem value="TERMINATED">{t("statusTerminated")}</SelectItem>
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
                  ? t("emptyNoData")
                  : t("emptyNotFound")}
              </p>
              {ppas.length === 0 && (
                <Button variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("createFirst")}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colTitle")}</TableHead>
                    <TableHead>{t("colPark")}</TableHead>
                    <TableHead>{t("colCounterparty")}</TableHead>
                    <TableHead>{t("colPricingMode")}</TableHead>
                    <TableHead>{t("colPrice")}</TableHead>
                    <TableHead>{t("colTerm")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ppa) => {
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
                        <TableCell>{ppa.park?.name ?? t("emptyDash")}</TableCell>
                        <TableCell>{ppa.counterparty}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {pricingModeLabel(ppa.pricingMode)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatPrice(ppa)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(ppa.startDate), "dd.MM.yyyy", {
                            locale: dateLocale,
                          })}{" "}
                          –{" "}
                          {format(new Date(ppa.endDate), "dd.MM.yyyy", {
                            locale: dateLocale,
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[ppa.status]}>{statusLabel(ppa.status)}</Badge>
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
                                {t("actionShow")}
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Pencil className="h-4 w-4 mr-2" />
                                {t("actionEdit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletePpa(ppa)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t("actionDelete")}
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
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogDescription", { title: deletePpa?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("actionDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
