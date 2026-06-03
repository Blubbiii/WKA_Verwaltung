"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
// R3 Perf: Direkt-Pfad-Import für besseres Tree-Shaking (date-fns).
import { format } from "date-fns/format";
import { de } from "date-fns/locale/de";
import {
  Inbox,
  Upload,
  RefreshCw,
  CheckCircle2,
  Eye,
  AlertCircle,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { usePersistedTableState } from "@/hooks/usePersistedTableState";
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
import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";

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
  // P13: 4-Augen-Tracking
  createdById?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdBy?: { id: string; firstName: string | null; lastName: string | null } | null;
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

  // QW-1: Manuelle DropZone durch zentrale FileUploadDropzone-Komponente
  // ersetzt — gleiche UX, weniger Code, konsistent mit anderen Upload-Stellen.
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <FileUploadDropzone
          endpoint="/api/inbox"
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif"
          maxFiles={5}
          className="p-8"
          hint={t("formats")}
          onUploadComplete={() => {
            onUploaded();
            onClose();
          }}
        />

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
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
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [invoices, setInvoices] = useState<IncomingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  // F-6: Persistent Filter-State (URL + LocalStorage)
  const [tableState, setTableState] = usePersistedTableState("inbox", {
    status: "all",
    type: "all",
  });
  const statusFilter = tableState.status;
  const typeFilter = tableState.type;
  const setStatusFilter = (s: string) => setTableState({ status: s });
  const setTypeFilter = (s: string) => setTableState({ type: s });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // H-9: AbortController ref damit der vorherige Fetch beim schnellen
  // Filter-Wechsel abgebrochen wird (Race-Condition-Schutz).
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/inbox?${params}`, { signal: ac.signal });
      if (res.ok) {
        const data = await res.json();
        if (!ac.signal.aborted) setInvoices(data.data ?? []);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("loadError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [statusFilter, typeFilter, t]);

  useEffect(() => {
    if (!flagsLoading && flags.inbox) load();
    return () => abortRef.current?.abort();
  }, [flags.inbox, flagsLoading, load]);

  const handleApprove = useCallback(
    async (invoiceId: string) => {
      setApprovingId(invoiceId);
      try {
        const res = await fetch(`/api/inbox/${invoiceId}/approve`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));

        // Sprint 3: 202 PENDING_APPROVAL = ApprovalRequest wurde erzeugt
        if (res.status === 202 && data?.status === "PENDING_APPROVAL") {
          toast.info(
            data.message ??
              "Vier-Augen-Prinzip: Anfrage angelegt. /approvals zur Freigabe.",
          );
          await load();
          return;
        }

        if (!res.ok) {
          if (res.status === 422 && data?.code === "VAT_DEDUCTION_FAILED") {
            const missing = Array.isArray(data?.details?.missing)
              ? data.details.missing.join(", ")
              : "";
            toast.error(`§14 UStG fehlende Pflichtangaben: ${missing}`);
          } else if (res.status === 409) {
            toast.error(data.message ?? "Status erlaubt keine Freigabe");
          } else {
            toast.error(data.message ?? "Freigabe fehlgeschlagen");
          }
          return;
        }
        toast.success("Rechnung freigegeben");
        await load();
      } catch {
        toast.error("Netzwerkfehler bei Freigabe");
      } finally {
        setApprovingId(null);
      }
    },
    [load],
  );

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

        <Button
          variant="outline"
          size="icon"
          onClick={load}
          disabled={loading}
          aria-label="Aktualisieren"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
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
                  <TableHead className="text-right">Aktion</TableHead>
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
                      tabIndex={0}
                      role="link"
                      aria-label={inv.vendor?.name ?? inv.vendorNameFallback ?? t("table.noVendor")}
                      className="cursor-pointer hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() => router.push(`/inbox/${inv.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/inbox/${inv.id}`);
                        }
                      }}
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
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {(inv.status === "INBOX" || inv.status === "REVIEW") && (() => {
                          const isSelf = currentUserId && inv.createdById === currentUserId;
                          const isApproving = approvingId === inv.id;
                          return (
                            <Button
                              size="sm"
                              variant={isSelf ? "outline" : "default"}
                              onClick={() => void handleApprove(inv.id)}
                              disabled={isApproving}
                              title={
                                isSelf
                                  ? "Eigene Rechnung — Vier-Augen-Prinzip wird ggf. blockieren"
                                  : "Rechnung freigeben"
                              }
                            >
                              {isApproving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3 w-3" />
                              )}
                              <span className="ml-1">Freigeben</span>
                            </Button>
                          );
                        })()}
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
