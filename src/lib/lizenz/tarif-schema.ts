/**
 * Input rules for tariffs and customer licences — shared by the forms and
 * the routes, so a field cannot get lost between them.
 */
import { z } from "zod";

/** Empty or missing → unlimited (null). */
const grenze = z.number().int().min(0).max(1_000_000).nullable();

export const tarifSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Kürzel nur aus Kleinbuchstaben, Ziffern und Bindestrich"),
  name: z.string().trim().min(1, "Name fehlt").max(80),
  beschreibung: z.string().trim().max(2000).nullable(),
  preisMonatEur: z.number().min(0).max(1_000_000).nullable(),
  preisHinweis: z.string().trim().max(120).nullable(),
  maxFirmen: grenze,
  maxUmspannwerke: grenze,
  maxWea: grenze,
  maxBenutzer: grenze,
  maxSpeicherMb: grenze,
  leistungen: z.array(z.string().trim().min(1).max(200)).max(30),
  hervorgehoben: z.boolean(),
  sichtbar: z.boolean(),
  sortierung: z.number().int().min(0).max(1000),
});
export type TarifEingabe = z.infer<typeof tarifSchema>;

export const kundenLizenzSchema = z.object({
  tarifId: z.uuid().nullable(),
  /** Per-customer exception; only the named counters differ from the tariff. */
  abweichung: z
    .object({
      firmen: grenze.optional(),
      umspannwerke: grenze.optional(),
      wea: grenze.optional(),
      benutzer: grenze.optional(),
      speicherMb: grenze.optional(),
    })
    .nullable(),
});
export type KundenLizenzEingabe = z.infer<typeof kundenLizenzSchema>;
