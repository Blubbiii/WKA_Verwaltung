/**
 * Form state for replacing a major component and its mapping to
 * POST /api/components/[id]/replace.
 *
 * Manufacturer, model and design life are pre-filled from the removed part —
 * the usual case is the same type again. The warranty is NOT: an exchange
 * part has its own, and inheriting it would be a promise nobody made.
 */

import { parseAmount } from "@/lib/parse-amount";

export type Ausbaugrund = "SCHEDULED" | "FAILURE" | "UPGRADE" | "PREVENTIVE" | "OTHER";
export const AUSBAUGRUENDE: Ausbaugrund[] = ["SCHEDULED", "FAILURE", "UPGRADE", "PREVENTIVE", "OTHER"];

export interface TauschFormular {
  removedAt: string;
  removalReason: Ausbaugrund;
  removalNotes: string;
  /** Empty → same day as the removal. */
  installedAt: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  designLifeYears: string;
  warrantyEndDate: string;
  warrantyProvider: string;
  costEur: string;
  notes: string;
}

export function tauschFormularFuer(
  alt: { manufacturer: string | null; model: string | null; designLifeYears: number | null },
  heute: string,
): TauschFormular {
  return {
    removedAt: heute,
    removalReason: "SCHEDULED",
    removalNotes: "",
    installedAt: "",
    manufacturer: alt.manufacturer ?? "",
    model: alt.model ?? "",
    serialNumber: "",
    designLifeYears: alt.designLifeYears != null ? String(alt.designLifeYears) : "",
    warrantyEndDate: "",
    warrantyProvider: "",
    costEur: "",
    notes: "",
  };
}

const oderNull = (wert: string) => wert.trim() || null;

export function tauschPayload(form: TauschFormular) {
  const jahre = parseAmount(form.designLifeYears);
  return {
    removedAt: form.removedAt,
    removalReason: form.removalReason,
    removalNotes: oderNull(form.removalNotes),
    ...(form.installedAt ? { installedAt: form.installedAt } : {}),
    manufacturer: oderNull(form.manufacturer),
    model: oderNull(form.model),
    serialNumber: oderNull(form.serialNumber),
    designLifeYears: jahre !== null ? Math.round(jahre) : null,
    warrantyEndDate: oderNull(form.warrantyEndDate),
    warrantyProvider: oderNull(form.warrantyProvider),
    costEur: parseAmount(form.costEur),
    notes: oderNull(form.notes),
  };
}
