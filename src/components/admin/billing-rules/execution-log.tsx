"use client";

/**
 * ExecutionLog Component
 * Zeigt die Ausfuehrungshistorie einer Billing Rule
 */

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Receipt,
  Euro,
} from "lucide-react";

export interface ExecutionData {
  id: string;
  status: "success" | "failed" | "partial";
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  invoicesCreated: number;
  totalAmount: number | null;
  errorMessage: string | null;
  details: {
    invoices?: Array<{
      success: boolean;
      invoiceId?: string;
      invoiceNumber?: string;
      recipientName?: string;
      amount?: number;
      error?: string;
    }>;
    summary?: {
      totalProcessed: number;
      successful: number;
      failed: number;
      skipped: number;
    };
    warnings?: string[];
    metadata?: Record<string, unknown>;
  } | null;
}

interface ExecutionLogProps {
  executions: ExecutionData[];
  isLoading?: boolean;
  statistics?: {
    totalExecutions: number;
    statusCounts: {
      success: number;
      failed: number;
      partial: number;
    };
    totalInvoicesCreated: number;
    totalAmount: number;
  };
}

const STATUS_CONFIG = {
  success: {
    label: "Erfolgreich",
    variant: "default" as const,
    icon: CheckCircle,
    className: "bg-green-100 text-green-800 border-green-200",
  },
  failed: {
    label: "Fehlgeschlagen",
    variant: "destructive" as const,
    icon: XCircle,
    className: "bg-red-100 text-red-800 border-red-200",
  },
  partial: {
    label: "Teilweise",
    variant: "secondary" as const,
    icon: AlertTriangle,
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ExecutionRow({ execution }: { execution: ExecutionData }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[execution.status];
  const StatusIcon = config.icon;

  const hasDetails =
    execution.details &&
    (execution.details.invoices?.length ||
      execution.details.warnings?.length ||
      execution.errorMessage);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <TableRow className="cursor-pointer" onClick={() => hasDetails && setIsOpen(!isOpen)}>
        <TableCell>
          <div className="flex items-center gap-2">
            {hasDetails ? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            ) : (
              <div className="w-6" />
            )}
            <Badge className={config.className}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        </TableCell>
        <TableCell>{formatDate(execution.startedAt)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(execution.duration)}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Receipt className="h-3 w-3 text-muted-foreground" />
            {execution.invoicesCreated}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Euro className="h-3 w-3 text-muted-foreground" />
            {formatCurrency(execution.totalAmount)}
          </div>
        </TableCell>
      </TableRow>

      {hasDetails && (
        <CollapsibleContent asChild>
          <TableRow>
            <TableCell colSpan={5} className="bg-muted/30 p-4">
              <div className="space-y-4">
                {/* Error Message */}
                {execution.errorMessage && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-800 font-medium">Fehler:</p>
                    <p className="text-sm text-red-700">{execution.errorMessage}</p>
                  </div>
                )}

                {/* Warnings */}
                {execution.details?.warnings && execution.details.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800 font-medium">Warnungen:</p>
                    <ul className="list-disc list-inside text-sm text-yellow-700">
                      {execution.details.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary */}
                {execution.details?.summary && (
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Verarbeitet</p>
                      <p className="font-medium">{execution.details.summary.totalProcessed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Erfolgreich</p>
                      <p className="font-medium text-green-600">
                        {execution.details.summary.successful}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Fehlgeschlagen</p>
                      <p className="font-medium text-red-600">
                        {execution.details.summary.failed}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Uebersprungen</p>
                      <p className="font-medium text-gray-600">
                        {execution.details.summary.skipped}
                      </p>
                    </div>
                  </div>
                )}

                {/* Invoice Details */}
                {execution.details?.invoices && execution.details.invoices.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Rechnungen:</p>
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead>Empfaenger</TableHead>
                            <TableHead>Rechnungsnr.</TableHead>
                            <TableHead className="text-right">Betrag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {execution.details.invoices.slice(0, 10).map((invoice, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                {invoice.success ? (
                                  <Badge className="bg-green-100 text-green-800">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    OK
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Fehler
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {invoice.recipientName || "-"}
                                {invoice.error && (
                                  <p className="text-xs text-red-600 mt-1">{invoice.error}</p>
                                )}
                              </TableCell>
                              <TableCell>{invoice.invoiceNumber || "-"}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(invoice.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {execution.details.invoices.length > 10 && (
                        <div className="p-2 bg-muted text-center text-sm text-muted-foreground">
                          + {execution.details.invoices.length - 10} weitere Rechnungen
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export function ExecutionLog({ executions, isLoading, statistics }: ExecutionLogProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ausfuehrungshistorie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Ausfuehrungshistorie</CardTitle>
        {statistics && (
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>{statistics.statusCounts.success}</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span>{statistics.statusCounts.partial}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-600" />
              <span>{statistics.statusCounts.failed}</span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {executions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Keine Ausfuehrungen vorhanden</p>
            <p className="text-sm">Diese Regel wurde noch nicht ausgefuehrt.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Status</TableHead>
                  <TableHead>Zeitpunkt</TableHead>
                  <TableHead className="w-[100px]">Dauer</TableHead>
                  <TableHead className="w-[120px]">Rechnungen</TableHead>
                  <TableHead className="w-[120px]">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((execution) => (
                  <ExecutionRow key={execution.id} execution={execution} />
                ))}
              </TableBody>
            </Table>

            {statistics && (
              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Gesamt Rechnungen erstellt</p>
                  <p className="text-lg font-semibold">{statistics.totalInvoicesCreated}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Gesamtbetrag</p>
                  <p className="text-lg font-semibold">{formatCurrency(statistics.totalAmount)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutionLog;
