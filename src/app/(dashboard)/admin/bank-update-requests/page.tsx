"use client";

/**
 * PF-3: Admin-UI für Bankdaten-Änderungs-Approval-Workflow.
 * Listet pending PendingBankUpdate-Einträge mit Approve/Reject-Aktion.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ShieldAlert, RefreshCw } from "lucide-react";
import { LOCALE_DE } from "@/lib/format";

interface PendingRequest {
  id: string;
  personName: string;
  personEmail: string | null;
  currentIban: string | null;
  currentBic: string | null;
  currentBankName: string | null;
  requestedIban: string | null;
  requestedBic: string | null;
  requestedBankName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  decidedAt: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
}

export default function BankUpdateRequestsPage() {
  const t = useTranslations("admin.bankUpdateRequests");
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [busy, setBusy] = useState<string | null>(null);

  // AbortController um bei Filter-Wechsel stale Requests zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const fetchRequests = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bank-update-requests?status=${filter}`, {
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(t("errors.loadFailed"));
      const json = await res.json();
      if (!ac.signal.aborted) setRequests(json.data || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : t("errors.loadFailed"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    fetchRequests();
    return () => abortRef.current?.abort();
  }, [fetchRequests]);

  async function decide(id: string, action: "APPROVE" | "REJECT") {
    if (action === "APPROVE" && !confirm(t("confirmApprove"))) {
      return;
    }
    if (action === "REJECT" && !confirm(t("confirmReject"))) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/bank-update-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t("errors.decisionFailed"));
      }
      toast.success(t(action === "APPROVE" ? "toasts.approved" : "toasts.rejected"));
      await fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.unknown"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-amber-500" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "PENDING" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("PENDING")}
          >
            {t("filterPending")}
          </Button>
          <Button
            variant={filter === "ALL" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("ALL")}
          >
            {t("filterAll")}
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchRequests} aria-label={t("reload")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : requests.length === 0 ? (
        <Alert>
          <AlertDescription>
            {filter === "PENDING" ? t("emptyPending") : t("emptyAll")}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{r.personName}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {r.personEmail} · {t("requestedBy", { name: r.requestedBy || "—" })} ·{" "}
                      {new Date(r.requestedAt).toLocaleString(LOCALE_DE)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      r.status === "PENDING"
                        ? "secondary"
                        : r.status === "APPROVED"
                          ? "default"
                          : "destructive"
                    }
                  >
                    {r.status === "PENDING"
                      ? t("statusPending")
                      : r.status === "APPROVED"
                        ? t("statusApproved")
                        : t("statusRejected")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {t("currentData")}
                    </p>
                    <p className="text-sm">
                      <strong>{t("bank")}:</strong> {r.currentBankName || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>{t("iban")}:</strong> {r.currentIban || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>{t("bic")}:</strong> {r.currentBic || "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                      {t("newData")}
                    </p>
                    <p className="text-sm">
                      <strong>{t("bank")}:</strong> {r.requestedBankName || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>{t("iban")}:</strong> {r.requestedIban || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>{t("bic")}:</strong> {r.requestedBic || "—"}
                    </p>
                  </div>
                </div>

                {r.status === "PENDING" && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => decide(r.id, "REJECT")}
                      disabled={busy === r.id}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      {t("reject")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decide(r.id, "APPROVE")}
                      disabled={busy === r.id}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {t("approve")}
                    </Button>
                  </div>
                )}
                {r.status !== "PENDING" && r.decidedBy && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {t("decidedBy", {
                      name: r.decidedBy,
                      date: r.decidedAt ? new Date(r.decidedAt).toLocaleString(LOCALE_DE) : "",
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
