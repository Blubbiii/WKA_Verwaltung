"use client";

/**
 * Calendar export button — exposes the existing `/api/export/calendar` endpoint
 * as a one-click download of an ICS file.
 *
 * Usage:
 * ```tsx
 * <CalendarExportButton type="contracts" />
 * <CalendarExportButton type="leases" status="ACTIVE" />
 * ```
 */

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

type CalendarExportType = "contracts" | "leases" | "all";

interface CalendarExportButtonProps {
  type: CalendarExportType;
  status?: string;
  fundId?: string;
  parkId?: string;
  /** Optional custom label; falls back to a sensible German default */
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

const DEFAULT_LABELS: Record<CalendarExportType, string> = {
  contracts: "Kalender (ICS)",
  leases: "Kalender (ICS)",
  all: "Kalender (ICS)",
};

export function CalendarExportButton({
  type,
  status,
  fundId,
  parkId,
  label,
  variant = "outline",
  size = "default",
  className,
}: CalendarExportButtonProps) {
  const handleClick = () => {
    const params = new URLSearchParams({ type });
    if (status) params.set("status", status);
    if (fundId) params.set("fundId", fundId);
    if (parkId) params.set("parkId", parkId);
    // Trigger native browser download; ICS endpoint returns Content-Disposition.
    window.location.href = `/api/export/calendar?${params.toString()}`;
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      title="ICS-Kalenderdatei herunterladen"
    >
      <Calendar className="mr-2 h-4 w-4" />
      {label ?? DEFAULT_LABELS[type]}
    </Button>
  );
}
