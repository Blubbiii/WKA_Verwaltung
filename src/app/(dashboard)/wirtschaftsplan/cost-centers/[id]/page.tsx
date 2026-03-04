"use client";

import { use } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Wind, Briefcase, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  PARK: { label: "Park", icon: Building2 },
  TURBINE: { label: "Turbine", icon: Wind },
  FUND: { label: "Fonds", icon: Briefcase },
  OVERHEAD: { label: "Overhead", icon: LayoutGrid },
  CUSTOM: { label: "Benutzerdefiniert", icon: LayoutGrid },
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
  const { data: costCenter, isLoading } = useSWR<CostCenterDetail>(
    `/api/cost-centers/${id}`,
    fetcher
  );

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
          Zurück
        </Button>
        <p className="text-muted-foreground">Kostenstelle nicht gefunden.</p>
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
              {costCenter.isActive ? "Aktiv" : "Inaktiv"}
            </Badge>
          </div>
          <p className="text-muted-foreground font-mono">{costCenter.code}</p>
        </div>
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Typ", val: meta.label },
              { label: "Code", val: costCenter.code },
              { label: "Name", val: costCenter.name },
              { label: "Zuordnung", val: assignment ?? "Keine" },
              { label: "Übergeordnet", val: costCenter.parent ? `${costCenter.parent.code} – ${costCenter.parent.name}` : "Keine" },
              { label: "Beschreibung", val: costCenter.description ?? "–" },
              { label: "Budgetzeilen", val: String(costCenter._count.budgetLines) },
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
          <CardHeader><CardTitle>Untergeordnete Kostenstellen ({costCenter.children.length})</CardTitle></CardHeader>
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
                      {child.isActive ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
