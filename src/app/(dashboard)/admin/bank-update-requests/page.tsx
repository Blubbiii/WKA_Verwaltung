"use client";

/**
 * PF-3: Admin-UI für Bankdaten-Änderungs-Approval-Workflow.
 * Listet pending PendingBankUpdate-Einträge mit Approve/Reject-Aktion.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ShieldAlert, RefreshCw } from "lucide-react";

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
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bank-update-requests?status=${filter}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setRequests(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function decide(id: string, action: "APPROVE" | "REJECT") {
    if (
      action === "APPROVE" &&
      !confirm("Bankdaten-Änderung wirklich freigeben? Die neuen Daten werden sofort übernommen.")
    ) {
      return;
    }
    if (action === "REJECT" && !confirm("Anfrage ablehnen?")) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/admin/bank-update-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Fehler bei der Entscheidung");
      }
      toast.success(action === "APPROVE" ? "Freigegeben" : "Abgelehnt");
      await fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unbekannter Fehler");
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
            Bankdaten-Änderungen
          </h1>
          <p className="text-muted-foreground">
            Prüfung & Freigabe von Bankdaten-Änderungen aus dem Anleger-Portal (Betrugsschutz).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "PENDING" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("PENDING")}
          >
            Offen
          </Button>
          <Button
            variant={filter === "ALL" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("ALL")}
          >
            Alle
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchRequests} aria-label="Neu laden">
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
            {filter === "PENDING"
              ? "Keine offenen Anfragen."
              : "Keine Anfragen vorhanden."}
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
                      {r.personEmail} · Beantragt von {r.requestedBy || "—"} ·{" "}
                      {new Date(r.requestedAt).toLocaleString("de-DE")}
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
                      ? "Offen"
                      : r.status === "APPROVED"
                        ? "Freigegeben"
                        : "Abgelehnt"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Aktuell hinterlegt
                    </p>
                    <p className="text-sm">
                      <strong>Bank:</strong> {r.currentBankName || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>IBAN:</strong> {r.currentIban || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>BIC:</strong> {r.currentBic || "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                      Neue Daten (beantragt)
                    </p>
                    <p className="text-sm">
                      <strong>Bank:</strong> {r.requestedBankName || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>IBAN:</strong> {r.requestedIban || "—"}
                    </p>
                    <p className="text-sm font-mono">
                      <strong>BIC:</strong> {r.requestedBic || "—"}
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
                      Ablehnen
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decide(r.id, "APPROVE")}
                      disabled={busy === r.id}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Freigeben
                    </Button>
                  </div>
                )}
                {r.status !== "PENDING" && r.decidedBy && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Entschieden von {r.decidedBy} am{" "}
                    {r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : ""}
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
