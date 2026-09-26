"use client";

/**
 * Marktprämie (decision E5, 2026-09): spot prices, monthly premium per
 * turbine and the hours with negative prices (§ 51 EEG).
 *
 * The calculation itself lives in POST /api/energy/market-premium and
 * lib/market-premium. This page supplies what it needs and cannot guess:
 * the hourly price series (SMARD import) and the monthly market value
 * Wind onshore, which the transmission system operators publish.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Coins, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpotPriceCard } from "@/components/energy/market-premium/spot-price-card";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useParks } from "@/hooks/useParks";
import { formatCurrency, formatNumber } from "@/lib/format";
import { parseAmount } from "@/lib/parse-amount";

interface Berechnung {
  id: string;
  year: number;
  month: number;
  awardValueCtPerKwh: string | null;
  marketValueCtPerKwh: string | null;
  appliedValueCtPerKwh: string | null;
  premiumCtPerKwh: string | null;
  productionKwh: string | null;
  premiumEur: string | null;
  negativeHours: number | null;
  affectedHours: number | null;
  turbine: { id: string; designation: string; park: { id: string; name: string; shortName: string | null } };
}

const ALLE = "__all__";
const zahl = (v: string | null) => (v === null ? null : Number(v));

export default function MarketPremiumPage() {
  const t = useTranslations("marketPremium");
  const queryClient = useQueryClient();
  const heute = new Date();
  // Default: the previous month — the current one is not complete yet.
  const vormonat = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);
  const [jahr, setJahr] = useState(vormonat.getFullYear());
  const [monat, setMonat] = useState(vormonat.getMonth() + 1);
  const [parkId, setParkId] = useState(ALLE);
  const [marktwert, setMarktwert] = useState("");
  const [ersetzen, setErsetzen] = useState(false);
  const [hinweise, setHinweise] = useState<string[]>([]);

  const { parks } = useParks();
  const { data, isLoading } = useApiQuery<{ data: Berechnung[] }>(
    ["market-premium", String(jahr)],
    `/api/energy/market-premium?year=${jahr}`,
  );
  const zeilen = (data?.data ?? []).filter(
    (b) => b.month === monat && (parkId === ALLE || b.turbine.park.id === parkId),
  );

  const berechnen = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/energy/market-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: jahr,
          month: monat,
          ...(parkId !== ALLE ? { parkId } : {}),
          marketValueCtPerKwh: parseAmount(marktwert),
          overwrite: ersetzen,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("calculateError"));
      return json as { computed: number; skipped: string[]; warnings: string[] };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["market-premium"] });
      toast.success(t("calculated", { computed: r.computed, skipped: r.skipped.length }));
      setHinweise(r.warnings);
    },
    onError: (e) => toast.error(e.message),
  });

  const jahre = Array.from({ length: 6 }, (_, i) => heute.getFullYear() - i);
  const summe = zeilen.reduce((s, b) => s + (zahl(b.premiumEur) ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="mp-monat">{t("month")}</Label>
          <Select value={String(monat)} onValueChange={(v) => setMonat(Number(v))}>
            <SelectTrigger id="mp-monat" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {new Date(2000, i, 1).toLocaleDateString("de-DE", { month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mp-jahr">{t("year")}</Label>
          <Select value={String(jahr)} onValueChange={(v) => setJahr(Number(v))}>
            <SelectTrigger id="mp-jahr" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jahre.map((j) => (
                <SelectItem key={j} value={String(j)}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mp-park">{t("park")}</Label>
          <Select value={parkId} onValueChange={setParkId}>
            <SelectTrigger id="mp-park" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLE}>{t("allParks")}</SelectItem>
              {(parks ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SpotPriceCard year={jahr} month={monat} />

        <Card>
          <CardHeader>
            <CardTitle>{t("calculate.title")}</CardTitle>
            <CardDescription>{t("calculate.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mp-marktwert">{t("calculate.marketValue")}</Label>
              <Input
                id="mp-marktwert"
                inputMode="decimal"
                placeholder="z. B. 6,512"
                value={marktwert}
                onChange={(e) => setMarktwert(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("calculate.marketValueHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="mp-ersetzen" checked={ersetzen} onCheckedChange={(v) => setErsetzen(v === true)} />
              <Label htmlFor="mp-ersetzen" className="font-normal">
                {t("calculate.overwrite")}
              </Label>
            </div>
            <Button onClick={() => berechnen.mutate()} disabled={berechnen.isPending}>
              {berechnen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              {t("calculate.submit")}
            </Button>
            {hinweise.map((h) => (
              <p key={h} className="flex items-start gap-2 text-xs text-amber-600">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {h}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <DataTable
        rows={zeilen}
        getRowId={(b) => b.id}
        isLoading={isLoading}
        searchPlaceholder={t("table.search")}
        empty={{ icon: Coins, title: t("table.empty"), description: t("table.emptyHint") }}
        footer={
          zeilen.length > 0 ? (
            <p className="text-right text-sm font-medium">{t("table.total", { sum: formatCurrency(summe) })}</p>
          ) : undefined
        }
        columns={[
          {
            id: "turbine",
            header: t("table.turbine"),
            cell: (b) => (
              <>
                {b.turbine.designation}
                <span className="block text-xs text-muted-foreground">
                  {b.turbine.park.shortName || b.turbine.park.name}
                </span>
              </>
            ),
            sortValue: (b) => b.turbine.designation,
            searchValue: (b) => `${b.turbine.designation} ${b.turbine.park.name}`,
          },
          {
            id: "aw",
            header: t("table.awardValue"),
            align: "right",
            cell: (b) => (zahl(b.appliedValueCtPerKwh) === null ? "–" : formatNumber(zahl(b.appliedValueCtPerKwh)!, 3)),
            sortValue: (b) => zahl(b.appliedValueCtPerKwh),
          },
          {
            id: "mw",
            header: t("table.marketValue"),
            align: "right",
            cell: (b) => (zahl(b.marketValueCtPerKwh) === null ? "–" : formatNumber(zahl(b.marketValueCtPerKwh)!, 3)),
          },
          {
            id: "premiumCt",
            header: t("table.premiumCt"),
            align: "right",
            cell: (b) => (zahl(b.premiumCtPerKwh) === null ? "–" : formatNumber(zahl(b.premiumCtPerKwh)!, 3)),
            sortValue: (b) => zahl(b.premiumCtPerKwh),
          },
          {
            id: "production",
            header: t("table.production"),
            align: "right",
            cell: (b) => (zahl(b.productionKwh) === null ? "–" : formatNumber(zahl(b.productionKwh)! / 1000, 1)),
            sortValue: (b) => zahl(b.productionKwh),
          },
          {
            id: "premiumEur",
            header: t("table.premiumEur"),
            align: "right",
            cell: (b) => (zahl(b.premiumEur) === null ? "–" : formatCurrency(zahl(b.premiumEur))),
            sortValue: (b) => zahl(b.premiumEur),
          },
          {
            id: "negative",
            header: t("table.negativeHours"),
            align: "right",
            // Unknown (no price series) is not zero.
            cell: (b) =>
              b.negativeHours === null ? (
                <span className="text-muted-foreground">{t("table.unknown")}</span>
              ) : (
                `${b.negativeHours} / ${b.affectedHours ?? 0}`
              ),
            sortValue: (b) => b.affectedHours,
          },
        ]}
      />
    </div>
  );
}
