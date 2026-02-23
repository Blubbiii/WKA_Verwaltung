"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { BarChart3, Calculator, FileText, Wind } from "lucide-react";

// ============================================================================
// Types (matching SettlementPdfDetails from @/types/pdf)
// ============================================================================

interface RevenueTableEntry {
  category: string;
  rateCtPerKwh: number;
  productionKwh: number;
  revenueEur: number;
}

interface CalculationSummary {
  totalRevenueEur: number;
  revenuePhasePercentage: number;
  calculatedAnnualFee: number;
  minimumPerContract: number;
  actualAnnualFee: number;
  weaSharePercentage: number;
  weaShareAmount: number;
  weaSharePerUnit: number;
  weaCount: number;
  poolSharePercentage: number;
  poolShareAmount: number;
  poolSharePerHa: number;
  poolTotalHa: number;
  parkName: string;
  year: number;
}

interface TurbineProductionEntry {
  designation: string;
  productionKwh: number;
  operatingHours: number | null;
  availabilityPct: number | null;
  productionSharePct?: number;
  revenueShareEur?: number;
}

interface EnergyDistributionSummary {
  mode: string;
  modeLabel: string;
  parkName: string;
  year: number;
  month?: number;
  totalProductionKwh: number;
  averageProductionKwh: number;
  netOperatorRevenueEur: number;
  pricePerKwh: number;
  recipientName: string;
  recipientTurbineCount: number;
  recipientProductionKwh: number;
  recipientProductionSharePct: number;
  recipientRevenueEur: number;
}

interface FeePositionEntry {
  description: string;
  netAmount: number;
  taxType: "STANDARD" | "EXEMPT";
}

interface SettlementPdfDetails {
  type: "ADVANCE" | "FINAL" | "ENERGY";
  subtitle?: string;
  introText?: string;
  revenueTable?: RevenueTableEntry[];
  revenueTableTotal?: number;
  calculationSummary?: CalculationSummary;
  feePositions?: FeePositionEntry[];
  turbineProductions?: TurbineProductionEntry[];
  energyDistribution?: EnergyDistributionSummary;
}

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(value: number, decimals: number = 1): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number, decimals: number = 2): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) + " %";
}

// ============================================================================
// Component
// ============================================================================

interface SettlementDetailsCardProps {
  calculationDetails: unknown;
}

export function SettlementDetailsCard({ calculationDetails }: SettlementDetailsCardProps) {
  // Parse and validate calculationDetails
  if (!calculationDetails || typeof calculationDetails !== "object") return null;

  const details = calculationDetails as SettlementPdfDetails;
  if (!details.type) return null;

  const hasRevenue = details.revenueTable && details.revenueTable.length > 0;
  const hasCalculation = !!details.calculationSummary;
  const hasFeePositions = details.feePositions && details.feePositions.length > 0;
  const hasTurbines = details.turbineProductions && details.turbineProductions.length > 0;
  const hasEnergyDistribution = !!details.energyDistribution;
  const isEnergy = details.type === "ENERGY";

  // If there's nothing to show, don't render
  if (!hasRevenue && !hasCalculation && !hasFeePositions && !hasTurbines && !hasEnergyDistribution) return null;

  const totalProductionKwh = details.turbineProductions?.reduce(
    (sum, t) => sum + t.productionKwh, 0
  ) ?? 0;

  const totalOperatingHours = details.turbineProductions?.reduce(
    (sum, t) => sum + (t.operatingHours ?? 0), 0
  ) ?? 0;

  let sectionNum = 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Berechnungsnachweis
        </CardTitle>
        {details.subtitle && (
          <p className="text-sm text-muted-foreground">{details.subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-8">

        {/* 1. Ertragsübersicht */}
        {hasRevenue && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {sectionNum++}. Ertragsuebersicht
            </h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategorie</TableHead>
                    <TableHead className="text-right">Verguetung</TableHead>
                    <TableHead className="text-right">Einspeisung</TableHead>
                    <TableHead className="text-right">Ertrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.revenueTable!.map((entry, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{entry.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.rateCtPerKwh, 4)} ct/kWh
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.productionKwh)} kWh
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(entry.revenueEur)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">Gesamt</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(details.revenueTableTotal ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </section>
        )}

        {/* 2a. Verteilungsnachweis (Energy only) */}
        {hasEnergyDistribution && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              {sectionNum++}. Verteilungsnachweis
            </h3>
            {renderEnergyDistribution(details.energyDistribution!)}
          </section>
        )}

        {/* 2b. Berechnungsübersicht (Lease only) */}
        {hasCalculation && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              {sectionNum++}. Berechnungsuebersicht
            </h3>
            {renderCalculationSummary(details.calculationSummary!)}
          </section>
        )}

        {/* 3. Positionsaufstellung (Lease only) */}
        {hasFeePositions && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {sectionNum++}. Positionsaufstellung
            </h3>
            {renderFeePositions(details.feePositions!)}
          </section>
        )}

        {/* 4. Ertrag je Anlage */}
        {hasTurbines && (
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wind className="h-4 w-4" />
              {sectionNum++}. Ertrag je Anlage
            </h3>
            {isEnergy
              ? renderEnergyTurbineTable(details.turbineProductions!)
              : renderLeaseTurbineTable(details.turbineProductions!, totalProductionKwh, totalOperatingHours)
            }
          </section>
        )}

      </CardContent>
    </Card>
  );
}

// ============================================================================
// Sub-renderers
// ============================================================================

function renderEnergyDistribution(dist: EnergyDistributionSummary) {
  const periodStr = dist.month
    ? `${String(dist.month).padStart(2, "0")}/${dist.year}`
    : `${dist.year}`;

  return (
    <div className="space-y-4">
      {/* Park & Period info */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
        <div>
          <p className="text-xs text-muted-foreground">Windpark</p>
          <p className="font-medium">{dist.parkName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Abrechnungszeitraum</p>
          <p className="font-medium">{periodStr}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Verteilungsmodus</p>
          <p className="font-medium">
            <Badge variant="secondary" className="text-xs">{dist.modeLabel}</Badge>
          </p>
        </div>
      </div>

      {/* Park totals */}
      <div className="rounded-md border">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Gesamterloes Park</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(dist.netOperatorRevenueEur)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Gesamtproduktion Park</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(dist.totalProductionKwh)} kWh
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Durchschnittsproduktion je WEA</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(dist.averageProductionKwh)} kWh
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Preis je kWh</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(dist.pricePerKwh * 100, 4)} ct/kWh
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Separator />

      {/* Recipient share (highlighted) */}
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Anteil Empfaenger
      </h4>
      <div className="rounded-md border bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{dist.recipientName}</span>
          <Badge variant="secondary">
            {dist.recipientTurbineCount} {dist.recipientTurbineCount === 1 ? "Anlage" : "Anlagen"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Produktion</p>
            <p className="font-medium tabular-nums">{formatNumber(dist.recipientProductionKwh)} kWh</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatPercent(dist.recipientProductionSharePct)} Anteil
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Zugewiesener Erloes</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(dist.recipientRevenueEur)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderEnergyTurbineTable(turbines: TurbineProductionEntry[]) {
  const totalProduction = turbines.reduce((sum, t) => sum + t.productionKwh, 0);
  const totalRevenue = turbines.reduce((sum, t) => sum + (t.revenueShareEur ?? 0), 0);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Anlage</TableHead>
            <TableHead className="text-right">Produktion kWh</TableHead>
            <TableHead className="text-right">Anteil %</TableHead>
            <TableHead className="text-right">Erloes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {turbines.map((turbine, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{turbine.designation}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(turbine.productionKwh)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {turbine.productionSharePct != null ? formatPercent(turbine.productionSharePct) : "-"}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {turbine.revenueShareEur != null ? formatCurrency(turbine.revenueShareEur) : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Gesamt ({turbines.length} Anlagen)</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatNumber(totalProduction)}
            </TableCell>
            <TableCell className="text-right">-</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatCurrency(totalRevenue)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function renderLeaseTurbineTable(turbines: TurbineProductionEntry[], totalProductionKwh: number, totalOperatingHours: number) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Anlage</TableHead>
            <TableHead className="text-right">Produktion kWh</TableHead>
            <TableHead className="text-right">Betriebsstunden</TableHead>
            <TableHead className="text-right">Verfuegbarkeit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {turbines.map((turbine, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{turbine.designation}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(turbine.productionKwh)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {turbine.operatingHours != null ? formatNumber(turbine.operatingHours, 0) : "-"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {turbine.availabilityPct != null ? formatPercent(turbine.availabilityPct, 1) : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Gesamt ({turbines.length} Anlagen)</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatNumber(totalProductionKwh)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {totalOperatingHours > 0 ? formatNumber(totalOperatingHours, 0) : "-"}
            </TableCell>
            <TableCell className="text-right">-</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function renderCalculationSummary(summary: CalculationSummary) {
  const usedMinimum = summary.actualAnnualFee === summary.minimumPerContract;
  const usedRevenue = summary.actualAnnualFee === summary.calculatedAnnualFee;

  return (
    <div className="space-y-4">
      {/* Park & Year info */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
        <div>
          <p className="text-xs text-muted-foreground">Windpark</p>
          <p className="font-medium">{summary.parkName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Abrechnungsjahr</p>
          <p className="font-medium">{summary.year}</p>
        </div>
      </div>

      {/* Calculation steps */}
      <div className="rounded-md border">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Gesamterloes Park</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(summary.totalRevenueEur)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                Verguetungssatz (Ertragsphase)
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(summary.revenuePhasePercentage)}
              </TableCell>
            </TableRow>

            <TableRow className="bg-muted/30">
              <TableCell className="font-medium">
                Rechnerisches Jahresnutzungsentgelt
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatCurrency(summary.calculatedAnnualFee)}
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell className="font-medium">
                Mindestnutzungsentgelt gemaess Vertrag
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(summary.minimumPerContract)}
              </TableCell>
            </TableRow>

            <TableRow className="bg-primary/5 border-t-2 border-primary/20">
              <TableCell className="font-semibold">
                Tatsaechliches Jahresnutzungsentgelt{" "}
                <Badge variant="outline" className="ml-2 text-xs">
                  {usedMinimum ? "Minimum" : usedRevenue ? "Ertragsabhaengig" : "Berechnet"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold text-lg">
                {formatCurrency(summary.actualAnnualFee)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Separator />

      {/* Distribution: WEA + Pool */}
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Verteilung
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* WEA-Standort share */}
        <div className="rounded-md border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">WEA-Standort</span>
            <Badge variant="secondary">{formatPercent(summary.weaSharePercentage, 0)}</Badge>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {formatCurrency(summary.weaShareAmount)}
          </div>
          <div className="text-xs text-muted-foreground">
            {summary.weaCount} Anlagen x {formatCurrency(summary.weaSharePerUnit)} / WEA
          </div>
        </div>

        {/* Pool share */}
        <div className="rounded-md border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Poolflaeche</span>
            <Badge variant="secondary">{formatPercent(summary.poolSharePercentage, 0)}</Badge>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {formatCurrency(summary.poolShareAmount)}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatNumber(summary.poolTotalHa, 2)} ha x {formatCurrency(summary.poolSharePerHa)} / ha
          </div>
        </div>
      </div>
    </div>
  );
}

function renderFeePositions(positions: FeePositionEntry[]) {
  const positivePositions = positions.filter(p => p.netAmount > 0);
  const negativePositions = positions.filter(p => p.netAmount < 0);
  const totalPositive = positivePositions.reduce((sum, p) => sum + p.netAmount, 0);
  const totalNegative = negativePositions.reduce((sum, p) => sum + p.netAmount, 0);
  const netTotal = totalPositive + totalNegative;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Beschreibung</TableHead>
            <TableHead className="w-[100px]">Steuerart</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Positive positions (fees) */}
          {positivePositions.map((pos, idx) => (
            <TableRow key={`pos-${idx}`}>
              <TableCell className="whitespace-pre-line">{pos.description}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {pos.taxType === "STANDARD" ? "19% MwSt" : "steuerfrei"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium text-green-700">
                {formatCurrency(pos.netAmount)}
              </TableCell>
            </TableRow>
          ))}

          {/* Separator between positive and negative */}
          {negativePositions.length > 0 && positivePositions.length > 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-xs text-muted-foreground font-medium pt-4">
                Abzuege (Vorschuss-Verrechnung)
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground font-medium pt-4">
                {formatCurrency(totalPositive)}
              </TableCell>
            </TableRow>
          )}

          {/* Negative positions (advance deductions) */}
          {negativePositions.map((pos, idx) => (
            <TableRow key={`neg-${idx}`}>
              <TableCell className="whitespace-pre-line">{pos.description}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {pos.taxType === "STANDARD" ? "19% MwSt" : "steuerfrei"}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium text-red-600">
                {formatCurrency(pos.netAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="font-semibold">Netto-Auszahlung</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatCurrency(netTotal)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
