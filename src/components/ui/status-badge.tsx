"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatusMeta, StatusTone } from "@/lib/status-labels";
import { UNKNOWN_STATUS } from "@/lib/status-labels";

interface StatusBadgeProps {
  /** Status-Code aus dem Mapping (z.B. "ACTIVE", "DRAFT"). */
  status: string;
  /** Mapping-Object aus @/lib/status-labels (z.B. INVOICE_STATUS). */
  mapping: Record<string, StatusMeta>;
  /** Optional className-Override. */
  className?: string;
  /** Optional Größe: "sm" | "default". */
  size?: "sm" | "default";
  /** Optional: Icon ausblenden. */
  hideIcon?: boolean;
}

/**
 * Tone-Klassen liegen auf semantischen Tokens — Dark/Light-kompatibel.
 * Border + bg + text werden zusammengesetzt für konsistentes Look.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  default: "bg-primary/15 text-primary border-primary/30",
  secondary: "bg-muted text-muted-foreground border-border",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
};

/**
 * Einheitliches Status-Badge mit Doppel-Kodierung (Farbe + Icon + Label).
 *
 * Verwendung:
 *   import { INVOICE_STATUS } from "@/lib/status-labels";
 *   <StatusBadge status={invoice.status} mapping={INVOICE_STATUS} />
 *
 * Tone-Klassen liegen auf semantischen Tokens (success/warning/destructive/info),
 * damit es im Dark- wie Light-Theme korrekt aussieht.
 */
export function StatusBadge({
  status,
  mapping,
  className,
  size = "default",
  hideIcon,
}: StatusBadgeProps) {
  const t = useTranslations("statusLabels");
  const meta = mapping[status] ?? UNKNOWN_STATUS;
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn(
        TONE_CLASSES[meta.tone],
        "inline-flex items-center gap-1.5 font-medium border",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
        className,
      )}
    >
      {Icon && !hideIcon && (
        <Icon
          className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3", "shrink-0")}
          aria-hidden
        />
      )}
      <span>{t(meta.labelKey)}</span>
    </Badge>
  );
}
