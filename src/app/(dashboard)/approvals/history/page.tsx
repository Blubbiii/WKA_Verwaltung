"use client";

/**
 * Approval-History Page.
 *
 * Zwei Tabs:
 *  - "Meine Anfragen": Approval-Requests die der User initiiert hat.
 *  - "Meine Entscheidungen": Requests die der User entschieden hat.
 *
 * Quellen: /api/approvals/my-requests + /api/approvals/my-decisions.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_DE } from "@/lib/format";

type ApprovalAction =
  | "JOURNAL_POST"
  | "JOURNAL_REVERSE"
  | "SETTLEMENT_FINALIZE"
  | "SEPA_RUN"
  | "TENANT_SETTINGS_UPDATE"
  | "USER_ROLE_ASSIGN";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

interface UserStub {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface MyRequest {
  id: string;
  action: ApprovalAction;
  entityType: string;
  entityId: string;
  amountEur: number | null;
  status: ApprovalStatus;
  requestedAt: string;
  requestReason: string | null;
  expiresAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  decidedBy: UserStub | null;
  executionError: string | null;
  executedAt: string | null;
}

interface MyDecision {
  id: string;
  action: ApprovalAction;
  entityType: string;
  entityId: string;
  amountEur: number | null;
  status: ApprovalStatus;
  requestedAt: string;
  requestReason: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  requestedBy: UserStub | null;
  executionError: string | null;
  executedAt: string | null;
}

const ACTION_LABELS: Record<ApprovalAction, string> = {
  JOURNAL_POST: "Buchung festschreiben",
  JOURNAL_REVERSE: "Buchung stornieren",
  SETTLEMENT_FINALIZE: "Settlement finalisieren",
  SEPA_RUN: "SEPA-Lauf freigeben",
  TENANT_SETTINGS_UPDATE: "Mandanten-Einstellungen ändern",
  USER_ROLE_ASSIGN: "Rolle zuweisen",
};

const STATUS_META: Record<
  ApprovalStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; Icon: typeof CheckCircle2 }
> = {
  PENDING: { label: "Offen", variant: "outline", Icon: Clock },
  APPROVED: { label: "Genehmigt", variant: "default", Icon: CheckCircle2 },
  REJECTED: { label: "Abgelehnt", variant: "destructive", Icon: XCircle },
  EXPIRED: { label: "Abgelaufen", variant: "secondary", Icon: AlertCircle },
};

function fmtEur(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString(LOCALE_DE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(LOCALE_DE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtName(p: UserStub | null): string {
  if (!p) return "Unbekannt";
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email || "Unbekannt";
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

export default function ApprovalsHistoryPage() {
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [myDecisions, setMyDecisions] = useState<MyDecision[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingDecisions, setLoadingDecisions] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    const ac = new AbortController();
    try {
      const res = await fetch("/api/approvals/my-requests", { signal: ac.signal });
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const json = await res.json();
      setMyRequests(json.data ?? []);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error(err.message);
      }
    } finally {
      setLoadingRequests(false);
    }
    return () => ac.abort();
  }, []);

  const loadDecisions = useCallback(async () => {
    setLoadingDecisions(true);
    const ac = new AbortController();
    try {
      const res = await fetch("/api/approvals/my-decisions", { signal: ac.signal });
      if (!res.ok) throw new Error("Laden fehlgeschlagen");
      const json = await res.json();
      setMyDecisions(json.data ?? []);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error(err.message);
      }
    } finally {
      setLoadingDecisions(false);
    }
    return () => ac.abort();
  }, []);

  useEffect(() => {
    loadRequests();
    loadDecisions();
  }, [loadRequests, loadDecisions]);

  const refreshAll = useCallback(() => {
    loadRequests();
    loadDecisions();
  }, [loadRequests, loadDecisions]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Genehmigungs-Verlauf"
        description="Verlauf deiner initiierten Anfragen und Entscheidungen"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/approvals">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zu offenen Anfragen
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={loadingRequests || loadingDecisions}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${
                  loadingRequests || loadingDecisions ? "animate-spin" : ""
                }`}
              />
              Aktualisieren
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList>
          <TabsTrigger value="requests">
            Meine Anfragen ({myRequests.length})
          </TabsTrigger>
          <TabsTrigger value="decisions">
            Meine Entscheidungen ({myDecisions.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB: Meine Anfragen */}
        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Von dir initiierte Anfragen
              </CardTitle>
              <CardDescription>
                Die letzten 50 Anfragen, die du zur Freigabe gestellt hast.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRequests ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : myRequests.length === 0 ? (
                <Alert>
                  <History className="h-4 w-4" />
                  <AlertTitle>Keine Anfragen</AlertTitle>
                  <AlertDescription>
                    Du hast noch keine Approval-Anfragen initiiert.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aktion</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Angefragt</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                        <TableHead>Begründung</TableHead>
                        <TableHead>Entschieden von</TableHead>
                        <TableHead>Entschieden am</TableHead>
                        <TableHead>Ergebnis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRequests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {ACTION_LABELS[r.action]}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {fmtDate(r.requestedAt)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtEur(r.amountEur)}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate">
                            {r.requestReason || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.decidedBy ? fmtName(r.decidedBy) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {fmtDate(r.decidedAt)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.executionError ? (
                              <Badge variant="destructive">
                                Ausführung fehlgeschlagen
                              </Badge>
                            ) : r.executedAt ? (
                              <Badge variant="default">Ausgeführt</Badge>
                            ) : r.decisionReason ? (
                              <span
                                className="text-muted-foreground line-clamp-2"
                                title={r.decisionReason}
                              >
                                {r.decisionReason}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Meine Entscheidungen */}
        <TabsContent value="decisions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4" />
                Von dir getroffene Entscheidungen
              </CardTitle>
              <CardDescription>
                Die letzten 50 Anfragen, die du genehmigt oder abgelehnt hast.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDecisions ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : myDecisions.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Keine Entscheidungen</AlertTitle>
                  <AlertDescription>
                    Du hast noch keine Entscheidungen getroffen.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aktion</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Initiator</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                        <TableHead>Begründung (Anfrage)</TableHead>
                        <TableHead>Entschieden am</TableHead>
                        <TableHead>Begründung (Entscheidung)</TableHead>
                        <TableHead>Ergebnis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myDecisions.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">
                            {ACTION_LABELS[d.action]}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={d.status} />
                          </TableCell>
                          <TableCell className="text-xs">
                            {fmtName(d.requestedBy)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtEur(d.amountEur)}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate">
                            {d.requestReason || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {fmtDate(d.decidedAt)}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate">
                            {d.decisionReason || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {d.executionError ? (
                              <Badge variant="destructive">
                                Ausführung fehlgeschlagen
                              </Badge>
                            ) : d.executedAt ? (
                              <Badge variant="default">Ausgeführt</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
