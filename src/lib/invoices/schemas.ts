/**
 * Request schemas of the invoice API, shared by the routes and their tests.
 * Route files may only export handlers.
 */

import { z } from "zod";
import { isNotInFuture } from "@/lib/validation/not-in-future";

// Schema für Invoice-Items
export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  unitPrice: z.number(),
  taxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).default("STANDARD"),
  plotAreaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]).optional(),
  plotId: z.uuid().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});

export const invoiceCreateSchema = z.object({
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]),
  // F8-Compliance: invoiceDate darf nicht in der Zukunft liegen (keine Vor-Datierung
  // von Umsätzen; wichtig für GoBD/Zeitgerechtheit §239 HGB).
  invoiceDate: z
    .string()
    .refine((v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && isNotInFuture(d);
    }, {
      message: "Rechnungsdatum darf nicht in der Zukunft liegen",
    }),
  dueDate: z.string().optional().nullable(),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientAddress: z.string().optional().nullable(),
  // Bedienaufwand #11: Verweis auf den CRM-Kontakt. Die Mandantenzugehoerig-
  // keit wird unten geprueft — die ID kommt vom Client.
  recipientPersonId: z.string().uuid().optional().nullable(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  shareholderId: z.uuid().optional().nullable(),
  leaseId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  // Skonto (early payment discount) - both optional
  skontoPercent: z.number().min(0.01).max(99.99).optional().nullable(),
  skontoDays: z.number().int().min(1).max(365).optional().nullable(),
  // §25b UStG Dreiecksgeschäft (innergemeinschaftliche Lieferkette).
  isTriangulationDeal: z.boolean().optional().default(false),
  // EU-Empfänger-Felder (für ZM-Meldung). Sind optional auf Schema-Ebene,
  // werden aber vom EU-Detection-Code in ZM nur genutzt wenn beide gesetzt.
  recipientCountry: z.string().length(2).optional().nullable(),
  recipientVatId: z.string().min(4).max(50).optional().nullable(),
  items: z.array(invoiceItemSchema).min(1, "Mindestens eine Position erforderlich"),
});

export const invoiceUpdateSchema = z.object({
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  recipientType: z.string().optional().nullable(),
  recipientName: z.string().optional().nullable(),
  recipientAddress: z.string().optional().nullable(),
  // Bedienaufwand #11: Verweis auf den CRM-Kontakt, nullable zum Loesen.
  recipientPersonId: z.string().uuid().nullable().optional(),
  serviceStartDate: z.string().optional().nullable(),
  serviceEndDate: z.string().optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fundId: z.uuid().optional().nullable(),
  shareholderId: z.uuid().optional().nullable(),
  leaseId: z.uuid().optional().nullable(),
  parkId: z.uuid().optional().nullable(),
  // Skonto (early payment discount) - both optional
  skontoPercent: z.number().min(0.01).max(99.99).optional().nullable(),
  skontoDays: z.number().int().min(1).max(365).optional().nullable(),
  // E-Invoice: Leitweg-ID for public sector recipients (XRechnung)
  leitwegId: z.string().max(46).optional().nullable(),
  // F15-Compliance: Optimistic Locking PoC.
  // Client sends the `updatedAt` timestamp it originally read. If the row
  // was modified in the meantime by another user, we return 409 CONFLICT
  // instead of silently overwriting their changes ("Lost Update").
  // Header-Alternative `If-Unmodified-Since` wäre RFC-konformer, aber nur
  // 1-Sekunden-Auflösung. `expectedUpdatedAt` in ms geht sicher.
  // TODO: Nach PoC-Erfolg auf weitere PATCH-Routes ausrollen (Contract,
  // Fund, Person, Lease, Shareholder).
  expectedUpdatedAt: z.iso.datetime().optional(),
});
