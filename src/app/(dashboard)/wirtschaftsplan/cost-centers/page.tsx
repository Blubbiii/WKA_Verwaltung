"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Building2,
  Wind,
  Briefcase,
  LayoutGrid,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  PARK: { label: "Park", icon: Building2, color: "text-blue-600" },
  TURBINE: { label: "Turbine", icon: Wind, color: "text-green-600" },
  FUND: { label: "Fonds", icon: Briefcase, color: "text-purple-600" },
  OVERHEAD: { label: "Overhead", icon: LayoutGrid, color: "text-orange-600" },
  CUSTOM: { label: "Benutzerdefiniert", icon: LayoutGrid, color: "text-muted-foreground" },
};

interface CostCenter {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  park?: { id: string; name: string } | null;
  turbine?: { id: string; designation: string } | null;
  fund?: { id: string; name: string } | null;
  parent?: { id: string; code: string; name: string } | null;
  _count: { budgetLines: number; children: number };
}

interface NewCostCenterForm {
  code: string;
  name: string;
  type: string;
  description: string;
}

export default function CostCentersPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<CostCenter[]>(
    "/api/cost-centers?activeOnly=false",
    fetcher
  );
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<NewCostCenterForm>({
    code: "",
    name: "",
    type: "CUSTOM",
    description: "",
  });
  const [creating, setCreating] = useState(false);

  const filtered = (data ?? []).filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/cost-centers/sync", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Fehler");
      toast.success(
        `Auto-Sync abgeschlossen: ${result.created.parks} Parks, ${result.created.turbines} Turbinen erstellt`
      );
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Auto-Sync");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreate() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code und Name sind erforderlich");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cost-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          type: form.type,
          description: form.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("Kostenstelle angelegt");
      setShowNew(false);
      setForm({ code: "", name: "", type: "CUSTOM", description: "" });
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  }

  const stats = {
    total: (data ?? []).length,
    parks: (data ?? []).filter((c) => c.type === "PARK").length,
    turbines: (data ?? []).filter((c) => c.type === "TURBINE").length,
    custom: (data ?? []).filter((c) => c.type === "CUSTOM" || c.type === "OVERHEAD").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kostenstellen</h1>
          <p className="text-muted-foreground">Kostenstellen verwalten und zuordnen</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Auto-Sync (Parks & Turbinen)
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Kostenstelle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Gesamt", val: stats.total },
          { label: "Parks", val: stats.parks },
          { label: "Turbinen", val: stats.turbines },
          { label: "Sonstige", val: stats.custom },
        ].map(({ label, val }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{isLoading ? "–" : val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <CardTitle className="ml-auto text-sm text-muted-foreground">
              {filtered.length} Kostenstellen
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Zuordnung</TableHead>
                <TableHead>Übergeordnet</TableHead>
                <TableHead className="text-right">Budgetzeilen</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {search ? "Keine Kostenstellen gefunden." : "Noch keine Kostenstellen. Klicke auf Auto-Sync oder lege eine neue an."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => {
                  const meta = TYPE_META[c.type] ?? TYPE_META.CUSTOM;
                  const Icon = meta.icon;
                  const assignment = c.park?.name ?? c.turbine?.designation ?? c.fund?.name ?? "–";
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/wirtschaftsplan/cost-centers/${c.id}`)}
                    >
                      <TableCell className="font-mono text-sm">{c.code}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                          <span className="text-sm">{meta.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{assignment}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.parent ? `${c.parent.code} – ${c.parent.name}` : "–"}
                      </TableCell>
                      <TableCell className="text-right">{c._count.budgetLines}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.isActive ? "default" : "secondary"}>
                          {c.isActive ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Cost Center Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Kostenstelle anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="z.B. VW-ALLG"
                />
              </div>
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Allgemeine Verwaltung"
              />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Kurze Beschreibung..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
