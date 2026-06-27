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
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalCard } from "@/components/ui/approval-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LOCALE_DE } from "@/lib/format";

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

function fmtEur(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
    currency: "EUR",
  });
}

function fmtName(p: PendingApproval["requestedBy"], fallback: string): string {
  return (
    `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email || fallback
  );
}

export default function ApprovalsPage() {
  const t = useTranslations("approvals.inbox");
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionDialog, setDecisionDialog] = useState<{
    item: PendingApproval;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // AbortController gegen Race-Conditions
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await fetch("/api/approvals/pending", { signal: ac.signal });
      if (!res.ok) throw new Error(t("loadFailed"));
      const json = await res.json();
      if (!ac.signal.aborted) setItems(json.data ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [t]);

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
        throw new Error(err.message ?? t("decideFailed"));
      }
      const json = await res.json();
      if (decisionDialog.decision === "APPROVED" && json.executionError) {
        toast.warning(t("approvedExecutionFailed", { error: json.executionError }));
      } else {
        toast.success(
          decisionDialog.decision === "APPROVED"
            ? t("approvedAndExecuted")
            : t("rejected"),
        );
      }
      setDecisionDialog(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/approvals/history">
                <History className="h-4 w-4 mr-2" />
                {t("history")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              {t("refresh")}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {t("openRequestsTitle", { count: items.length })}
          </CardTitle>
          <CardDescription>
            {t("openRequestsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            // Redesign 2026-06 R-4: EmptyState first-time-Variante für gepflegte
            // Inbox — "keine offenen Anträge" ist ein gut Zeichen, kein Loch.
            <EmptyState
              kind="first-time"
              icon={ShieldCheck}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            // Redesign 2026-06: Approval-Inbox als Karten-Liste statt Tabelle.
            // Avatar + "Wer will Was" + Begründung + 3-Klick-Aktionen lesen sich
            // in unter 2 s pro Item — die Tabelle brauchte 5+ s.
            <div className="space-y-3">
              {items.map((it) => (
                <ApprovalCard
                  key={it.id}
                  approvalId={it.id}
                  requesterName={fmtName(it.requestedBy, t("unknownRequester"))}
                  actionText={t(`actions.${it.action}`)}
                  amount={it.amountEur !== null ? fmtEur(it.amountEur) : undefined}
                  reason={it.requestReason ?? undefined}
                  requestedAt={new Date(it.requestedAt)}
                  expiresAt={new Date(it.expiresAt)}
                  onApprove={() => openDialog(it, "APPROVED")}
                  onReject={() => openDialog(it, "REJECTED")}
                />
              ))}
            </div>
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
              {decisionDialog?.decision === "APPROVED" ? t("approve") : t("reject")}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog && (
                <>
                  {t(`actions.${decisionDialog.item.action}`)} ·{" "}
                  {fmtEur(decisionDialog.item.amountEur)} · {t("colInitiator")}{" "}
                  {fmtName(decisionDialog.item.requestedBy, t("unknownRequester"))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="approval-reason">
              {t("reasonLabel")}{" "}
              {decisionDialog?.decision === "REJECTED"
                ? t("reasonRecommended")
                : t("reasonOptional")}
            </Label>
            <Textarea
              id="approval-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                decisionDialog?.decision === "APPROVED"
                  ? t("reasonApprovePlaceholder")
                  : t("reasonRejectPlaceholder")
              }
            />
          </div>

          {decisionDialog?.decision === "APPROVED" && (
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                {t("executionNotice")}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionDialog(null)}
              disabled={submitting}
            >
              {t("cancel")}
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
              {decisionDialog?.decision === "APPROVED" ? t("approve") : t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
