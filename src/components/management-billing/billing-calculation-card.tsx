'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/format';
import { Calculator } from 'lucide-react';

// -- Types --

export interface FundBreakdown {
  fundId: string;
  fundName: string;
  revenue: number;
  share: number;
  feeAmount: number;
}

export interface CalculationDetails {
  fundBreakdowns?: FundBreakdown[];
}

export interface BillingDetail {
  id: string;
  baseRevenue: number;
  feePercentageUsed: number;
  feeNet: number;
  taxRate: number;
  taxAmount: number;
  feeGross: number;
  calculationDetails?: CalculationDetails | null;
}

export interface BillingCalculationCardProps {
  billing: BillingDetail;
}

/**
 * Card component showing a detailed billing calculation breakdown.
 * Displays base revenue, fee calculation, tax, and gross total.
 * If per-fund breakdown data exists, renders an additional sub-table.
 */
export function BillingCalculationCard({ billing }: BillingCalculationCardProps) {
  const fundBreakdowns = billing.calculationDetails?.fundBreakdowns;
  const hasFundBreakdown = fundBreakdowns && fundBreakdowns.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="h-5 w-5" />
          Berechnungsdetails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Calculation line items */}
        <div className="space-y-3">
          {/* Base revenue */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Basisumsatz</span>
            <span className="font-mono">
              {formatCurrency(billing.baseRevenue)}
            </span>
          </div>

          {/* Fee percentage */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Gebühr-Satz</span>
            <span className="font-mono">
              {billing.feePercentageUsed.toFixed(2)} %
            </span>
          </div>

          {/* Fee net */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Gebühr netto</span>
            <span className="font-mono">
              {formatCurrency(billing.feeNet)}
            </span>
          </div>

          {/* Tax rate + amount */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              USt. ({(billing.taxRate * 100).toFixed(0)} %)
            </span>
            <span className="font-mono">
              {formatCurrency(billing.taxAmount)}
            </span>
          </div>

          <Separator />

          {/* Fee gross - total */}
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">Gebühr brutto</span>
            <span className="text-lg font-semibold font-mono">
              {formatCurrency(billing.feeGross)}
            </span>
          </div>
        </div>

        {/* Per-fund breakdown table (if available) */}
        {hasFundBreakdown && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Aufschluesselung nach Gesellschaft
            </h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschaft</TableHead>
                    <TableHead className="text-right">Umsatz</TableHead>
                    <TableHead className="text-right">Anteil</TableHead>
                    <TableHead className="text-right">Gebühr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fundBreakdowns.map((fund) => (
                    <TableRow key={fund.fundId}>
                      <TableCell className="font-medium">
                        {fund.fundName}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(fund.revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(fund.share * 100).toFixed(2)} %
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(fund.feeAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
