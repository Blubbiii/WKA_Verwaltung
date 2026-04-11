"use client";

import { useState, useCallback, useEffect, use } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Loader2,
  Lock,
  CheckCircle,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

const CATEGORY_KEYS = [
  "REVENUE_ENERGY",
  "REVENUE_OTHER",
  "COST_LEASE",
  "COST_MAINTENANCE",
  "COST_INSURANCE",
  "COST_ADMIN",
  "COST_DEPRECIATION",
  "COST_FINANCING",
  "COST_OTHER",
  "RESERVE",
] as const;

const REVENUE_CATS = ["REVENUE_ENERGY", "REVENUE_OTHER"];

const STATUS_META = {
  DRAFT: { icon: Edit3, variant: "secondary" as const, key: "statusDraft" },
  APPROVED: { icon: CheckCircle, variant: "default" as const, key: "statusApproved" },
  LOCKED: { icon: Lock, variant: "outline" as const, key: "statusLocked" },
} as const;

type Category = (typeof CATEGORY_KEYS)[number];

interface BudgetLine {
  id?: string;
  costCenterId: string;
  category: Category;
  description: string;
  notes?: string | null;
  jan: number; feb: number; mar: number; apr: number; may: number; jun: number;
  jul: number; aug: number; sep: number; oct: number; nov: number; dec: number;
  _localId?: string;
}

interface CostCenter {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BudgetDetail {
  id: string;
  year: number;
  name: string;
  status: "DRAFT" | "APPROVED" | "LOCKED";
  notes: string | null;
  lines: (BudgetLine & { costCenter: CostCenter })[];
}

function rowSum(line: BudgetLine): number {
  return MONTH_KEYS.reduce((s, k) => s + (Number(line[k]) || 0), 0);
}

// =============================================================================
// LineRow — outside component to avoid remount on every parent render
// =============================================================================

interface LineRowProps {
  line: BudgetLine;
  isLocked: boolean;
  costCenters: CostCenter[] | undefined;
  updateLine: (localId: string, field: string, value: string | number) => void;
  removeLine: (localId: string) => void;
}

function LineRow({ line, isLocked, costCenters, updateLine, removeLine }: LineRowProps) {
  const t = useTranslations("wirtschaftsplan.budget");
  const annual = rowSum(line);
  return (
    <tr className="border-b hover:bg-muted/20 group">
      {/* Kostenstelle */}
      <td className="px-2 py-1 min-w-[140px]">
        <Select
          value={line.costCenterId}
          onValueChange={(v) => updateLine(line._localId!, "costCenterId", v)}
          disabled={isLocked}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(costCenters ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      {/* Kategorie */}
      <td className="px-2 py-1 min-w-[140px]">
        <Select
          value={line.category}
          onValueChange={(v) => updateLine(line._localId!, "category", v)}
          disabled={isLocked}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_KEYS.map((k) => (
              <SelectItem key={k} value={k}>{t(`category${k}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      {/* Beschreibung */}
      <td className="px-2 py-1 min-w-[120px]">
        <Input
          value={line.description}
          onChange={(e) => updateLine(line._localId!, "description", e.target.value)}
          className="h-7 text-xs"
          disabled={isLocked}
        />
      </td>
      {/* Monatswerte */}
      {MONTH_KEYS.map((k) => (
        <td key={k} className="px-1 py-1">
          <Input
            type="number"
            value={line[k] || ""}
            onChange={(e) => updateLine(line._localId!, k, parseFloat(e.target.value) || 0)}
            className="h-7 text-xs text-right w-[70px]"
            disabled={isLocked}
          />
        </td>
      ))}
      {/* Jahressumme */}
      <td className="px-2 py-1 text-right text-xs font-medium min-w-[80px]">
        {annual.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
      </td>
      {/* Delete */}
      {!isLocked && (
        <td className="px-1 py-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
            onClick={() => removeLine(line._localId!)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </td>
      )}
    </tr>
  );
}

export default function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("wirtschaftsplan.budget");
  const tMonths = useTranslations("wirtschaftsplan.months");
  const queryClient = useQueryClient();
  const budgetUrl = `/api/wirtschaftsplan/budgets/${id}`;
  const { data: budget } = useQuery<BudgetDetail>({
    queryKey: [budgetUrl],
    queryFn: () => fetcher(budgetUrl),
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mutate = () => queryClient.invalidateQueries({ queryKey: [budgetUrl] });
  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
    queryFn: () => fetcher("/api/cost-centers"),
  });

  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  // Initialize lines from budget data once (in useEffect to avoid state mutation during render)
  useEffect(() => {
    if (budget && !initialized) {
      setLines(budget.lines.map((l) => ({ ...l, _localId: Math.random().toString(36).slice(2) })));
      setInitialized(true);
    }
  }, [budget, initialized]);

  const isLocked = budget?.status === "LOCKED";

  function addLine() {
    if (!costCenters?.[0]) return;
    setLines((prev) => [
      ...prev,
      {
        costCenterId: costCenters[0].id,
        category: "COST_OTHER",
        description: t("detailDefaultDescription"),
        jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
        jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
        _localId: Math.random().toString(36).slice(2),
      },
    ]);
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l._localId !== localId));
  }

  function updateLine(localId: string, field: string, value: string | number) {
    setLines((prev) =>
      prev.map((l) =>
        l._localId === localId ? { ...l, [field]: value } : l
      )
    );
  }

  const handleSave = useCallback(async () => {
    if (!budget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/wirtschaftsplan/budgets/${id}/lines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("detailSaveError"));
      }
      toast.success(t("detailSaveSuccess"));
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("detailSaveError"));
    } finally {
      setSaving(false);
    }
  }, [budget, id, lines, mutate, t]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/wirtschaftsplan/budgets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const meta = STATUS_META[newStatus as keyof typeof STATUS_META];
      toast.success(t("detailStatusChanged", { label: meta ? t(meta.key) : newStatus }));
      mutate();
    } catch {
      toast.error(t("detailStatusError"));
    } finally {
      setStatusSaving(false);
    }
  }, [id, mutate, t]);

  // Group lines by revenue / cost category
  const revenueLines = lines.filter((l) => REVENUE_CATS.includes(l.category));
  const costLines = lines.filter((l) => !REVENUE_CATS.includes(l.category));

  const totalBudgetRevenue = revenueLines.reduce((s, l) => s + rowSum(l), 0);
  const totalBudgetCosts = costLines.reduce((s, l) => s + rowSum(l), 0);
  const totalNetPL = totalBudgetRevenue - totalBudgetCosts;

  if (!budget) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const statusMeta = STATUS_META[budget.status];
  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => router.push("/wirtschaftsplan/budget")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{budget.name}</h1>
            <Badge variant={statusMeta.variant} className="gap-1">
              <StatusIcon className="h-3 w-3" />
              {t(statusMeta.key)}
            </Badge>
          </div>
          <p className="text-muted-foreground">{t("detailFiscalYear", { year: budget.year })}</p>
        </div>
        <div className="flex gap-2">
          {budget.status === "DRAFT" && (
            <Button variant="outline" size="sm" onClick={() => handleStatusChange("APPROVED")} disabled={statusSaving}>
              <CheckCircle className="h-4 w-4 mr-1" />
              {t("detailApprove")}
            </Button>
          )}
          {budget.status === "APPROVED" && (
            <Button variant="outline" size="sm" onClick={() => handleStatusChange("LOCKED")} disabled={statusSaving}>
              <Lock className="h-4 w-4 mr-1" />
              {t("detailLock")}
            </Button>
          )}
          {!isLocked && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {t("detailSave")}
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { key: "rev", label: t("detailKpiPlanRevenue"), val: totalBudgetRevenue, pos: true },
          { key: "cost", label: t("detailKpiPlanCosts"), val: totalBudgetCosts, pos: false },
          { key: "net", label: t("detailKpiPlanResult"), val: totalNetPL, pos: totalNetPL >= 0 },
        ].map(({ key, label, val, pos }) => (
          <Card key={key}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold mt-1 ${pos && key !== "cost" ? "text-green-600 dark:text-green-400" : key === "net" && !pos ? "text-destructive" : ""}`}>
                {val.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Budget Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("detailLinesTitle")}</CardTitle>
            {!isLocked && (
              <Button size="sm" variant="outline" onClick={addLine} disabled={!costCenters?.length}>
                <Plus className="h-4 w-4 mr-1" />
                {t("detailAddLine")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-2 py-2 text-xs font-medium">{t("detailColCostCenter")}</th>
                  <th className="text-left px-2 py-2 text-xs font-medium">{t("detailColCategory")}</th>
                  <th className="text-left px-2 py-2 text-xs font-medium">{t("detailColDescription")}</th>
                  {MONTH_KEYS.map((mk) => <th key={mk} className="text-right px-1 py-2 text-xs font-medium">{tMonths(mk)}</th>)}
                  <th className="text-right px-2 py-2 text-xs font-medium">{t("detailColTotal")}</th>
                  {!isLocked && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {revenueLines.length > 0 && (
                  <>
                    <tr className="bg-green-50/50 dark:bg-green-950/20">
                      <td colSpan={15 + (isLocked ? 0 : 1)} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("detailSectionRevenue")}
                      </td>
                    </tr>
                    {revenueLines.map((l) => <LineRow key={l._localId} line={l} isLocked={isLocked} costCenters={costCenters} updateLine={updateLine} removeLine={removeLine} />)}
                  </>
                )}
                {costLines.length > 0 && (
                  <>
                    <tr className="bg-red-50/50 dark:bg-red-950/20">
                      <td colSpan={15 + (isLocked ? 0 : 1)} className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("detailSectionExpenses")}
                      </td>
                    </tr>
                    {costLines.map((l) => <LineRow key={l._localId} line={l} isLocked={isLocked} costCenters={costCenters} updateLine={updateLine} removeLine={removeLine} />)}
                  </>
                )}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={16} className="text-center py-8 text-muted-foreground text-sm">
                      {t("detailEmptyHint")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
