'use client';

import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, History } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';

// -- Types --

export interface FeeHistoryEntry {
  id: string;
  validFrom: string;
  validTo: string | null;
  feePercentage: number;
  reason: string | null;
}

export interface FeeHistoryTableProps {
  history: FeeHistoryEntry[];
  stakeholderId?: string;
  onAddEntry?: () => void;
}

/**
 * Formats a date string to German locale "dd.MM.yyyy".
 */
function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy', { locale: de });
  } catch {
    return dateStr;
  }
}

/**
 * Simple table showing the chronological fee history for a stakeholder.
 * Displays valid from/to dates, fee percentage, and the reason for each change.
 */
export function FeeHistoryTable({
  history,
  onAddEntry,
}: FeeHistoryTableProps) {
  return (
    <div className="space-y-4">
      {/* Header with optional add button */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <History className="h-4 w-4" />
          Gebuehren-Historie
        </h3>
        {onAddEntry && (
          <Button variant="outline" size="sm" onClick={onAddEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Eintrag hinzufuegen
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={History}
          title="Keine Historie vorhanden"
          description="Es wurden noch keine Gebuehren-Aenderungen erfasst."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gueltig ab</TableHead>
                <TableHead>Gueltig bis</TableHead>
                <TableHead className="text-right">Gebuehr %</TableHead>
                <TableHead>Grund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  {/* Valid from */}
                  <TableCell className="font-mono">
                    {formatDate(entry.validFrom)}
                  </TableCell>

                  {/* Valid until - or "aktuell" badge for current entry */}
                  <TableCell>
                    {entry.validTo ? (
                      <span className="font-mono">
                        {formatDate(entry.validTo)}
                      </span>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 border-transparent">
                        aktuell
                      </Badge>
                    )}
                  </TableCell>

                  {/* Fee percentage */}
                  <TableCell className="text-right font-mono">
                    {entry.feePercentage.toFixed(2)} %
                  </TableCell>

                  {/* Reason */}
                  <TableCell className="text-muted-foreground">
                    {entry.reason || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
