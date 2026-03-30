"use client";

import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, AlertTriangle,
  Zap, BarChart3, ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { MarketComparisonResponse } from "@/types/market-data";

interface MarketComparisonProps {
  parks: { id: string; name: string; shortName: string | null }[];
}

const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eurCompact = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function MarketComparison({ parks }: MarketComparisonProps) {
  const [parkId, setParkId] = useState(parks[0]?.id ?? "");
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<MarketComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available years (current year down to 5 years ago)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  // Fetch comparison data
  useEffect(() => {
    if (!parkId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/energy/analytics/market-comparison?parkId=${parkId}&year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          setData(null);
        } else {
          setData(d);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [parkId, year]);

  // Sync market prices from SMARD
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/energy/market-prices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, forceRefresh: true }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      toast.success(`Marktdaten synchronisiert: ${result.inserted + result.updated} Monate`);
      // Reload comparison
      setLoading(true);
      fetch(`/api/energy/analytics/market-comparison?parkId=${parkId}&year=${year}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setData(d); })
        .finally(() => setLoading(false));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync fehlgeschlagen");
    } finally {
      setSyncing(false);
    }
  };

  if (parks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Keine Parks vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={parkId} onValueChange={setParkId}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Park auswählen" />
          </SelectTrigger>
          <SelectContent>
            {parks.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.shortName || p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          SMARD-Daten synchronisieren
        </Button>

        {data?.meta.lastSyncAt && (
          <span className="text-xs text-muted-foreground">
            Letzte Aktualisierung: {new Date(data.meta.lastSyncAt).toLocaleDateString("de-DE")}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-normal">Gesamtproduktion</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{numFmt.format(data.summary.totalProductionMwh)} MWh</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-normal">EEG-Erlöse</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{eurCompact.format(data.summary.totalEegRevenueEur)}</p>
                <p className="text-xs text-muted-foreground">{numFmt.format(data.summary.avgEegRateCtKwh)} ct/kWh</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-normal">Marktwert-Erlöse</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{eurCompact.format(data.summary.totalMarketRevenueEur)}</p>
                <p className="text-xs text-muted-foreground">{numFmt.format(data.summary.avgMarketPriceCtKwh)} ct/kWh</p>
              </CardContent>
            </Card>

            <Card className={data.summary.totalDifferenceEur > 0 ? "border-green-500/30" : data.summary.totalDifferenceEur < 0 ? "border-red-500/30" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <ArrowRightLeft className="h-3 w-3" />
                  Differenz
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${data.summary.totalDifferenceEur > 0 ? "text-green-600" : data.summary.totalDifferenceEur < 0 ? "text-red-600" : ""}`}>
                  {data.summary.totalDifferenceEur > 0 ? "+" : ""}{eurCompact.format(data.summary.totalDifferenceEur)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {data.summary.recommendation === "DIREKTVERMARKTUNG" ? (
                    <Badge className="bg-green-100 text-green-800 text-[10px]">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Direktvermarktung profitabler
                    </Badge>
                  ) : data.summary.recommendation === "EEG" ? (
                    <Badge className="bg-blue-100 text-blue-800 text-[10px]">
                      <TrendingDown className="h-3 w-3 mr-1" />
                      EEG-Vergütung vorteilhafter
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      <Minus className="h-3 w-3 mr-1" />
                      Ausgeglichen
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* No market data warning */}
          {!data.meta.marketDataAvailable && (
            <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="pt-6 flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  Keine Marktdaten für {year} vorhanden. Klicken Sie &quot;SMARD-Daten synchronisieren&quot; um Preise zu laden.
                </span>
              </CardContent>
            </Card>
          )}

          {/* Chart 1: Monthly comparison bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Monatlicher Erlösvergleich — {data.meta.parkName} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={data.monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => eurCompact.format(v)} className="text-xs" />
                  <Tooltip
                    formatter={(value, name) => [
                      eurFmt.format(Number(value)),
                      name === "eegRevenueEur" ? "EEG-Erlöse" : "Markt-Erlöse",
                    ]}
                    labelFormatter={(label) => `${label} ${year}`}
                    contentStyle={{ fontSize: "12px" }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "eegRevenueEur" ? "EEG-Vergütung" : "Marktwert"
                    }
                  />
                  <Bar dataKey="eegRevenueEur" fill="hsl(215, 50%, 40%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="marketRevenueEur" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Chart 2: Cumulative difference line chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Kumulative Differenz (Markt − EEG)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.cumulativeDifference} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => eurCompact.format(v)} className="text-xs" />
                  <Tooltip
                    formatter={(value) => [eurFmt.format(Number(value)), "Kumulative Differenz"]}
                    contentStyle={{ fontSize: "12px" }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="cumulativeEur"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Positiv = Direktvermarktung wäre profitabler gewesen · Negativ = EEG war vorteilhafter
              </p>
            </CardContent>
          </Card>

          {/* Data source info */}
          <p className="text-xs text-muted-foreground text-center">
            Marktdaten: {data.meta.marketDataSource} · Monatliche Durchschnittspreise (Day-Ahead)
          </p>
        </>
      )}
    </div>
  );
}
