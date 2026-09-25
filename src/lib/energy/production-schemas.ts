/**
 * Validation of production data (create/update). Shared by the two routes.
 *
 * revenueEur/revenueTypeId: revenue can be entered manually (decision E1,
 * 2026-09). It is stored and shown; calculations keep using the grid
 * operator statement.
 */
import { z } from "zod";

const erloes = {
  revenueEur: z.number().finite().optional().nullable(),
  revenueTypeId: z.uuid().optional().nullable(),
};

export const productionCreateSchema = z.object({
  turbineId: z.string().uuid("Ungültige Turbinen-ID"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  productionKwh: z.number().nonnegative("Produktion muss >= 0 sein"),
  operatingHours: z.number().nonnegative("Betriebsstunden muessen >= 0 sein").optional().nullable(),
  availabilityPct: z.number().min(0).max(100, "Verfügbarkeit muss zwischen 0 und 100 liegen").optional().nullable(),
  source: z.enum(["MANUAL", "CSV_IMPORT", "EXCEL_IMPORT", "SCADA"]).default("MANUAL"),
  status: z.enum(["DRAFT", "CONFIRMED", "INVOICED"]).default("DRAFT"),
  notes: z.string().max(1000).optional().nullable(),
  ...erloes,
});

export const productionUpdateSchema = z.object({
  productionKwh: z.number().nonnegative("Produktion muss >= 0 sein").optional(),
  operatingHours: z.number().nonnegative("Betriebsstunden muessen >= 0 sein").optional().nullable(),
  availabilityPct: z.number().min(0).max(100, "Verfügbarkeit muss zwischen 0 und 100 liegen").optional().nullable(),
  source: z.enum(["MANUAL", "CSV_IMPORT", "EXCEL_IMPORT", "SCADA"]).optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "INVOICED"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
  // Jahr/Monat/Turbine sind NICHT aenderbar (unique constraint)
  ...erloes,
});
