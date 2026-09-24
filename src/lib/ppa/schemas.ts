/**
 * Request schemas of the PPA API, shared by the routes, the PPA dialog and
 * its tests. Route files may only export handlers.
 */

import { z } from "zod";

export const ppaCreateSchema = z.object({
  title: z.string().min(1, "Titel erforderlich"),
  counterparty: z.string().min(1, "Vertragspartner erforderlich"),
  parkId: z.string().uuid("Ungültige Park-ID"),
  startDate: z.string().min(1, "Startdatum erforderlich"),
  endDate: z.string().min(1, "Enddatum erforderlich"),
  contractNumber: z.string().optional().nullable(),
  pricingMode: z.enum(["FIXED", "INDEXED", "COLLAR"]).default("FIXED"),
  fixedPriceCentKwh: z.number().optional().nullable(),
  floorPriceCentKwh: z.number().optional().nullable(),
  capPriceCentKwh: z.number().optional().nullable(),
  indexBase: z.string().optional().nullable(),
  indexMarkupCentKwh: z.number().optional().nullable(),
  minQuantityMwh: z.number().optional().nullable(),
  maxQuantityMwh: z.number().optional().nullable(),
  billingPeriod: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"]).default("DRAFT"),
  notes: z.string().optional().nullable(),
});

export const ppaUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  counterparty: z.string().min(1).optional(),
  pricingMode: z.enum(["FIXED", "INDEXED", "COLLAR"]).optional(),
  fixedPriceCentKwh: z.number().optional().nullable(),
  floorPriceCentKwh: z.number().optional().nullable(),
  capPriceCentKwh: z.number().optional().nullable(),
  indexBase: z.string().optional().nullable(),
  indexMarkupCentKwh: z.number().optional().nullable(),
  minQuantityMwh: z.number().optional().nullable(),
  maxQuantityMwh: z.number().optional().nullable(),
  billingPeriod: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"]).optional(),
  notes: z.string().optional().nullable(),
  contractNumber: z.string().optional().nullable(),
});
