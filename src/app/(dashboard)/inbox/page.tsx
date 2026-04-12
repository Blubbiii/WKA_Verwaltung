"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Inbox,
  Upload,
  RefreshCw,
  CheckCircle2,
  Eye,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  INBOX: "secondary",
  OCR_PROCESSING: "secondary",
  REVIEW: "outline",
  APPROVED: "default",
  PAID: "default",
  CANCELLED: "destructive",
};

// ============================================================================
// Upload Dialog
// ============================================================================

function UploadDialog({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: () => void }) {
  const t = useTranslations("inbox.uploadDialog");
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
        throw new Error(err.error ?? t("uploadFailed"));
      }
      toast.success(t("success", { name: file.name }));
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
          <DialogTitle>{t("title")}</DialogTitle>
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
            {t("dropText")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t("formats")}</p>
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
            {t("cancel")}
          </Button>
          <Button onClick={upload} disabled={!file || uploading}>
            {uploading ? t("uploading") : t("upload")}
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
  const t = useTranslations("inbox");
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
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, t]);

  useEffect(() => {
    if (!flagsLoading && flags.inbox) load();
  }, [flags.inbox, flagsLoading, load]);

  if (flagsLoading) return null;

  if (!flags.inbox) {
    return (
      <div className="p-8 text-center">
        <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">{t("notEnabled")}</h2>
        <p className="text-muted-foreground">{t("notEnabledDesc")}</p>
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
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t("upload")}
          </Button>
        }
      />

      {/* KPI chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span className="font-medium">{open}</span>
          <span className="text-muted-foreground">{t("kpi.open")}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
          <Eye className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{approved}</span>
          <span className="text-muted-foreground">{t("kpi.approved")}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="font-medium">{paid}</span>
          <span className="text-muted-foreground">{t("kpi.paid")}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("filter.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatus")}</SelectItem>
            <SelectItem value="INBOX">{t("status.INBOX")}</SelectItem>
            <SelectItem value="REVIEW">{t("status.REVIEW")}</SelectItem>
            <SelectItem value="APPROVED">{t("status.APPROVED")}</SelectItem>
            <SelectItem value="PAID">{t("status.PAID")}</SelectItem>
            <SelectItem value="CANCELLED">{t("status.CANCELLED")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("filter.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allTypes")}</SelectItem>
            <SelectItem value="INVOICE">{t("type.INVOICE")}</SelectItem>
            <SelectItem value="CREDIT_NOTE">{t("type.CREDIT_NOTE")}</SelectItem>
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
              <p className="text-muted-foreground">{t("empty")}</p>
              <Button variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                {t("uploadFirst")}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.vendor")}</TableHead>
                  <TableHead>{t("table.type")}</TableHead>
                  <TableHead>{t("table.invoiceNumber")}</TableHead>
                  <TableHead>{t("table.date")}</TableHead>
                  <TableHead>{t("table.due")}</TableHead>
                  <TableHead className="text-right">{t("table.gross")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const variant = STATUS_VARIANT[inv.status] ?? "secondary";
                  const statusLabel = (() => {
                    try { return t(`status.${inv.status}` as "status.INBOX"); }
                    catch { return inv.status; }
                  })();
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/inbox/${inv.id}`)}
                    >
                      <TableCell className="font-medium">
                        {inv.vendor?.name ?? inv.vendorNameFallback ?? (
                          <span className="text-muted-foreground italic">{t("table.noVendor")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inv.invoiceType === "INVOICE" ? t("type.INVOICE") : inv.invoiceType === "CREDIT_NOTE" ? t("type.CREDIT_NOTE") : inv.invoiceType}
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
                        <Badge variant={variant}>{statusLabel}</Badge>
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
