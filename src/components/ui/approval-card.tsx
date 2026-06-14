"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, Check, X, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";

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
  className,
}: ApprovalCardProps) {
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const timeAgo = formatDistanceToNow(requestedAt, {
    addSuffix: true,
    locale: dateLocale,
  });

  const expiresIn = expiresAt
    ? formatDistanceToNow(expiresAt, { addSuffix: true, locale: dateLocale })
    : null;

  return (
    <article
      className={cn(
        "group relative rounded-xl border border-border bg-card transition-colors duration-150",
        "hover:border-border/80",
        isOwnRequest && "border-dashed bg-muted/30",
        className,
      )}
    >
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
            {onReject && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onReject}
                disabled={isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                Ablehnen
              </Button>
            )}
            {onApprove && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onApprove}
                disabled={isPending}
                className="bg-success hover:bg-success/90 text-success-foreground"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                Freigeben
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
