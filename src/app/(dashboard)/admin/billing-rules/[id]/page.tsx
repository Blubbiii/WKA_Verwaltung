"use client";

/**
 * Billing Rule Detail Page
 * /admin/billing-rules/[id]
 */

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ExecutionLog, type ExecutionData } from "@/components/admin/billing-rules";
import {
  ArrowLeft,
  Play,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  Receipt,
  Euro,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  History,
  Loader2,
} from "lucide-react";

// Types
interface BillingRuleDetail {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  frequency: string;
  cronPattern: string | null;
  dayOfMonth: number | null;
  parameters: Record<string, unknown>;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  executionCount: number;
  recentExecutions: ExecutionData[];
}

interface ExecutionsResponse {
  rule: { id: string; name: string; ruleType: string };
  data: ExecutionData[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  statistics: {
    totalExecutions: number;
    statusCounts: { success: number; failed: number; partial: number };
    totalInvoicesCreated: number;
    totalAmount: number;
  };
}

// Labels
const RULE_TYPE_LABELS: Record<string, string> = {
  LEASE_PAYMENT: "Pachtzahlung",
  DISTRIBUTION: "Ausschuettung",
  MANAGEMENT_FEE: "Verwaltungsgebühr",
  CUSTOM: "Benutzerdefiniert",
};

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Vierteljährlich",
  SEMI_ANNUAL: "Halbjährlich",
  ANNUAL: "Jährlich",
  CUSTOM_CRON: "Benutzerdefiniert",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ParameterDisplay({ parameters, ruleType }: { parameters: Record<string, unknown>; ruleType: string }) {
  const renderValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "Ja" : "Nein";
    if (typeof value === "number") return value.toLocaleString("de-DE");
    if (Array.isArray(value)) return JSON.stringify(value);
    return String(value);
  };

  const labelMap: Record<string, string> = {
    parkId: "Park ID",
    fundId: "Gesellschaft ID",
    totalAmount: "Gesamtbetrag",
    description: "Beschreibung",
    taxType: "Steuerart",
    useMinimumRent: "Mindestpacht verwenden",
    calculationType: "Berechnungsart",
    amount: "Betrag",
    percentage: "Prozentsatz",
    baseValue: "Basiswert",
    recipientName: "Empfänger",
    recipientAddress: "Adresse",
    invoiceType: "Rechnungstyp",
    items: "Positionen",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Object.entries(parameters).map(([key, value]) => (
        <div key={key} className="space-y-1">
          <p className="text-sm text-muted-foreground">{labelMap[key] || key}</p>
          <p className="font-medium">
            {key === "totalAmount" || key === "amount"
              ? formatCurrency(value as number)
              : renderValue(key, value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function BillingRuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [rule, setRule] = useState<BillingRuleDetail | null>(null);
  const [executions, setExecutions] = useState<ExecutionData[]>([]);
  const [statistics, setStatistics] = useState<ExecutionsResponse["statistics"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    dryRun: boolean;
    success: boolean;
    summary: {
      invoicesCreated: number;
      totalAmount: number;
      totalProcessed: number;
      successful: number;
      failed: number;
    };
    invoices: Array<{
      success: boolean;
      recipientName?: string;
      invoiceNumber?: string;
      amount?: number;
      error?: string;
    }>;
  } | null>(null);

  // Fetch Rule Details
  const fetchRule = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/billing-rules/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Regel nicht gefunden");
          router.push("/admin/billing-rules");
          return;
        }
        throw new Error("Fehler beim Laden");
      }

      const data = await response.json();
      setRule(data);
      setExecutions(data.recentExecutions || []);
    } catch (error) {
      toast.error("Fehler beim Laden der Regel");
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  // Fetch Executions
  const fetchExecutions = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/billing-rules/${id}/executions?limit=50`);
      if (!response.ok) throw new Error();

      const data: ExecutionsResponse = await response.json();
      setExecutions(data.data);
      setStatistics(data.statistics);
    } catch {
    }
  }, [id]);

  useEffect(() => {
    fetchRule();
    fetchExecutions();
  }, [fetchRule, fetchExecutions]);

  // Execute Rule
  const executeRule = async (dryRun: boolean) => {
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const response = await fetch(
        `/api/admin/billing-rules/${id}/execute?dryRun=${dryRun}`,
        { method: "POST" }
      );

      const result = await response.json();

      setExecutionResult({
        dryRun,
        success: result.success,
        summary: result.summary,
        invoices: result.invoices || [],
      });

      if (result.success) {
        toast.success(
          dryRun
            ? `Vorschau: ${result.summary.totalProcessed} Rechnungen wuerden erstellt`
            : `${result.summary.invoicesCreated} Rechnungen erstellt`
        );
        if (!dryRun) {
          fetchRule();
          fetchExecutions();
        }
      } else {
        toast.error(result.errorMessage || "Ausführung fehlgeschlagen");
      }
    } catch (error) {
      toast.error("Fehler bei der Ausführung");
    } finally {
      setIsExecuting(false);
    }
  };

  // Delete Rule
  const deleteRule = async () => {
    try {
      const response = await fetch(`/api/admin/billing-rules/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Regel deaktiviert");
        router.push("/admin/billing-rules");
      } else {
        throw new Error();
      }
    } catch (error) {
      toast.error("Fehler beim Deaktivieren");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!rule) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/billing-rules">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{rule.name}</h1>
              {rule.isActive ? (
                <Badge className="bg-green-100 text-green-800">Aktiv</Badge>
              ) : (
                <Badge variant="secondary">Inaktiv</Badge>
              )}
            </div>
            {rule.description && (
              <p className="text-muted-foreground mt-1">{rule.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => executeRule(true)} disabled={isExecuting}>
            {isExecuting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Vorschau
          </Button>
          <Button onClick={() => executeRule(false)} disabled={isExecuting || !rule.isActive}>
            {isExecuting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Jetzt ausfuehren
          </Button>
        </div>
      </div>

      {/* Execution Result */}
      {executionResult && (
        <Card className={executionResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {executionResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {executionResult.dryRun ? "Vorschau-Ergebnis" : "Ausführungsergebnis"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Verarbeitet</p>
                <p className="text-2xl font-bold">{executionResult.summary.totalProcessed}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Erfolgreich</p>
                <p className="text-2xl font-bold text-green-600">
                  {executionResult.summary.successful}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fehlgeschlagen</p>
                <p className="text-2xl font-bold text-red-600">
                  {executionResult.summary.failed}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gesamtbetrag</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(executionResult.summary.totalAmount)}
                </p>
              </div>
            </div>
            {executionResult.invoices.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm">Details:</p>
                <div className="max-h-48 overflow-auto">
                  {executionResult.invoices.slice(0, 10).map((inv, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 text-sm border-b last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        {inv.success ? (
                          <CheckCircle className="h-3 w-3 text-green-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-600" />
                        )}
                        <span>{inv.recipientName || "Unbekannt"}</span>
                        {inv.error && (
                          <span className="text-red-600 text-xs">({inv.error})</span>
                        )}
                      </div>
                      <span>{formatCurrency(inv.amount)}</span>
                    </div>
                  ))}
                  {executionResult.invoices.length > 10 && (
                    <p className="text-xs text-muted-foreground py-2">
                      + {executionResult.invoices.length - 10} weitere...
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Übersicht
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Ausführungshistorie
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Receipt className="h-4 w-4" />
                  <span className="text-sm">Typ</span>
                </div>
                <p className="text-lg font-semibold">
                  {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Frequenz</span>
                </div>
                <p className="text-lg font-semibold">
                  {FREQUENCY_LABELS[rule.frequency] || rule.frequency}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Letzte Ausführung</span>
                </div>
                <p className="text-lg font-semibold">{formatDate(rule.lastRunAt)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Nächste Ausführung</span>
                </div>
                <p className="text-lg font-semibold">{formatDate(rule.nextRunAt)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Parameters */}
          <Card>
            <CardHeader>
              <CardTitle>Parameter</CardTitle>
              <CardDescription>
                Konfiguration für {RULE_TYPE_LABELS[rule.ruleType]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ParameterDisplay parameters={rule.parameters} ruleType={rule.ruleType} />
            </CardContent>
          </Card>

          {/* Scheduling Details */}
          <Card>
            <CardHeader>
              <CardTitle>Zeitplanung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Tag im Monat</p>
                  <p className="font-medium">{rule.dayOfMonth || "1"}.</p>
                </div>
                {rule.cronPattern && (
                  <div>
                    <p className="text-sm text-muted-foreground">Cron-Pattern</p>
                    <p className="font-mono text-sm">{rule.cronPattern}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Ausführungen gesamt</p>
                  <p className="font-medium">{rule.executionCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button variant="outline" asChild>
                <Link href={`/admin/billing-rules/${id}/edit`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Bearbeiten
                </Link>
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deaktivieren
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regel deaktivieren?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Die Regel wird deaktiviert und nicht mehr automatisch ausgeführt.
                      Die Ausführungshistorie bleibt erhalten.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteRule}>Deaktivieren</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <ExecutionLog executions={executions} statistics={statistics || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
