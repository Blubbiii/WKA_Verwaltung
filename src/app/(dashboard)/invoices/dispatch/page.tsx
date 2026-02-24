"use client";

import { useState, useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Eye,
  Filter,
  Send,
  Loader2,
  Printer,
  Mail,
  FileText,
  Receipt,
  ChevronDown,
  ChevronRight,
  LayoutList,
  LayoutGrid,
  PrinterCheck,
  MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
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
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { SearchFilter } from "@/components/ui/search-filter";
import { INVOICE_STATUS, getStatusBadge } from "@/lib/status-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Invoice {
  id: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  invoiceNumber: string;
  invoiceDate: string;
  recipientName: string | null;
  netAmount: number;
  grossAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
  printedAt: string | null;
  emailedAt: string | null;
  emailedTo: string | null;
  fund: { id: string; name: string } | null;
  park: { id: string; name: string } | null;
  shareholder: {
    id: string;
    person: {
      firstName: string | null;
      lastName: string | null;
      companyName: string | null;
    };
  } | null;
}

interface InvoicesResponse {
  data: Invoice[];
}

interface InvoiceGroup {
  key: string;
  parkName: string;
  year: number;
  invoices: Invoice[];
  totalGross: number;
  draftCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecipientName(invoice: Invoice): string {
  if (invoice.recipientName) return invoice.recipientName;
  if (invoice.shareholder?.person) {
    const p = invoice.shareholder.person;
    if (p.companyName) return p.companyName;
    return [p.firstName, p.lastName].filter(Boolean).join(" ") || "-";
  }
  return "-";
}

function groupInvoices(invoices: Invoice[]): InvoiceGroup[] {
  const map = new Map<string, InvoiceGroup>();

  for (const inv of invoices) {
    const parkName = inv.park?.name ?? inv.fund?.name ?? "Ohne Zuordnung";
    const year = new Date(inv.invoiceDate).getFullYear();
    const key = `${inv.park?.id ?? inv.fund?.id ?? "none"}_${year}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        parkName,
        year,
        invoices: [],
        totalGross: 0,
        draftCount: 0,
      });
    }

    const group = map.get(key)!;
    group.invoices.push(inv);
    group.totalGross += inv.grossAmount;
    if (inv.status === "DRAFT") group.draftCount++;
  }

  // Sort groups by park name, then by year descending
  return Array.from(map.values()).sort((a, b) => {
    const nameCompare = a.parkName.localeCompare(b.parkName, "de");
    if (nameCompare !== 0) return nameCompare;
    return b.year - a.year;
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function InvoiceDispatchPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [parkFilter, setParkFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const invalidate = useInvalidateQuery();

  // Load all invoices
  const { data: invoicesData, isLoading: loading, error, refetch } = useApiQuery<InvoicesResponse>(
    ["invoices-dispatch"],
    "/api/invoices?limit=200"
  );

  const invoices = invoicesData?.data ?? [];

  // Extract unique parks for filter dropdown
  const parkOptions = useMemo(() => {
    const parks = new Map<string, string>();
    for (const inv of invoices) {
      if (inv.park) parks.set(inv.park.id, inv.park.name);
    }
    return Array.from(parks.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
  }, [invoices]);

  // Client-side filtering
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Status filter
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      // Type filter
      if (typeFilter !== "all" && inv.invoiceType !== typeFilter) return false;
      // Park filter
      if (parkFilter !== "all" && inv.park?.id !== parkFilter) return false;
      // Search
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        const matches =
          inv.invoiceNumber.toLowerCase().includes(s) ||
          getRecipientName(inv).toLowerCase().includes(s) ||
          inv.park?.name.toLowerCase().includes(s) ||
          inv.fund?.name.toLowerCase().includes(s);
        if (!matches) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, typeFilter, parkFilter, debouncedSearch]);

  // Grouped view data
  const groups = useMemo(() => groupInvoices(filteredInvoices), [filteredInvoices]);

  // Auto-expand all groups on initial load
  useEffect(() => {
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(groups.map((g) => g.key)));
    }
  }, [groups, expandedGroups.size]);

  // Batch selection (flat list mode)
  const {
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
    selectedCount,
  } = useBatchSelection({ items: filteredInvoices });

  // Clear selection when filters change
  useEffect(() => {
    clearSelection();
  }, [statusFilter, typeFilter, parkFilter, debouncedSearch, clearSelection]);

  // Stats
  const totalCount = filteredInvoices.length;
  const draftCount = filteredInvoices.filter((i) => i.status === "DRAFT").length;
  const emailedCount = filteredInvoices.filter((i) => i.emailedAt).length;
  const printedCount = filteredInvoices.filter((i) => i.printedAt).length;

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  async function handlePrint(id: string) {
    try {
      const response = await fetch(`/api/invoices/${id}/print`, { method: "POST" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Fehler" }));
        throw new Error(err.error);
      }
      // Download PDF
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Beleg_${id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      invalidate(["invoices-dispatch"]);
      toast.success("PDF erstellt und als gedruckt markiert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Drucken");
    }
  }

  async function handleEmail(id: string) {
    try {
      const response = await fetch(`/api/invoices/${id}/email`, { method: "POST" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Fehler" }));
        throw new Error(err.error);
      }
      const result = await response.json();
      invalidate(["invoices-dispatch"]);
      toast.success(`E-Mail gesendet an ${result.emailedTo}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim E-Mail-Versand");
    }
  }

  async function handleBatchAction(action: "print" | "email" | "both") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        if (action === "print" || action === "both") {
          const res = await fetch(`/api/invoices/${id}/print`, { method: "POST" });
          if (!res.ok) throw new Error();
          // Download PDF
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `Beleg_${id}.pdf`;
          link.click();
          URL.revokeObjectURL(url);
        }
        if (action === "email" || action === "both") {
          const res = await fetch(`/api/invoices/${id}/email`, { method: "POST" });
          if (!res.ok) throw new Error();
        }
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearSelection();
    invalidate(["invoices-dispatch"]);

    const actionLabel = action === "print" ? "gedruckt" : action === "email" ? "gemailt" : "gedruckt + gemailt";
    if (failCount === 0) {
      toast.success(`${successCount} Beleg(e) ${actionLabel}`);
    } else {
      toast.warning(`${successCount} erfolgreich, ${failCount} fehlgeschlagen`);
    }
  }

  // Get invoices to process: selected ones in this group, or all if none selected
  function getGroupTargets(group: InvoiceGroup): Invoice[] {
    const selectedInGroup = group.invoices.filter((inv) => selectedIds.has(inv.id));
    return selectedInGroup.length > 0 ? selectedInGroup : group.invoices;
  }

  async function handleGroupAction(group: InvoiceGroup, action: "print" | "email") {
    const targets = getGroupTargets(group);
    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const inv of targets) {
      try {
        if (action === "print") {
          const res = await fetch(`/api/invoices/${inv.id}/print`, { method: "POST" });
          if (!res.ok) throw new Error();
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `Beleg_${inv.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
          link.click();
          URL.revokeObjectURL(url);
        } else {
          const res = await fetch(`/api/invoices/${inv.id}/email`, { method: "POST" });
          if (!res.ok) throw new Error();
        }
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    invalidate(["invoices-dispatch"]);

    const actionLabel = action === "print" ? "gedruckt" : "gemailt";
    if (failCount === 0) {
      toast.success(`${successCount} Beleg(e) ${actionLabel}`);
    } else {
      toast.warning(`${successCount} erfolgreich, ${failCount} fehlgeschlagen`);
    }
  }

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Check if all invoices of a group are selected
  function isGroupSelected(group: InvoiceGroup): "all" | "some" | "none" {
    const selectedInGroup = group.invoices.filter((inv) => selectedIds.has(inv.id)).length;
    if (selectedInGroup === 0) return "none";
    if (selectedInGroup === group.invoices.length) return "all";
    return "some";
  }

  // Toggle all invoices in a group
  function toggleGroupSelection(group: InvoiceGroup) {
    const state = isGroupSelected(group);
    if (state === "all") {
      // Deselect all in group
      for (const inv of group.invoices) {
        if (selectedIds.has(inv.id)) toggleItem(inv.id);
      }
    } else {
      // Select all in group
      for (const inv of group.invoices) {
        if (!selectedIds.has(inv.id)) toggleItem(inv.id);
      }
    }
  }

  function renderInvoiceRow(invoice: Invoice, showParkColumn: boolean) {
    return (
      <TableRow key={invoice.id} className={`hover:bg-muted/50 ${selectedIds.has(invoice.id) ? "bg-primary/5" : ""}`}>
        <TableCell>
          <Checkbox
            checked={selectedIds.has(invoice.id)}
            onCheckedChange={() => toggleItem(invoice.id)}
            aria-label={`${invoice.invoiceNumber} auswaehlen`}
          />
        </TableCell>
        <TableCell className="font-mono font-medium text-sm">
          {invoice.invoiceNumber}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {invoice.invoiceType === "INVOICE" ? "Rechnung" : "Gutschrift"}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">{getRecipientName(invoice)}</TableCell>
        {showParkColumn && (
          <TableCell className="text-sm text-muted-foreground">
            {invoice.park?.name || invoice.fund?.name || "-"}
          </TableCell>
        )}
        <TableCell className="text-right font-medium text-sm">
          {formatCurrency(invoice.grossAmount)}
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className={getStatusBadge(INVOICE_STATUS, invoice.status).className}>
            {getStatusBadge(INVOICE_STATUS, invoice.status).label}
          </Badge>
        </TableCell>
        <TableCell
          className="text-center"
          title={invoice.printedAt ? `Gedruckt am ${format(new Date(invoice.printedAt), "dd.MM.yyyy HH:mm", { locale: de })}` : "Nicht gedruckt"}
        >
          <Printer className={`h-4 w-4 mx-auto ${invoice.printedAt ? "text-green-600" : "text-muted-foreground/30"}`} />
        </TableCell>
        <TableCell
          className="text-center"
          title={
            invoice.emailedAt
              ? `Gemailt am ${format(new Date(invoice.emailedAt), "dd.MM.yyyy HH:mm", { locale: de })}${invoice.emailedTo ? ` an ${invoice.emailedTo}` : ""}`
              : "Nicht gemailt"
          }
        >
          <Mail className={`h-4 w-4 mx-auto ${invoice.emailedAt ? "text-green-600" : "text-muted-foreground/30"}`} />
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="PDF anzeigen"
              onClick={() => window.open(`/api/invoices/${invoice.id}/pdf?inline=true`, "_blank")}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Drucken"
              disabled={isBatchProcessing}
              onClick={() => handlePrint(invoice.id)}
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Per E-Mail versenden"
              disabled={isBatchProcessing}
              onClick={() => handleEmail(invoice.id)}
            >
              <Mail className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Belege</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Versandübersicht"
        description="Belege prüfen und versenden (Drucken, E-Mail oder beides)"
      />

      {/* Stats */}
      <StatsCards
        stats={[
          { label: "Gesamt", value: totalCount, icon: Receipt, subtitle: "Belege" },
          { label: "Unversendet", value: draftCount, icon: FileText, subtitle: "Entwuerfe" },
          { label: "Per E-Mail", value: emailedCount, icon: MailCheck, subtitle: "Versendet" },
          { label: "Gedruckt", value: printedCount, icon: PrinterCheck, subtitle: "Gedruckt" },
        ]}
      />

      {/* Filters + View Toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Belege</CardTitle>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <Button
                variant={viewMode === "grouped" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("grouped")}
                title="Gruppierte Ansicht"
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                Gruppiert
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("list")}
                title="Listenansicht"
              >
                <LayoutList className="h-4 w-4 mr-1" />
                Liste
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Suchen nach Nummer, Empfänger, Park..."
            filters={[
              {
                value: typeFilter,
                onChange: setTypeFilter,
                placeholder: "Typ",
                width: "w-[150px]",
                options: [
                  { value: "all", label: "Alle Typen" },
                  { value: "INVOICE", label: "Rechnungen" },
                  { value: "CREDIT_NOTE", label: "Gutschriften" },
                ],
              },
              {
                value: statusFilter,
                onChange: setStatusFilter,
                placeholder: "Status",
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[150px]",
                options: [
                  { value: "all", label: "Alle Status" },
                  { value: "DRAFT", label: "Entwurf" },
                  { value: "SENT", label: "Versendet" },
                  { value: "PAID", label: "Bezahlt" },
                  { value: "CANCELLED", label: "Storniert" },
                ],
              },
              ...(parkOptions.length > 0
                ? [
                    {
                      value: parkFilter,
                      onChange: setParkFilter,
                      placeholder: "Park",
                      width: "w-[180px]",
                      options: [
                        { value: "all", label: "Alle Parks" },
                        ...parkOptions,
                      ],
                    },
                  ]
                : []),
            ]}
          />

          {/* Loading */}
          {loading && (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filteredInvoices.length === 0 && (
            <div className="mt-8 text-center text-muted-foreground py-12">
              <Send className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="text-lg font-medium">Keine Belege gefunden</p>
              <p className="text-sm mt-1">Passen Sie die Filter an oder erstellen Sie neue Belege</p>
            </div>
          )}

          {/* Grouped View */}
          {!loading && filteredInvoices.length > 0 && viewMode === "grouped" && (
            <div className="mt-4 space-y-3">
              {groups.map((group) => (
                <div key={group.key} className="rounded-lg border">
                    <div
                      className="flex w-full items-center justify-between p-4 hover:bg-muted/50 transition-colors rounded-t-lg cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleGroup(group.key)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleGroup(group.key); } }}
                    >
                        <div className="flex items-center gap-3">
                          {expandedGroups.has(group.key) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="text-left">
                            <span className="font-medium">{group.parkName}</span>
                            <span className="text-muted-foreground ml-2">- {group.year}</span>
                          </div>
                          <Badge variant="outline" className="ml-2">
                            {group.invoices.length} {group.invoices.length === 1 ? "Beleg" : "Belege"}
                          </Badge>
                          {group.draftCount > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              {group.draftCount} unversendet
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-medium text-sm">
                            {formatCurrency(group.totalGross)}
                          </span>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const hasSelection = isGroupSelected(group) !== "none";
                              const label = hasSelection ? "Auswahl" : "Alle";
                              return (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={isBatchProcessing}
                                    onClick={() => handleGroupAction(group, "print")}
                                  >
                                    <Printer className="h-3 w-3 mr-1" />
                                    {label} drucken
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={isBatchProcessing}
                                    onClick={() => handleGroupAction(group, "email")}
                                  >
                                    <Mail className="h-3 w-3 mr-1" />
                                    {label} mailen
                                  </Button>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                    </div>
                    {expandedGroups.has(group.key) && (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40px]">
                                <Checkbox
                                  checked={isGroupSelected(group) === "all"}
                                  ref={(el) => {
                                    if (el) {
                                      (el as unknown as HTMLInputElement).indeterminate = isGroupSelected(group) === "some";
                                    }
                                  }}
                                  onCheckedChange={() => toggleGroupSelection(group)}
                                  aria-label={`Alle in ${group.parkName} auswaehlen`}
                                />
                              </TableHead>
                              <TableHead>Nummer</TableHead>
                              <TableHead>Typ</TableHead>
                              <TableHead>Empfänger</TableHead>
                              <TableHead className="text-right">Betrag</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-10 text-center" title="Gedruckt">
                                <Printer className="h-4 w-4 mx-auto text-muted-foreground" />
                              </TableHead>
                              <TableHead className="w-10 text-center" title="E-Mail">
                                <Mail className="h-4 w-4 mx-auto text-muted-foreground" />
                              </TableHead>
                              <TableHead className="w-[120px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.invoices.map((inv) => renderInvoiceRow(inv, false))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

          {/* Flat List View */}
          {!loading && filteredInvoices.length > 0 && viewMode === "list" && (
            <div className="mt-4 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) {
                            (el as unknown as HTMLInputElement).indeterminate = isSomeSelected;
                          }
                        }}
                        onCheckedChange={toggleAll}
                        aria-label="Alle auswaehlen"
                      />
                    </TableHead>
                    <TableHead>Nummer</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10 text-center" title="Gedruckt">
                      <Printer className="h-4 w-4 mx-auto text-muted-foreground" />
                    </TableHead>
                    <TableHead className="w-10 text-center" title="E-Mail">
                      <Mail className="h-4 w-4 mx-auto text-muted-foreground" />
                    </TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => renderInvoiceRow(inv, true))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Action Bar */}
      <BatchActionBar
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
          actions={[
            {
              label: "Drucken",
              icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />,
              onClick: () => handleBatchAction("print"),
              disabled: isBatchProcessing,
            },
            {
              label: "Per E-Mail",
              icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />,
              onClick: () => handleBatchAction("email"),
              disabled: isBatchProcessing,
            },
            {
              label: "Drucken + Mailen",
              icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />,
              onClick: () => handleBatchAction("both"),
              disabled: isBatchProcessing,
            },
          ]}
        />
    </div>
  );
}
