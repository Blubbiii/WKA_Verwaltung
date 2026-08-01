"use client";

/**
 * Gemeindebeteiligung nach § 6 EEG — Vereinbarungen und Auswertung.
 *
 * Eigene Komponente statt eines weiteren Abschnitts in der Gemeinden-Seite:
 * die ist ohnehin schon lang, und „Riesenseiten aufteilen" steht als eigener
 * Befund (C4) noch auf der Liste. Neues dort anzuhängen wäre der Anfang des
 * nächsten Falls.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, HandCoins, Plus, Trash2 } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/use-confirm";
import { DataTable } from "@/components/ui/data-table";
import { formatCurrency, formatNumber } from "@/lib/format";

const MAX_RATE = 0.2;

interface Benefit {
  id: string;
  areaShare: string;
  rateCtPerKwh: string;
  reference: string | null;
  municipality: { id: string; name: string };
  turbine: { id: string; designation: string; park: { name: string } };
}

interface BenefitResult {
  year: number;
  totalEur: number;
  rows: { municipalityId: string; municipalityName: string; amountEur: number }[];
  warnings: string[];
}

interface TurbineOption {
  id: string;
  designation: string;
  deviceType?: string;
  park: { name: string } | null;
}

export function MunicipalityBenefitSection({
  year,
  municipalities,
}: {
  year: number;
  municipalities: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    turbineId: "",
    municipalityId: "",
    areaSharePercent: "",
    rateCtPerKwh: String(MAX_RATE).replace(".", ","),
    reference: "",
  });

  const { data: benefits = [], isLoading } = useQuery<Benefit[]>({
    queryKey: ["/api/municipality-benefits"],
    queryFn: async () => {
      const res = await fetch("/api/municipality-benefits");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).data;
    },
    staleTime: 60_000,
  });

  const { data: result } = useQuery<BenefitResult>({
    queryKey: ["/api/regulatory/municipality-benefit", year],
    queryFn: async () => {
      const res = await fetch(`/api/regulatory/municipality-benefit?year=${year}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: turbines = [] } = useQuery<TurbineOption[]>({
    queryKey: ["/api/turbines", "benefit-select"],
    queryFn: async () => {
      const res = await fetch("/api/turbines?limit=500");
      if (!res.ok) throw new Error(await res.text());
      // Nur echte Windkraftanlagen zur Auswahl stellen. `Turbine` traegt auch
      // die virtuelle Infrastruktur jedes Parks (Netzverknuepfungspunkt,
      // Parkrechner) — fuer die gibt es keinen 2.500-m-Umkreis und keine
      // Gemeindebeteiligung. Stuenden sie in der Liste, waere die erste
      // fehlerhafte Vereinbarung nur eine Frage der Zeit.
      const rows: TurbineOption[] = (await res.json()).data ?? [];
      return rows.filter((t) => (t.deviceType ?? "WEA") === "WEA");
    },
    staleTime: 300_000,
    enabled: dialogOpen,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/municipality-benefits"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/regulatory/municipality-benefit"],
    });
  }

  const createBenefit = useMutation({
    mutationFn: async () => {
      // Eingabe in Prozent, Speicherung als Dezimalbruch. Wer „70" tippt,
      // meint 70 % — die Umrechnung hier verhindert, dass daraus der Faktor
      // 70 und damit das Siebzigfache der Zahlung wird.
      const areaShare = Number(form.areaSharePercent.replace(",", ".")) / 100;
      const rate = Number(form.rateCtPerKwh.replace(",", "."));
      const res = await fetch("/api/municipality-benefits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turbineId: form.turbineId,
          municipalityId: form.municipalityId,
          areaShare,
          rateCtPerKwh: rate,
          reference: form.reference || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? "Anlegen fehlgeschlagen");
      return json as { warning?: string };
    },
    onSuccess: (json) => {
      invalidate();
      setDialogOpen(false);
      setForm({
        turbineId: "",
        municipalityId: "",
        areaSharePercent: "",
        rateCtPerKwh: String(MAX_RATE).replace(".", ","),
        reference: "",
      });
      toast.success("Vereinbarung erfasst");
      if (json.warning) toast.warning(json.warning);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBenefit = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/municipality-benefits/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Entfernen fehlgeschlagen");
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Vereinbarung entfernt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDelete(b: Benefit) {
    const confirmed = await confirm({
      title: "Vereinbarung entfernen",
      description: `${b.turbine.designation} → ${b.municipality.name}`,
      details: (
        <p>
          Eine <strong>ausgelaufene</strong> Vereinbarung sollte über ein
          Enddatum beendet und nicht entfernt werden — sonst stimmt die
          Auswertung zurückliegender Jahre nicht mehr.
        </p>
      ),
      variant: "destructive",
    });
    if (confirmed) deleteBenefit.mutate(b.id);
  }

  const canSubmit =
    form.turbineId &&
    form.municipalityId &&
    Number(form.areaSharePercent.replace(",", ".")) > 0 &&
    Number(form.rateCtPerKwh.replace(",", ".")) > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5" />
            Gemeindebeteiligung § 6 EEG
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Bis zu {String(MAX_RATE).replace(".", ",")} ct/kWh an die Gemeinden im
            Umkreis von 2.500 Metern — auf die eingespeiste Menge zuzüglich der
            fiktiven Menge bei Abregelung. Verteilt nach dem Anteil der
            Kreisfläche.
          </p>
        </div>
        <Button
          className="shrink-0"
          variant="outline"
          onClick={() => setDialogOpen(true)}
          disabled={municipalities.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Vereinbarung
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {result?.warnings.map((w, i) => (
          <Alert key={i} variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}

        {result && result.rows.length > 0 && (
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Zahlung {result.year}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gemeinde</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.municipalityId}>
                    <TableCell>{r.municipalityName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.amountEur)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-medium">
                  <TableCell>Summe</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(result.totalEur)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Vereinbarungen</p>
          <DataTable
            rows={benefits}
            getRowId={(b) => b.id}
            isLoading={isLoading}
            searchPlaceholder="Anlage oder Gemeinde suchen"
            pageSize={0}
            empty={{
              icon: HandCoins,
              title:
                municipalities.length === 0
                  ? "Zuerst eine Gemeinde anlegen"
                  : "Noch keine Vereinbarung erfasst",
              description:
                municipalities.length === 0
                  ? "Ohne Gemeinde lässt sich keine Vereinbarung erfassen."
                  : "Ohne Vereinbarung wird nichts berechnet.",
            }}
            columns={[
              {
                id: "turbine",
                header: "Anlage",
                cell: (b) => (
                  <>
                    <span className="font-medium">{b.turbine.designation}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {b.turbine.park.name}
                    </span>
                  </>
                ),
                sortValue: (b) => b.turbine.designation,
                searchValue: (b) => `${b.turbine.designation} ${b.turbine.park.name}`,
              },
              {
                id: "municipality",
                header: "Gemeinde",
                cell: (b) => b.municipality.name,
                sortValue: (b) => b.municipality.name,
                searchValue: (b) => b.municipality.name,
              },
              {
                id: "share",
                header: "Flächenanteil",
                align: "right",
                cell: (b) => (
                  <span className="tabular-nums">
                    {formatNumber(Number(b.areaShare) * 100, 2)} %
                  </span>
                ),
                sortValue: (b) => Number(b.areaShare),
              },
              {
                id: "rate",
                header: "Satz",
                align: "right",
                cell: (b) => (
                  <span
                    className={
                      Number(b.rateCtPerKwh) > MAX_RATE
                        ? "tabular-nums text-destructive"
                        : "tabular-nums"
                    }
                  >
                    {formatNumber(Number(b.rateCtPerKwh), 4)} ct/kWh
                  </span>
                ),
                sortValue: (b) => Number(b.rateCtPerKwh),
              },
              {
                id: "reference",
                header: "Aktenzeichen",
                cell: (b) => (
                  <span className="text-xs text-muted-foreground">
                    {b.reference ?? "—"}
                  </span>
                ),
                searchValue: (b) => b.reference ?? "",
              },
              {
                id: "actions",
                header: "",
                align: "right",
                cell: (b) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(b)}
                    aria-label="Vereinbarung entfernen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vereinbarung nach § 6 EEG</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Anlage</Label>
              <Select
                value={form.turbineId}
                onValueChange={(v) => setForm({ ...form, turbineId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Anlage wählen" />
                </SelectTrigger>
                <SelectContent>
                  {turbines.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.park?.name ? `${t.park.name} · ` : ""}
                      {t.designation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Gemeinde</Label>
              <Select
                value={form.municipalityId}
                onValueChange={(v) => setForm({ ...form, municipalityId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gemeinde wählen" />
                </SelectTrigger>
                <SelectContent>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-share">Flächenanteil (%)</Label>
                <Input
                  id="b-share"
                  value={form.areaSharePercent}
                  onChange={(e) =>
                    setForm({ ...form, areaSharePercent: e.target.value })
                  }
                  placeholder="70"
                  inputMode="decimal"
                />
                <p className="text-xs text-muted-foreground">
                  Anteil der 2.500-m-Kreisfläche laut Vereinbarung.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-rate">Satz (ct/kWh)</Label>
                <Input
                  id="b-rate"
                  value={form.rateCtPerKwh}
                  onChange={(e) =>
                    setForm({ ...form, rateCtPerKwh: e.target.value })
                  }
                  inputMode="decimal"
                />
                <p className="text-xs text-muted-foreground">
                  Höchstens {String(MAX_RATE).replace(".", ",")} — darüber ist
                  der übersteigende Teil nicht förderfähig.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-ref">Aktenzeichen</Label>
              <Input
                id="b-ref"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="Vereinbarung vom 12.03.2024"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => createBenefit.mutate()}
              disabled={!canSubmit || createBenefit.isPending}
            >
              Erfassen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </Card>
  );
}
