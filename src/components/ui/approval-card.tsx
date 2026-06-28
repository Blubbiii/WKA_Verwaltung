"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/ui/permission-gate";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Clock,
  Check,
  X,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import type { ApprovalDiff } from "@/lib/approvals/compute-diff";

/**
 * Redesign 2026-06 — Phase 2: ApprovalCard
 *
 * Zeigt einen pending 4-Augen-Approval als humane Karte statt Tabellenzeile.
 * Kontext: heute werden ApprovalRequest-Items in einer dichten Tabelle
 * gerendert — die kognitive Arbeit, *wer* will *was* mit *welcher Begründung*
 * freigegeben haben, dauert pro Zeile mehrere Sekunden. Karten-Layout mit
 * Avatar, Aktion-Satz und Begründung im Highlight-Block kürzt das auf <2 s.
 *
 * Drei Aktionen explizit:
 *  - Ablehnen (destructive-ghost)
 *  - Details öffnen (neutral, sekundär)
 *  - Freigeben (primary)
 *
 * Wenn der eingeloggte User selbst der Requester ist, ist nur "Details" sichtbar
 * (man kann den eigenen Request nicht freigeben/ablehnen, 4-Augen-Prinzip).
 */

export interface ApprovalCardProps {
  /** Requester display name (e.g. "Max Schmidt") */
  requesterName: string;
  /** Optional Avatar URL — fällt sonst auf Initialen zurück */
  requesterAvatar?: string;
  /** Was der Requester tun will, im Satz: "will SEPA-Lauf 2026-06 freigeben" */
  actionText: string;
  /** Betrag (formatted, e.g. "47 281,42 €") — optional, Currency-Surface */
  amount?: string;
  /** Begründung des Requesters (frei-text) — wird im Highlight-Block dargestellt */
  reason?: string;
  /** Wann der Request gestellt wurde */
  requestedAt: Date;
  /** Wann der Request abläuft (Optional Timer) */
  expiresAt?: Date;
  /** Eigener Request? Dann werden Approve/Reject ausgeblendet */
  isOwnRequest?: boolean;
  /** Approve-Handler */
  onApprove?: () => void;
  /** Reject-Handler */
  onReject?: () => void;
  /** Details-Handler (öffnet Detail-Dialog/Page) */
  onDetails?: () => void;
  /** Pending state — disabled buttons während Action läuft */
  isPending?: boolean;
  /**
   * ApprovalRequest-ID — wenn gesetzt, wird die Diff-Vorschau via
   * GET /api/approvals/[id]/diff lazy nachgeladen, sobald der User
   * "Details anzeigen" klickt.
   */
  approvalId?: string;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ApprovalCard({
  requesterName,
  requesterAvatar,
  actionText,
  amount,
  reason,
  requestedAt,
  expiresAt,
  isOwnRequest = false,
  onApprove,
  onReject,
  onDetails,
  isPending = false,
  approvalId,
  className,
}: ApprovalCardProps) {
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const tDiff = useTranslations("approvals.diff");

  // Diff-Vorschau: lazy-loaded beim Öffnen via approvalId
  const [diffOpen, setDiffOpen] = useState(false);
  const [diff, setDiff] = useState<ApprovalDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const diffFetched = useRef(false);

  const loadDiff = useCallback(async () => {
    if (!approvalId || diffFetched.current) return;
    diffFetched.current = true;
    setDiffLoading(true);
    try {
      const res = await fetch(`/api/approvals/${approvalId}/diff`);
      if (res.ok) {
        const json = (await res.json()) as { diff: ApprovalDiff | null };
        setDiff(json.diff);
      }
    } catch {
      // silent — UI zeigt "noDiff" wenn diff null bleibt
    } finally {
      setDiffLoading(false);
    }
  }, [approvalId]);

  useEffect(() => {
    if (diffOpen) {
      void loadDiff();
    }
  }, [diffOpen, loadDiff]);
  const timeAgo = formatDistanceToNow(requestedAt, {
    addSuffix: true,
    locale: dateLocale,
  });

  const expiresIn = expiresAt
    ? formatDistanceToNow(expiresAt, { addSuffix: true, locale: dateLocale })
    : null;

  // Urgency-Indikator: < 24h bis Ablauf → pulsierender roter Dot + Restzeit.
  // Bereits abgelaufen → "Abgelaufen" mit destructive-Tone.
  const hoursUntilExpiry = expiresAt
    ? (new Date(expiresAt).getTime() - Date.now()) / 3_600_000
    : null;
  const showUrgency = hoursUntilExpiry !== null && hoursUntilExpiry < 24;
  const isExpired = hoursUntilExpiry !== null && hoursUntilExpiry < 0;
  const urgencyLabel = isExpired
    ? "Abgelaufen"
    : hoursUntilExpiry !== null && hoursUntilExpiry < 1
      ? "< 1h"
      : hoursUntilExpiry !== null
        ? `< ${Math.ceil(hoursUntilExpiry)}h`
        : "";

  return (
    <article
      className={cn(
        "group relative rounded-xl border border-border bg-card transition-colors duration-150",
        "hover:border-border/80",
        isOwnRequest && "border-dashed bg-muted/30",
        className,
      )}
    >
      {showUrgency && (
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
          aria-label="Läuft bald ab"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          {urgencyLabel}
        </span>
      )}
      {/* Header: Avatar + Name + Timing */}
      <header className="flex items-start gap-3 p-4 pb-3">
        <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border/60">
          {requesterAvatar && <img src={requesterAvatar} alt="" />}
          <AvatarFallback className="text-xs font-medium">
            {getInitials(requesterName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm leading-snug">
            <span className="font-medium text-foreground">{requesterName}</span>
            <span className="text-muted-foreground"> {actionText}</span>
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            <span>{timeAgo}</span>
            {expiresIn && (
              <>
                <span aria-hidden>·</span>
                <span>läuft ab {expiresIn}</span>
              </>
            )}
            {isOwnRequest && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium">eigener Antrag</span>
              </>
            )}
          </div>
        </div>
        {amount && (
          <div className="shrink-0 text-right">
            <p className="tabular-currency text-base font-semibold tracking-[-0.01em] text-foreground">
              {amount}
            </p>
          </div>
        )}
      </header>

      {/* Reason block — die meisten Approvals haben einen Begründungs-Text;
          wir geben ihm sichtbaren Raum mit subtle Highlight-Bg. */}
      {reason && (
        <div className="mx-4 mb-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">
            Begründung
          </p>
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
            {reason}
          </p>
        </div>
      )}

      {/* Diff-Vorschau (B7) — collapsible, lazy-loaded.
          Zeigt strukturierte Vorher/Nachher-Werte damit der Decider sieht
          *was sich verändern wird*. Nur sichtbar wenn approvalId gesetzt ist. */}
      {approvalId && (
        <Collapsible
          open={diffOpen}
          onOpenChange={setDiffOpen}
          className="mx-4 mb-3"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {diffOpen ? tDiff("hideDetails") : tDiff("showDetails")}
              </span>
              {diffOpen ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
              {diffLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {tDiff("loading")}
                </div>
              ) : !diff || diff.changes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {diff?.summary ?? tDiff("noDiff")}
                </p>
              ) : (
                <div className="space-y-2">
                  {diff.title && (
                    <p className="text-sm font-medium text-foreground">
                      {diff.title}
                    </p>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="font-normal pb-1.5 pr-2">
                          {tDiff("colLabel")}
                        </th>
                        <th className="font-normal pb-1.5 px-2 text-right">
                          {tDiff("colBefore")}
                        </th>
                        <th className="font-normal pb-1.5 px-2 text-right">
                          {tDiff("colAfter")}
                        </th>
                        <th className="font-normal pb-1.5 pl-2 text-right">
                          {tDiff("colDelta")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.changes.map((c, idx) => {
                        const toneClass =
                          c.tone === "destructive"
                            ? "text-destructive"
                            : c.tone === "warning"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-foreground/90";
                        return (
                          <tr
                            key={idx}
                            className="border-t border-border/40"
                          >
                            <td className="py-1.5 pr-2 align-top text-foreground/80">
                              {c.label}
                            </td>
                            <td
                              className={cn(
                                "tabular-currency py-1.5 px-2 text-right align-top text-muted-foreground",
                              )}
                            >
                              {c.before ?? ""}
                            </td>
                            <td
                              className={cn(
                                "tabular-currency py-1.5 px-2 text-right align-top",
                                toneClass,
                              )}
                            >
                              {c.after ?? ""}
                            </td>
                            <td
                              className={cn(
                                "tabular-currency py-1.5 pl-2 text-right align-top",
                                toneClass,
                              )}
                            >
                              {c.delta ?? ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {diff.summary && (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                      {diff.summary}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Action row */}
      <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-3 py-2.5">
        {onDetails && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDetails}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            Details
          </Button>
        )}
        {!isOwnRequest && (
          <>
            {/* Idee C: PermissionGate erklärt warum Button disabled ist, falls
             * der User die approvals:decide-Permission nicht hat — sonst sieht
             * er nur einen grauen Button ohne Kontext. */}
            {onReject && (
              <PermissionGate permission="approvals:decide">
                {({ disabled, tooltipDisabled }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onReject}
                    disabled={isPending || disabled}
                    title={tooltipDisabled}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                    Ablehnen
                  </Button>
                )}
              </PermissionGate>
            )}
            {onApprove && (
              <PermissionGate permission="approvals:decide">
                {({ disabled, tooltipDisabled }) => (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={onApprove}
                    disabled={isPending || disabled}
                    title={tooltipDisabled}
                    className="bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                    Freigeben
                  </Button>
                )}
              </PermissionGate>
            )}
          </>
        )}
      </div>
    </article>
  );
}
