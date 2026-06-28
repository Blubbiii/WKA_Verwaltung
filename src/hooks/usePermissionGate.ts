"use client";

/**
 * Idee C — Permission-Why-Gate.
 *
 * Wenn ein User eine Permission NICHT hat, liefert dieser Hook neben dem
 * `allowed: false` auch einen `reason`-Text, der direkt in tooltipDisabled-
 * Slots oder den `<PermissionGate>`-Wrapper geht. So sehen User die einen
 * disabled-Button sehen *warum* — "Du brauchst `invoices:update`" — und
 * können Admins zielgerichtet fragen.
 *
 * Baut auf dem bestehenden `usePermissions`-Hook auf (React-Query gecached,
 * geshared über Komponenten).
 */

import { useTranslations } from "next-intl";
import { usePermissions } from "@/hooks/usePermissions";

export interface PermissionGateResult {
  /** true wenn der User die Permission hat. Während des Loadings false. */
  allowed: boolean;
  /** Disabled-Tooltip-Text wenn nicht erlaubt — undefined wenn allowed. */
  reason: string | undefined;
  /** true solange die Permissions noch laden (initial-State). */
  loading: boolean;
}

export function usePermissionGate(permission: string): PermissionGateResult {
  const { hasPermission, loaded } = usePermissions();
  const t = useTranslations("permissionGate");

  if (!loaded) {
    return { allowed: false, reason: undefined, loading: true };
  }
  const allowed = hasPermission(permission);
  return {
    allowed,
    reason: allowed ? undefined : t("missingPermission", { permission }),
    loading: false,
  };
}
