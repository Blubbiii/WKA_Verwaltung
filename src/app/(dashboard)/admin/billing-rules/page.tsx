"use client";

/**
 * Billing Rules Overview Page
 * /admin/billing-rules
 */

import { useState, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Play,
  Eye,
  Pencil,
  Trash2,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Receipt,
  Euro,
  RefreshCw,
} from "lucide-react";

// Types
interface BillingRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  frequency: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  executionCount: number;
  lastExecution: {
    id: string;
    status: string;
    startedAt: string;
    invoicesCreated: number;
    totalAmount: number | null;
    errorMessage: string | null;
  } | null;
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

const STATUS_CONFIG = {
  success: {
    label: "Erfolgreich",
    icon: CheckCircle,
    className: "bg-green-100 text-green-800",
  },
  failed: {
    label: "Fehlgeschlagen",
    icon: XCircle,
    className: "bg-red-100 text-red-800",
  },
  partial: {
    label: "Teilweise",
    icon: AlertTriangle,
    className: "bg-yellow-100 text-yellow-800",
  },
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

export default function BillingRulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [ruleToDeactivate, setRuleToDeactivate] = useState<string | null>(null);

  // Fetch Rules
  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (ruleTypeFilter !== "all") {
        params.append("ruleType", ruleTypeFilter);
      }
      if (frequencyFilter !== "all") {
        params.append("frequency", frequencyFilter);
      }
      if (statusFilter !== "all") {
        params.append("isActive", statusFilter);
      }

      const response = await fetch(`/api/admin/billing-rules?${params}`);
      if (!response.ok) throw new Error("Fehler beim Laden");

      const data = await response.json();
      setRules(data.data);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }));
    } catch (error) {
      toast.error("Fehler beim Laden der Abrechnungsregeln");
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, ruleTypeFilter, frequencyFilter, statusFilter]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Execute Rule
  const executeRule = async (ruleId: string, dryRun: boolean = false) => {
    try {
      const response = await fetch(
        `/api/admin/billing-rules/${ruleId}/execute?dryRun=${dryRun}`,
        { method: "POST" }
      );

      const result = await response.json();

      if (result.success) {
        toast.success(
          dryRun
            ? `Vorschau: ${result.summary.totalProcessed} Rechnungen wuerden erstellt`
            : `${result.summary.invoicesCreated} Rechnungen erstellt`
        );
        if (!dryRun) {
          fetchRules();
        }
      } else {
        toast.error(result.errorMessage || "Ausführung fehlgeschlagen");
      }
    } catch (error) {
      toast.error("Fehler bei der Ausführung");
    }
  };

  // Delete Rule (soft delete)
  const deleteRule = async (ruleId: string) => {
    setRuleToDeactivate(ruleId);
    setDeactivateDialogOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!ruleToDeactivate) return;

    try {
      const response = await fetch(`/api/admin/billing-rules/${ruleToDeactivate}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Regel deaktiviert");
        fetchRules();
      } else {
        throw new Error();
      }
    } catch (error) {
      toast.error("Fehler beim Deaktivieren");
    } finally {
      setDeactivateDialogOpen(false);
      setRuleToDeactivate(null);
    }
  };

  // Filter rules by search term
  const filteredRules = rules.filter((rule) =>
    searchTerm
      ? rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rule.description?.toLowerCase().includes(searchTerm.toLowerCase())
      : true
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Abrechnungsregeln</h1>
          <p className="text-muted-foreground">
            Automatische Rechnungserstellung verwalten
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/billing-rules/new">
            <Plus className="h-4 w-4 mr-2" />
            Neue Regel
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <Select value={ruleTypeFilter} onValueChange={setRuleTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Regeltyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Frequenz" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Frequenzen</SelectItem>
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="true">Aktiv</SelectItem>
                <SelectItem value="false">Inaktiv</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={fetchRules} aria-label="Aktualisieren">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Keine Abrechnungsregeln gefunden</p>
              <p className="text-sm">
                Erstellen Sie eine neue Regel, um automatische Rechnungen zu generieren.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/admin/billing-rules/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Erste Regel erstellen
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Frequenz</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Letzte Ausführung</TableHead>
                  <TableHead>Nächste Ausführung</TableHead>
                  <TableHead className="w-[100px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule) => {
                  const lastExecStatus = rule.lastExecution?.status as keyof typeof STATUS_CONFIG;
                  const statusConfig = lastExecStatus ? STATUS_CONFIG[lastExecStatus] : null;
                  const StatusIcon = statusConfig?.icon;

                  return (
                    <TableRow
                      key={rule.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/admin/billing-rules/${rule.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/admin/billing-rules/${rule.id}`); } }}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          {rule.description && (
                            <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                              {rule.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {FREQUENCY_LABELS[rule.frequency] || rule.frequency}
                        </div>
                      </TableCell>
                      <TableCell>
                        {rule.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Aktiv</Badge>
                        ) : (
                          <Badge variant="secondary">Inaktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {rule.lastExecution ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              {StatusIcon && (
                                <StatusIcon
                                  className={`h-3 w-3 ${
                                    lastExecStatus === "success"
                                      ? "text-green-600"
                                      : lastExecStatus === "failed"
                                      ? "text-red-600"
                                      : "text-yellow-600"
                                  }`}
                                />
                              )}
                              <span className="text-sm">
                                {formatDate(rule.lastExecution.startedAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{rule.lastExecution.invoicesCreated} Rechnungen</span>
                              <span>{formatCurrency(rule.lastExecution.totalAmount)}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Noch nie</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {rule.nextRunAt ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {formatDate(rule.nextRunAt)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Aktionen">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/admin/billing-rules/${rule.id}`)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => executeRule(rule.id, true)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Vorschau (Dry-Run)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => executeRule(rule.id, false)}>
                              <Play className="h-4 w-4 mr-2" />
                              Jetzt ausfuehren
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/admin/billing-rules/${rule.id}/edit`)
                              }
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Bearbeiten
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteRule(rule.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Deaktivieren
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            disabled={pagination.page === 1}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
          >
            Zurück
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Seite {pagination.page} von {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
          >
            Weiter
          </Button>
        </div>
      )}

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regel deaktivieren</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diese Abrechnungsregel wirklich deaktivieren? Die Regel wird nicht mehr automatisch ausgeführt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDeactivate();
              }}
            >
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
