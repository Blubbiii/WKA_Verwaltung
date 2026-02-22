"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Search,
  Receipt,
  FileText,
  FileCode2,
  FileSpreadsheet,
  MoreHorizontal,
  Eye,
  Pencil,
  Filter,
  Download,
  Send,
  CheckCircle,
  Trash2,
  Loader2,
  Printer,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import {
  Card,
  CardContent,
  CardDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { DatevExportDialog } from "@/components/invoices/datev-export-dialog";
import { getSkontoStatus, getSkontoStatusLabel, getSkontoStatusBadgeClass } from "@/lib/invoices/skonto";
import { RecurringInvoicesManager } from "@/components/invoices/recurring-invoices-manager";

interface Invoice {
  id: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  recipientName: string | null;
  netAmount: number;
  taxAmount: number | null;
  grossAmount: number;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
  // Skonto fields
  skontoPercent: number | null;
  skontoDays: number | null;
  skontoDeadline: string | null;
  skontoAmount: number | null;
  skontoPaid: boolean;
  // Delivery tracking
  printedAt: string | null;
  emailedAt: string | null;
  emailedTo: string | null;
  fund: { id: string; name: string } | null;
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

export default function InvoicesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDatevExport, setShowDatevExport] = useState(false);

  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const invalidate = useInvalidateQuery();

  // Build query URL
  const queryParams = new URLSearchParams({
    limit: "100",
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(typeFilter !== "all" && { invoiceType: typeFilter }),
  });

  const { data: invoicesData, isLoading: loading, error, refetch } = useApiQuery<InvoicesResponse>(
    ["invoices", statusFilter, typeFilter],
    `/api/invoices?${queryParams}`
  );

  const invoices = invoicesData?.data ?? [];

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/invoices/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Fehler beim Loeschen" }));
        throw new Error(error.error || "Fehler beim Loeschen");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["invoices"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Loeschen der Rechnung");
      },
    }
  );

  function getRecipientName(invoice: Invoice): string {
    if (invoice.recipientName) return invoice.recipientName;
    if (invoice.shareholder?.person) {
      const p = invoice.shareholder.person;
      if (p.companyName) return p.companyName;
      return [p.firstName, p.lastName].filter(Boolean).join(" ") || "-";
    }
    return "-";
  }

  // Filter by search (client-side)
  const filteredInvoices = invoices.filter((invoice) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    return (
      invoice.invoiceNumber.toLowerCase().includes(searchLower) ||
      getRecipientName(invoice).toLowerCase().includes(searchLower) ||
      invoice.fund?.name.toLowerCase().includes(searchLower)
    );
  });

  // Batch selection
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
  }, [statusFilter, typeFilter, debouncedSearch, clearSelection]);

  // Batch: delete selected (only DRAFT invoices)
  async function handleBatchDelete() {
    const draftIds = filteredInvoices
      .filter((inv) => selectedIds.has(inv.id) && inv.status === "DRAFT")
      .map((inv) => inv.id);

    if (draftIds.length === 0) {
      toast.error("Nur Entwuerfe koennen geloescht werden.");
      return;
    }

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of draftIds) {
      try {
        const response = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearSelection();
    invalidate(["invoices"]);

    if (failCount === 0) {
      toast.success(`${successCount} Beleg(e) erfolgreich geloescht`);
    } else {
      toast.warning(`${successCount} geloescht, ${failCount} fehlgeschlagen`);
    }
  }

  // Batch: mark selected as paid
  async function handleBatchMarkPaid() {
    const sentIds = filteredInvoices
      .filter((inv) => selectedIds.has(inv.id) && inv.status === "SENT")
      .map((inv) => inv.id);

    if (sentIds.length === 0) {
      toast.error("Nur versendete Belege koennen als bezahlt markiert werden.");
      return;
    }

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of sentIds) {
      try {
        const response = await fetch(`/api/invoices/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PAID" }),
        });
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearSelection();
    invalidate(["invoices"]);

    if (failCount === 0) {
      toast.success(`${successCount} Beleg(e) als bezahlt markiert`);
    } else {
      toast.warning(`${successCount} aktualisiert, ${failCount} fehlgeschlagen`);
    }
  }

  // Batch: export selected as CSV
  function handleBatchExport() {
    const selected = filteredInvoices.filter((inv) => selectedIds.has(inv.id));
    if (selected.length === 0) return;

    const header = ["Nummer", "Typ", "Empfaenger", "Datum", "Netto", "Brutto", "Status"];
    const rows = selected.map((inv) => [
      inv.invoiceNumber,
      inv.invoiceType === "INVOICE" ? "Rechnung" : "Gutschrift",
      getRecipientName(inv),
      format(new Date(inv.invoiceDate), "dd.MM.yyyy", { locale: de }),
      inv.netAmount.toFixed(2).replace(".", ","),
      inv.grossAmount.toFixed(2).replace(".", ","),
      inv.status,
    ]);

    const csvContent =
      "\uFEFF" +
      [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `abrechnungen-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`${selected.length} Beleg(e) exportiert`);
  }

  // Stats
  const invoicesOnly = invoices.filter((i) => i.invoiceType === "INVOICE");
  const creditNotesOnly = invoices.filter((i) => i.invoiceType === "CREDIT_NOTE");
  const openInvoices = invoicesOnly.filter((i) => i.status === "SENT");
  const totalOpen = openInvoices.reduce((sum, i) => sum + i.grossAmount, 0);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Abrechnungen</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Abrechnungen"
        description="Verwalten Sie Rechnungen und Gutschriften"
        createHref="/invoices/new?type=INVOICE"
        createLabel="Rechnung"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowDatevExport(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              DATEV-Export
            </Button>
            <Button variant="outline" asChild>
              <Link href="/invoices/new?type=CREDIT_NOTE">
                <Plus className="mr-2 h-4 w-4" />
                Gutschrift
              </Link>
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <StatsCards
        stats={[
          { label: "Rechnungen", value: invoicesOnly.length, icon: Receipt, subtitle: `${invoicesOnly.filter((i) => i.status === "PAID").length} bezahlt` },
          { label: "Gutschriften", value: creditNotesOnly.length, icon: FileText, subtitle: "Erstellt" },
          { label: "Offen", value: openInvoices.length, icon: Send, subtitle: "Versendet, unbezahlt" },
          { label: "Offener Betrag", value: formatCurrency(totalOpen), icon: Receipt, subtitle: "Ausstehend" },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Belege</CardTitle>
          <CardDescription>Alle Rechnungen und Gutschriften</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Suchen nach Nummer, Empfänger..."
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
            ]}
          />

          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) {
                          // Set indeterminate state for "some selected"
                          (el as unknown as HTMLInputElement).indeterminate = isSomeSelected;
                        }
                      }}
                      onCheckedChange={toggleAll}
                      aria-label="Alle auswaehlen"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableHead>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10 text-center" title="Gedruckt"><Printer className="h-4 w-4 mx-auto text-muted-foreground" /></TableHead>
                  <TableHead className="w-10 text-center" title="E-Mail"><Mail className="h-4 w-4 mx-auto text-muted-foreground" /></TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                      Keine Belege gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(invoice.id) ? "bg-primary/5" : ""}`}
                      onClick={() => router.push(`/invoices/${invoice.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/invoices/${invoice.id}`); } }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(invoice.id)}
                          onCheckedChange={() => toggleItem(invoice.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`${invoice.invoiceNumber} auswaehlen`}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {invoice.invoiceType === "INVOICE" ? "Rechnung" : "Gutschrift"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getRecipientName(invoice)}</TableCell>
                      <TableCell>
                        {format(new Date(invoice.invoiceDate), "dd.MM.yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(invoice.netAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(invoice.grossAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className={getStatusBadge(INVOICE_STATUS, invoice.status).className}>
                            {getStatusBadge(INVOICE_STATUS, invoice.status).label}
                          </Badge>
                          {getSkontoStatus(invoice) !== "NONE" && (
                            <Badge variant="outline" className={`text-xs ${getSkontoStatusBadgeClass(getSkontoStatus(invoice))}`}>
                              {getSkontoStatusLabel(getSkontoStatus(invoice))}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center" title={invoice.printedAt ? `Gedruckt am ${format(new Date(invoice.printedAt), "dd.MM.yyyy HH:mm", { locale: de })}` : undefined}>
                        <Printer className={`h-4 w-4 mx-auto ${invoice.printedAt ? "text-green-600" : "text-muted-foreground/30"}`} />
                      </TableCell>
                      <TableCell className="text-center" title={invoice.emailedAt ? `Gemailt am ${format(new Date(invoice.emailedAt), "dd.MM.yyyy HH:mm", { locale: de })}${invoice.emailedTo ? ` an ${invoice.emailedTo}` : ""}` : undefined}>
                        <Mail className={`h-4 w-4 mx-auto ${invoice.emailedAt ? "text-green-600" : "text-muted-foreground/30"}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Details anzeigen"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/invoices/${invoice.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {invoice.status === "DRAFT" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Bearbeiten"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/invoices/${invoice.id}/edit`);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/api/invoices/${invoice.id}/pdf`, "_blank");
                              }}>
                                <Download className="mr-2 h-4 w-4" />
                                PDF herunterladen
                              </DropdownMenuItem>
                              {invoice.status !== "CANCELLED" && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/api/invoices/${invoice.id}/xrechnung?format=xrechnung`, "_blank");
                                }}>
                                  <FileCode2 className="mr-2 h-4 w-4" />
                                  XRechnung herunterladen
                                </DropdownMenuItem>
                              )}
                              {invoice.status === "SENT" && (
                                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Als bezahlt markieren
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteId(invoice.id);
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Loeschen
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recurring Invoices Section */}
      <RecurringInvoicesManager />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={async () => {
          if (deleteId) {
            await deleteMutation.mutateAsync(deleteId);
            setDeleteId(null);
          }
        }}
        title="Rechnung loeschen"
      />

      {/* DATEV Export Dialog */}
      <DatevExportDialog
        open={showDatevExport}
        onOpenChange={setShowDatevExport}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          {
            label: "Exportieren",
            icon: <Download className="h-4 w-4" />,
            onClick: handleBatchExport,
            disabled: isBatchProcessing,
          },
          {
            label: "Als bezahlt markieren",
            icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />,
            onClick: handleBatchMarkPaid,
            disabled: isBatchProcessing,
          },
          {
            label: "Loeschen",
            icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />,
            onClick: handleBatchDelete,
            variant: "destructive",
            disabled: isBatchProcessing,
          },
        ]}
      />
    </div>
  );
}
