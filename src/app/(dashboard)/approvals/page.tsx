"use client";

/**
 * Sprint 3 Permissions v2: Approval-Inbox.
 *
 * Zeigt alle PENDING ApprovalRequests die der aktuelle User entscheiden
 * darf (= nicht selbst initiiert hat). Per Approve/Reject-Klick wird
 * der Workflow durchgezogen, bei APPROVED läuft der Executor automatisch.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Clock,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface PendingApproval {
  id: string;
  action:
    | "JOURNAL_POST"
    | "JOURNAL_REVERSE"
    | "SETTLEMENT_FINALIZE"
    | "SEPA_RUN"
    | "TENANT_SETTINGS_UPDATE"
    | "USER_ROLE_ASSIGN";
  entityType: string;
  entityId: string;
  amountEur: number | null;
  requestedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  requestedAt: string;
  requestReason: string | null;
  expiresAt: string;
}

const ACTION_LABELS: Record<PendingApproval["action"], string> = {
  JOURNAL_POST: "Buchung festschreiben",
  JOURNAL_REVERSE: "Buchung stornieren",
  SETTLEMENT_FINALIZE: "Settlement finalisieren",
  SEPA_RUN: "SEPA-Lauf freigeben",
  TENANT_SETTINGS_UPDATE: "Mandanten-Einstellungen ändern",
  USER_ROLE_ASSIGN: "Rolle zuweisen",
};

function fmtEur(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
    currency: "EUR",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtName(p: PendingApproval["requestedBy"]): string {
  return (
    `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email || "Unbekannt"
  );
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionDialog, setDecisionDialog] = useState<{
    item: PendingApproval;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // H-9: AbortController gegen Race-Conditions
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await fetch("/api/approvals/pending", { signal: ac.signal });
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const json = await res.json();
      if (!ac.signal.aborted) setItems(json.data ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const openDialog = (item: PendingApproval, decision: "APPROVED" | "REJECTED") => {
    setDecisionDialog({ item, decision });
    setReason("");
  };

  const submitDecision = async () => {
    if (!decisionDialog) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/approvals/${decisionDialog.item.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: decisionDialog.decision,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Decide fehlgeschlagen");
      }
      const json = await res.json();
      if (decisionDialog.decision === "APPROVED" && json.executionError) {
        toast.warning(`Genehmigt — Ausführung fehlgeschlagen: ${json.executionError}`);
      } else {
        toast.success(
          decisionDialog.decision === "APPROVED"
            ? "Genehmigt und ausgeführt"
            : "Abgelehnt",
        );
      }
      setDecisionDialog(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Genehmigungen"
        description="Vier-Augen-Prinzip — Anfragen die du als zweiter Berechtigter entscheiden kannst"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/approvals/history">
                <History className="h-4 w-4 mr-2" />
                Verlauf
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Offene Anfragen ({items.length})
          </CardTitle>
          <CardDescription>
            Pro Anfrage prüfe Aktion, Betrag, Initiator. Bei Genehmigung wird
            die Aktion automatisch ausgeführt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Keine offenen Anfragen</AlertTitle>
              <AlertDescription>
                Aktuell wartet nichts auf deine Entscheidung.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aktion</TableHead>
                  <TableHead>Initiator</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Angefragt</TableHead>
                  <TableHead>Läuft ab</TableHead>
                  <TableHead className="text-right">Entscheidung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const expiringSoon =
                    new Date(it.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{ACTION_LABELS[it.action]}</div>
                        {it.requestReason && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {it.requestReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{fmtName(it.requestedBy)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtEur(it.amountEur)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {fmtDate(it.requestedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={expiringSoon ? "destructive" : "outline"}>
                          <Clock className="h-3 w-3 mr-1" />
                          {fmtDate(it.expiresAt)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openDialog(it, "APPROVED")}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Genehmigen
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog(it, "REJECTED")}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Ablehnen
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={decisionDialog !== null}
        onOpenChange={(o) => !o && setDecisionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {decisionDialog?.decision === "APPROVED" ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              )}
              {decisionDialog?.decision === "APPROVED" ? "Genehmigen" : "Ablehnen"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog && (
                <>
                  {ACTION_LABELS[decisionDialog.item.action]} ·{" "}
                  {fmtEur(decisionDialog.item.amountEur)} · Initiator{" "}
                  {fmtName(decisionDialog.item.requestedBy)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label>
              Begründung{" "}
              {decisionDialog?.decision === "REJECTED" ? "(empfohlen)" : "(optional)"}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                decisionDialog?.decision === "APPROVED"
                  ? "z.B. Beleg geprüft, Vertragslage ok"
                  : "z.B. Beleg fehlt, Betrag nicht plausibel"
              }
            />
          </div>

          {decisionDialog?.decision === "APPROVED" && (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Bei Genehmigung wird die Aktion sofort durchgeführt. Bei Scheitern
                bleibt die Genehmigung gültig, aber der Initiator muss manuell
                korrigieren.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionDialog(null)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => void submitDecision()}
              disabled={submitting}
              variant={
                decisionDialog?.decision === "APPROVED" ? "default" : "destructive"
              }
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : decisionDialog?.decision === "APPROVED" ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              {decisionDialog?.decision === "APPROVED" ? "Genehmigen" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
