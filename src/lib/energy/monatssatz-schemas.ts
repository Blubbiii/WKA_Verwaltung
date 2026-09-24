/**
 * Request schemas of the monthly rate API (EnergyMonthlyRate), shared by the
 * routes, the admin tab and its tests. ratePerKwh is EUR per kWh — the
 * curtailment valuation multiplies it with kWh.
 */

import { z } from "zod";

export const createMonthlyRateSchema = z.object({
  year: z
    .number()
    .int()
    .min(2000, "Jahr muss mindestens 2000 sein")
    .max(2100, "Jahr darf maximal 2100 sein"),
  month: z
    .number()
    .int()
    .min(1, "Monat muss zwischen 1 und 12 liegen")
    .max(12, "Monat muss zwischen 1 und 12 liegen"),
  ratePerKwh: z
    .number()
    .min(0, "Vergütungssatz muss positiv sein")
    .max(100, "Vergütungssatz erscheint unrealistisch hoch"),
  marketValue: z
    .number()
    .min(0, "Marktwert muss positiv sein")
    .max(100, "Marktwert erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  managementFee: z
    .number()
    .min(0, "Management-Gebühr muss positiv sein")
    .max(10, "Management-Gebühr erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  notes: z.string().max(1000, "Bemerkungen duerfen maximal 1000 Zeichen haben").optional().nullable(),
  revenueTypeId: z.string().uuid("Ungültige Vergütungstyp-ID"),
});

export const updateMonthlyRateSchema = z.object({
  ratePerKwh: z
    .number()
    .min(0, "Vergütungssatz muss positiv sein")
    .max(100, "Vergütungssatz erscheint unrealistisch hoch")
    .optional(),
  marketValue: z
    .number()
    .min(0, "Marktwert muss positiv sein")
    .max(100, "Marktwert erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  managementFee: z
    .number()
    .min(0, "Management-Gebühr muss positiv sein")
    .max(10, "Management-Gebühr erscheint unrealistisch hoch")
    .optional()
    .nullable(),
  notes: z.string().max(1000, "Bemerkungen duerfen maximal 1000 Zeichen haben").optional().nullable(),
});
