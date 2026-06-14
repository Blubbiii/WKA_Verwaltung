"use client";

import type { LucideIcon } from "lucide-react";
import { FilterX, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Redesign 2026-06 R-4: EmptyState mit drei Pfaden.
 *
 * Vorher: ein generisches "Icon + Title + Description + Action"-Template, zentriert,
 * gleich für alle Leer-Zustände. Das ist UX-trügerisch — der Nutzer weiß nicht warum
 * der Zustand leer ist (Filter? Wirklich keine Daten? Neuer Tenant?) und welcher
 * nächste Schritt sinnvoll wäre.
 *
 * Drei Varianten:
 *   - `default`   : Standard-Empty (wirklich keine Daten in dieser Sektion)
 *   - `filtered`  : Filter aktiv, keine Treffer → Reset-CTA prominent
 *   - `first-time`: Onboarding-Moment (neuer Tenant, leere Datenbank) → großer CTA
 *
 * API ist abwärtskompatibel: Bestand-Aufrufer ohne `kind` bekommen `default`.
 */

interface EmptyStateBaseProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Optional illustration emoji shown above the icon (legacy) */
  illustration?: string;
  className?: string;
}

interface EmptyStateDefaultProps extends EmptyStateBaseProps {
  kind?: "default";
}

interface EmptyStateFilteredProps extends EmptyStateBaseProps {
  kind: "filtered";
  /** Callback to clear active filters — renders as primary action */
  onClearFilters?: () => void;
  clearFiltersLabel?: string;
}

interface EmptyStateFirstTimeProps extends EmptyStateBaseProps {
  kind: "first-time";
  /** Short benefit copy shown below the description */
  benefits?: string[];
}

export type EmptyStateProps =
  | EmptyStateDefaultProps
  | EmptyStateFilteredProps
  | EmptyStateFirstTimeProps;

export function EmptyState(props: EmptyStateProps) {
  const { title, description, action, illustration, className } = props;
  const kind = props.kind ?? "default";

  // ---------------------------------------------------------------------
  // Filtered: kompakter Inline-Block, NICHT zentriert über volle Höhe.
  // Der Nutzer hat aktiv gefiltert — wir respektieren seine Position auf
  // der Page (er ist nicht "verloren"), bieten aber den Filter-Reset
  // sichtbar an.
  // ---------------------------------------------------------------------
  if (kind === "filtered") {
    const filteredProps = props as EmptyStateFilteredProps;
    const Icon = props.icon ?? FilterX;
    return (
      <div
        role="status"
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-12 text-center",
          className,
        )}
      >
        <div className="rounded-full bg-muted/60 p-3">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {(filteredProps.onClearFilters || action) && (
          <div className="mt-1 flex items-center gap-2">
            {filteredProps.onClearFilters && (
              <button
                type="button"
                onClick={filteredProps.onClearFilters}
                className="text-sm font-medium text-primary hover:underline underline-offset-4 transition-colors"
              >
                {filteredProps.clearFiltersLabel ?? "Filter zurücksetzen"}
              </button>
            )}
            {action}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // First-time: großer Onboarding-Moment. Mehr Whitespace, optionale
  // Benefits-Liste, Action ist primary. Wird auf neue Tenants / leere
  // Sektionen ohne historische Daten angewendet.
  // ---------------------------------------------------------------------
  if (kind === "first-time") {
    const firstTime = props as EmptyStateFirstTimeProps;
    const Icon = props.icon ?? Sparkles;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-5 py-20 text-center max-w-lg mx-auto",
          className,
        )}
      >
        {illustration && (
          <span className="text-5xl" role="img" aria-hidden>
            {illustration}
          </span>
        )}
        <div className="rounded-2xl bg-primary/10 ring-1 ring-primary/20 p-5">
          <Icon className="h-9 w-9 text-primary" aria-hidden />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-[-0.02em]" style={{ textWrap: "balance" } as React.CSSProperties}>
            {title}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed" style={{ textWrap: "pretty" } as React.CSSProperties}>
              {description}
            </p>
          )}
        </div>
        {firstTime.benefits && firstTime.benefits.length > 0 && (
          <ul className="space-y-1.5 text-left text-sm text-muted-foreground">
            {firstTime.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Default: schlanker, ohne Stagger-Reveal. Reine Information + optionale
  // Action. Animation auf reines Crossfade reduziert (R-5: Motion-Cleanup).
  // ---------------------------------------------------------------------
  const DefaultIcon = props.icon;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-200",
        className,
      )}
    >
      {illustration && (
        <span className="text-4xl mb-3" role="img" aria-hidden>
          {illustration}
        </span>
      )}
      {DefaultIcon && (
        <div className="rounded-full bg-muted/60 p-4 mb-5 ring-1 ring-border/60">
          <DefaultIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
      )}
      <h3 className="text-lg font-semibold tracking-[-0.02em]" style={{ textWrap: "balance" } as React.CSSProperties}>
        {title}
      </h3>
      {description && (
        <p className="text-muted-foreground mt-2 max-w-sm leading-relaxed text-sm" style={{ textWrap: "pretty" } as React.CSSProperties}>
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
