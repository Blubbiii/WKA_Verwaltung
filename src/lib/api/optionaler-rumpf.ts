/**
 * Optionaler JSON-Rumpf einer Anfrage: leer ist erlaubt, kaputt nicht.
 *
 * Das Muster `try { body = await request.json() } catch {}` unterscheidet nicht
 * zwischen „kein Rumpf" und „kaputter Rumpf" — und stand oft die Schemaprüfung
 * mit im `try`, wurden auch ungültige Werte still übergangen. Bei Routen, die
 * mit Geld rechnen, heißt das: Die Rechnung läuft mit anderen Werten als den
 * übermittelten, und niemand erfährt es.
 */

import type { NextResponse } from "next/server";
import type { z } from "zod";
import { apiError } from "@/lib/api-errors";

export type OptionalerRumpf<T> =
  | { ok: true; daten: T }
  | { ok: false; antwort: NextResponse };

/**
 * Liest und prüft einen optionalen JSON-Rumpf.
 *
 * - kein oder leerer Rumpf → das Schema wird mit `{}` geprüft (Vorgaben greifen)
 * - kaputtes JSON → 400
 * - Schema verletzt → 400 mit Einzelheiten
 */
export async function leseOptionalenRumpf<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<OptionalerRumpf<z.infer<S>>> {
  const text = await request.text();
  let roh: unknown = {};
  if (text.trim() !== "") {
    try {
      roh = JSON.parse(text);
    } catch {
      return {
        ok: false,
        antwort: apiError("VALIDATION_FAILED", 400, { message: "Der Anfragerumpf ist kein gültiges JSON." }),
      };
    }
  }
  const geprueft = schema.safeParse(roh);
  if (!geprueft.success) {
    return {
      ok: false,
      antwort: apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: geprueft.error.flatten(),
      }),
    };
  }
  return { ok: true, daten: geprueft.data };
}
