"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Building2, Wind, Briefcase, LayoutGrid, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const TYPE_META: Record<string, { key: string; icon: React.ElementType }> = {
  PARK: { key: "typePark", icon: Building2 },
  TURBINE: { key: "typeTurbine", icon: Wind },
  FUND: { key: "typeFund", icon: Briefcase },
  OVERHEAD: { key: "typeOverhead", icon: LayoutGrid },
  CUSTOM: { key: "typeCustom", icon: LayoutGrid },
};

interface CostCenterDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  isActive: boolean;
  park?: { id: string; name: string } | null;
  turbine?: { id: string; designation: string } | null;
  fund?: { id: string; name: string } | null;
  parent?: { id: string; code: string; name: string } | null;
  children: { id: string; code: string; name: string; type: string; isActive: boolean }[];
  _count: { budgetLines: number };
}

export default function CostCenterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("wirtschaftsplan.costCenters");
  const costCenterUrl = `/api/cost-centers/${id}`;
  const { data: costCenter, isLoading } = useQuery<CostCenterDetail>({
    queryKey: [costCenterUrl],
    queryFn: () => fetcher(costCenterUrl),
  });
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [bearbeiten, setBearbeiten] = useState<{
    code: string; name: string; type: string; description: string; isActive: boolean;
  } | null>(null);

  // Edit and delete existed in the API only — the page showed the entry read-only.
  const speichern = useMutation({
    mutationFn: async (werte: NonNullable<typeof bearbeiten>) => {
      const res = await fetch(costCenterUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...werte, description: werte.description.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t("saveError"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [costCenterUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      toast.success(t("saveSuccess"));
      setBearbeiten(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loeschen = useMutation({
    mutationFn: async () => {
      const res = await fetch(costCenterUrl, { method: "DELETE" });
      // 409: budget lines still point here — the API says so.
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t("deleteError"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-centers"] });
      toast.success(t("deleteSuccess"));
      router.push("/wirtschaftsplan/cost-centers");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!costCenter) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/wirtschaftsplan/cost-centers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("detailBack")}
        </Button>
        <p className="text-muted-foreground">{t("detailNotFound")}</p>
      </div>
    );
  }

  const meta = TYPE_META[costCenter.type] ?? TYPE_META.CUSTOM;
  const Icon = meta.icon;
  const assignment = costCenter.park?.name ?? costCenter.turbine?.designation ?? costCenter.fund?.name;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/wirtschaftsplan/cost-centers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">{costCenter.name}</h1>
            <Badge variant={costCenter.isActive ? "default" : "secondary"}>
              {costCenter.isActive ? t("statusActive") : t("statusInactive")}
            </Badge>
          </div>
          <p className="text-muted-foreground font-mono">{costCenter.code}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setBearbeiten({
                code: costCenter.code,
                name: costCenter.name,
                type: costCenter.type,
                description: costCenter.description ?? "",
                isActive: costCenter.isActive,
              })
            }
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t("editButton")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={loeschen.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: t("deleteTitle"),
                description: t("deleteDescription", { name: costCenter.name }),
                variant: "destructive",
              });
              if (ok) loeschen.mutate();
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("deleteButton")}
          </Button>
        </div>
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle>{t("detailDetailsTitle")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              { label: t("detailFieldType"), val: t(meta.key) },
              { label: t("detailFieldCode"), val: costCenter.code },
              { label: t("detailFieldName"), val: costCenter.name },
              { label: t("detailFieldAssignment"), val: assignment ?? t("detailNone") },
              { label: t("detailFieldParent"), val: costCenter.parent ? `${costCenter.parent.code} – ${costCenter.parent.name}` : t("detailNone") },
              { label: t("detailFieldDescription"), val: costCenter.description ?? "–" },
              { label: t("detailFieldBudgetLines"), val: String(costCenter._count.budgetLines) },
            ].map(({ label, val }) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium mt-0.5">{val}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Child Cost Centers */}
      {costCenter.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("detailChildrenTitle", { count: costCenter.children.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {costCenter.children.map((child) => {
                const childMeta = TYPE_META[child.type] ?? TYPE_META.CUSTOM;
                const ChildIcon = childMeta.icon;
                return (
                  <div
                    key={child.id}
                    className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/wirtschaftsplan/cost-centers/${child.id}`)}
                  >
                    <ChildIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{child.code}</span>
                    <span className="text-sm">{child.name}</span>
                    <Badge variant={child.isActive ? "default" : "secondary"} className="ml-auto text-xs">
                      {child.isActive ? t("statusActive") : t("statusInactive")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={bearbeiten !== null} onOpenChange={(o) => { if (!o) setBearbeiten(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          {bearbeiten && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cc-code">{t("fieldCode")}</Label>
                  <Input id="cc-code" value={bearbeiten.code} onChange={(e) => setBearbeiten({ ...bearbeiten, code: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-type">{t("fieldType")}</Label>
                  <Select value={bearbeiten.type} onValueChange={(v) => setBearbeiten({ ...bearbeiten, type: v })}>
                    <SelectTrigger id="cc-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{t(v.key)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-name">{t("fieldName")}</Label>
                <Input id="cc-name" value={bearbeiten.name} onChange={(e) => setBearbeiten({ ...bearbeiten, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cc-description">{t("fieldDescription")}</Label>
                <Input id="cc-description" value={bearbeiten.description} onChange={(e) => setBearbeiten({ ...bearbeiten, description: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="cc-active" checked={bearbeiten.isActive} onCheckedChange={(v) => setBearbeiten({ ...bearbeiten, isActive: v })} />
                <Label htmlFor="cc-active">{t("statusActive")}</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBearbeiten(null)}>{t("cancelButton")}</Button>
            <Button
              disabled={speichern.isPending || !bearbeiten?.code.trim() || !bearbeiten?.name.trim()}
              onClick={() => bearbeiten && speichern.mutate(bearbeiten)}
            >
              {speichern.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("saveButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
