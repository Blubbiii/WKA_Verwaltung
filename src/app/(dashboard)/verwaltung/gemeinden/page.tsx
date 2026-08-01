"use client";

/**
 * Gemeinden — Stammdaten und Leistung je Gemeinde.
 *
 * A5 (Audit 2026-08). Zwei Dinge auf einer Seite, weil sie zusammengehören:
 * die Pflege der Gemeinden und die Auswertung, für die sie gepflegt werden.
 * Wer sieht, dass drei Anlagen nicht zugeordnet sind, will die Zuordnung
 * gleich nachholen können und nicht erst einen anderen Bereich suchen.
 *
 * Die Auswertung rechnet KEINE Steuer — sie liefert die Leistungskomponente
 * für die Zerlegung nach § 29 GewStG, die der Steuerberater vornimmt.
 */

import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Download, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatNumber } from "@/lib/format";

interface Municipality {
  id: string;
  name: string;
  officialKey: string | null;
  state: string | null;
  _count: { turbines: number; plots: number };
}

interface CapacityRow {
  municipalityId: string;
  municipalityName: string;
  officialKey: string | null;
  turbineCount: number;
  totalRatedPowerKw: number;
  shareOfAssigned: number;
}

interface CapacityResult {
  year: number;
  rows: CapacityRow[];
  assignedRatedPowerKw: number;
  withoutMunicipality: { id: string; designation: string; parkName: string }[];
  warnings: string[];
}

export default function GemeindenPage() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const [year, setYear] = useState(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", officialKey: "", state: "" });

  const {
    data: municipalities = [],
    isLoading: loadingMunicipalities,
  } = useQuery<Municipality[]>({
    queryKey: ["/api/municipalities"],
    queryFn: async () => {
      const res = await fetch("/api/municipalities");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).data;
    },
    staleTime: 60_000,
  });

  const { data: capacity, isLoading: loadingCapacity } = useQuery<CapacityResult>({
    queryKey: ["/api/regulatory/capacity-by-municipality", year],
    queryFn: async () => {
      const res = await fetch(
        `/api/regulatory/capacity-by-municipality?year=${year}`,
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });

  const createMunicipality = useMutation({
    mutationFn: async (input: typeof form) => {
      const res = await fetch("/api/municipalities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          officialKey: input.officialKey || null,
          state: input.state || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Anlegen fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/municipalities"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/regulatory/capacity-by-municipality"],
      });
      setDialogOpen(false);
      setForm({ name: "", officialKey: "", state: "" });
      toast.success("Gemeinde angelegt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMunicipality = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/municipalities/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Löschen fehlgeschlagen");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/municipalities"] });
      toast.success("Gemeinde gelöscht");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = useCallback(
    async (m: Municipality) => {
      const confirmed = await confirm({
        title: "Gemeinde löschen",
        description: `„${m.name}" wirklich löschen?`,
        variant: "destructive",
      });
      if (confirmed) deleteMunicipality.mutate(m.id);
    },
    [confirm, deleteMunicipality],
  );

  // Der Export laeuft ueber einen eigenen Aufruf statt ueber die geladenen
  // Daten: das CSV traegt die Vorbehalte im Kopf mit, und die sollen aus
  // derselben Quelle kommen wie die Zahlen.
  function downloadCsv() {
    window.location.href = `/api/regulatory/capacity-by-municipality?year=${year}&format=csv`;
  }

  const yearOptions = Array.from(
    { length: 8 },
    (_, i) => new Date().getFullYear() - i,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Building2 className="h-7 w-7" />
            Gemeinden
          </h1>
          <p className="text-muted-foreground">
            Standortgemeinden der Anlagen und die daraus abgeleitete Leistung je
            Gemeinde.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Gemeinde anlegen
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Auswertung                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Installierte Leistung je Gemeinde</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Grundlage für die Zerlegung nach § 29 Abs. 1 Nr. 2 GewStG (90 %
              Leistung / 10 % Arbeitslöhne).{" "}
              <span className="font-medium">
                Enthält keine Steuerberechnung — weder Messbetrag noch Hebesatz.
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Erhebungszeitraum"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={downloadCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {capacity?.warnings.map((w, i) => (
            <Alert key={i} variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{w}</AlertDescription>
            </Alert>
          ))}

          {loadingCapacity ? (
            <Skeleton className="h-40" />
          ) : capacity && capacity.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gemeinde</TableHead>
                  <TableHead>Gemeindeschlüssel</TableHead>
                  <TableHead className="text-right">Anlagen</TableHead>
                  <TableHead className="text-right">Leistung (kW)</TableHead>
                  <TableHead className="text-right">Anteil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capacity.rows.map((r) => (
                  <TableRow key={r.municipalityId}>
                    <TableCell className="font-medium">
                      {r.municipalityName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.officialKey ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.turbineCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.totalRatedPowerKw, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.shareOfAssigned * 100, 2)} %
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={2}>Summe zugeordnet</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {capacity.rows.reduce((s, r) => s + r.turbineCount, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(capacity.assignedRatedPowerKw, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">100,00 %</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Für {year} ist keine Anlage einer Gemeinde zugeordnet. Die
              Zuordnung wird an der jeweiligen Anlage gepflegt.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Stammdaten                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMunicipalities ? (
            <Skeleton className="h-32" />
          ) : municipalities.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Noch keine Gemeinde angelegt. Ohne Gemeinden lässt sich keine
              Anlage zuordnen und die Auswertung bleibt leer.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Gemeindeschlüssel</TableHead>
                  <TableHead>Bundesland</TableHead>
                  <TableHead className="text-right">Anlagen</TableHead>
                  <TableHead className="text-right">Flurstücke</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipalities.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.officialKey ?? "—"}
                    </TableCell>
                    <TableCell>{m.state ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m._count.turbines > 0 ? (
                        m._count.turbines
                      ) : (
                        <Badge variant="outline">0</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m._count.plots}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(m)}
                        aria-label={`${m.name} löschen`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gemeinde anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Name</Label>
              <Input
                id="m-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Musterdorf"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-key">Amtlicher Gemeindeschlüssel</Label>
              <Input
                id="m-key"
                value={form.officialKey}
                onChange={(e) =>
                  setForm({ ...form, officialKey: e.target.value })
                }
                placeholder="03456001"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">
                Acht Ziffern. Optional — aber der Steuerberater ordnet darüber
                zu, und es unterscheidet die fünfzehn Gemeinden namens
                &bdquo;Neustadt&ldquo;.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-state">Bundesland</Label>
              <Input
                id="m-state"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="Niedersachsen"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => createMunicipality.mutate(form)}
              disabled={!form.name.trim() || createMunicipality.isPending}
            >
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
