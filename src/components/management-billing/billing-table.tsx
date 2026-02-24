'use client';

import {
  MoreHorizontal,
  Eye,
  FileText,
  Download,
  Receipt,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/format';

// -- Types --

export type BillingStatus = 'DRAFT' | 'CALCULATED' | 'INVOICED' | 'CANCELLED';

export interface BillingStakeholder {
  id: string;
  stakeholderTenant: { name: string };
  park: { name: string };
}

export interface Billing {
  id: string;
  year: number;
  month: number | null;
  stakeholder: BillingStakeholder;
  baseRevenue: number;
  feePercentageUsed: number;
  feeNet: number;
  feeGross: number;
  status: BillingStatus;
}

export interface BillingTableProps {
  billings: Billing[];
  onView?: (id: string) => void;
  onCreateInvoice?: (id: string) => void;
  onDownloadPdf?: (id: string) => void;
}

// -- Status display configuration --

const STATUS_LABELS: Record<BillingStatus, string> = {
  DRAFT: 'Entwurf',
  CALCULATED: 'Berechnet',
  INVOICED: 'Fakturiert',
  CANCELLED: 'Storniert',
};

const STATUS_COLORS: Record<BillingStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  CALCULATED: 'bg-blue-100 text-blue-800',
  INVOICED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

/**
 * Formats a billing period as "MM/YYYY" (monthly) or "YYYY" (annual).
 */
function formatPeriod(year: number, month: number | null): string {
  if (month !== null && month > 0) {
    return `${String(month).padStart(2, '0')}/${year}`;
  }
  return String(year);
}

/**
 * Table component for management billing records.
 * Shows period, provider, park, revenue, fees, status, and contextual actions.
 */
export function BillingTable({
  billings,
  onView,
  onCreateInvoice,
  onDownloadPdf,
}: BillingTableProps) {
  if (billings.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Keine Abrechnungen vorhanden"
        description="Es wurden noch keine Verwaltungsabrechnungen erstellt."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Zeitraum</TableHead>
          <TableHead>Dienstleister</TableHead>
          <TableHead>Park</TableHead>
          <TableHead className="text-right">Basisumsatz</TableHead>
          <TableHead className="text-right">Gebühr %</TableHead>
          <TableHead className="text-right">Gebühr netto</TableHead>
          <TableHead className="text-right">Gebühr brutto</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[60px]">
            <span className="sr-only">Aktionen</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {billings.map((billing) => (
          <TableRow key={billing.id}>
            {/* Period */}
            <TableCell className="font-mono">
              {formatPeriod(billing.year, billing.month)}
            </TableCell>

            {/* Provider name */}
            <TableCell className="font-medium">
              {billing.stakeholder.stakeholderTenant.name}
            </TableCell>

            {/* Park name */}
            <TableCell>{billing.stakeholder.park.name}</TableCell>

            {/* Base revenue */}
            <TableCell className="text-right font-mono">
              {formatCurrency(billing.baseRevenue)}
            </TableCell>

            {/* Fee percentage used */}
            <TableCell className="text-right font-mono">
              {billing.feePercentageUsed.toFixed(2)} %
            </TableCell>

            {/* Fee net */}
            <TableCell className="text-right font-mono">
              {formatCurrency(billing.feeNet)}
            </TableCell>

            {/* Fee gross */}
            <TableCell className="text-right font-mono font-semibold">
              {formatCurrency(billing.feeGross)}
            </TableCell>

            {/* Status badge */}
            <TableCell>
              <Badge
                className={`${STATUS_COLORS[billing.status]} border-transparent`}
              >
                {STATUS_LABELS[billing.status]}
              </Badge>
            </TableCell>

            {/* Actions dropdown */}
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Aktionen</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onView?.(billing.id)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Anzeigen
                  </DropdownMenuItem>

                  {/* Show "Create Invoice" only for CALCULATED billings */}
                  {billing.status === 'CALCULATED' && (
                    <DropdownMenuItem
                      onClick={() => onCreateInvoice?.(billing.id)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Rechnung erstellen
                    </DropdownMenuItem>
                  )}

                  {/* Show "Download PDF" only for INVOICED billings */}
                  {billing.status === 'INVOICED' && (
                    <DropdownMenuItem
                      onClick={() => onDownloadPdf?.(billing.id)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF herunterladen
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
