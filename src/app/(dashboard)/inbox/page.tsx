"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Inbox,
  Upload,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  Eye,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================================
// Types
// ============================================================================

interface IncomingInvoice {
  id: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  status: string;
  ocrStatus: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  grossAmount: string | null;
  vendor: { id: string; name: string } | null;
  vendorNameFallback: string | null;
  fileName: string;
  createdAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  INBOX: { label: "Posteingang", variant: "secondary" },
  OCR_PROCESSING: { label: "OCR läuft", variant: "secondary" },
  REVIEW: { label: "In Prüfung", variant: "outline" },
  APPROVED: { label: "Genehmigt", variant: "default" },
  PAID: { label: "Bezahlt", variant: "default" },
  CANCELLED: { label: "Storniert", variant: "destructive" },
};

const TYPE_LABEL: Record<string, string> = {
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
};

// ============================================================================
// Upload Dialog
// ============================================================================

function UploadDialog({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/inbox", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler beim Hochladen");
      }
      toast.success(`"${file.name}" hochgeladen — OCR gestartet`);
      setFile(null);
      onUploaded();
      onClose();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rechnung / Gutschrift hochladen</DialogTitle>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            PDF oder Bild hierher ziehen oder klicken zum Auswählen
          </p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPEG, PNG, TIFF — max. 50 MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {file && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="truncate">{file.name}</span>
            <span className="text-muted-foreground shrink-0">
              ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Abbrechen
          </Button>
          <Button onClick={upload} disabled={!file || uploading}>
            {uploading ? "Lädt hoch..." : "Hochladen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function InboxPage() {
  const router = useRouter();
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [invoices, setInvoices] = useState<IncomingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/inbox?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.data ?? []);
      }
    } catch {
      toast.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (!flagsLoading && flags.inbox) load();
  }, [flags.inbox, flagsLoading, load]);

  if (flagsLoading) return null;

  if (!flags.inbox) {
    return (
      <div className="p-8 text-center">
        <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Inbox nicht aktiviert</h2>
        <p className="text-muted-foreground">Das Eingangsrechnungs-Modul ist für diesen Mandanten nicht aktiviert.</p>
      </div>
    );
  }

  // Stats
  const open = invoices.filter((i) => ["INBOX", "REVIEW"].includes(i.status)).length;
  const approved = invoices.filter((i) => i.status === "APPROVED").length;
  const paid = invoices.filter((i) => i.status === "PAID").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eingangsrechnungen"
        description="Rechnungen und Gutschriften verwalten"
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Hochladen
          </Button>
        }
      />

      {/* KPI chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span className="font-medium">{open}</span>
          <span className="text-muted-foreground">Offen</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
          <Eye className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{approved}</span>
          <span className="text-muted-foreground">Genehmigt</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="font-medium">{paid}</span>
          <span className="text-muted-foreground">Bezahlt</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="INBOX">Posteingang</SelectItem>
            <SelectItem value="REVIEW">In Prüfung</SelectItem>
            <SelectItem value="APPROVED">Genehmigt</SelectItem>
            <SelectItem value="PAID">Bezahlt</SelectItem>
            <SelectItem value="CANCELLED">Storniert</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="INVOICE">Rechnung</SelectItem>
            <SelectItem value="CREDIT_NOTE">Gutschrift</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Keine Eingangsrechnungen gefunden</p>
              <Button variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Erste Rechnung hochladen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Re-Nr.</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Fällig</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const badgeInfo = STATUS_BADGE[inv.status] ?? { label: inv.status, variant: "secondary" as const };
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/inbox/${inv.id}`)}
                    >
                      <TableCell className="font-medium">
                        {inv.vendor?.name ?? inv.vendorNameFallback ?? (
                          <span className="text-muted-foreground italic">Kein Lieferant</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABEL[inv.invoiceType] ?? inv.invoiceType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.invoiceNumber ?? "—"}
                      </TableCell>
                      <TableCell>
                        {inv.invoiceDate
                          ? format(new Date(inv.invoiceDate), "dd.MM.yyyy", { locale: de })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {inv.dueDate
                          ? format(new Date(inv.dueDate), "dd.MM.yyyy", { locale: de })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {inv.grossAmount
                          ? parseFloat(inv.grossAmount).toLocaleString("de-DE", {
                              style: "currency",
                              currency: "EUR",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={load}
      />
    </div>
  );
}
