/**
 * Optionaler JSON-Rumpf: leer ist erlaubt, kaputt nicht.
 *
 * Sechs Routen lasen ihren optionalen Rumpf in einem `try { … } catch {}`.
 * Damit galt nicht nur „kein Rumpf" als in Ordnung, sondern auch kaputtes JSON
 * und — wo die Schemaprüfung im selben `try` stand — ungültige Werte. Bei der
 * Abrechnungsperiode wurde so aus einer Probeberechnung mit falsch getipptem
 * Erlös eine gespeicherte Abrechnung mit dem alten Erlös.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { leseOptionalenRumpf } from "./optionaler-rumpf";

function anfrage(rumpf?: string): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(rumpf !== undefined ? { body: rumpf } : {}),
  });
}

const SCHEMA = z.object({
  totalRevenue: z.number().optional(),
  saveResult: z.boolean().default(true),
});

describe("leseOptionalenRumpf", () => {
  it("ohne Rumpf: Vorgaben des Schemas", async () => {
    const r = await leseOptionalenRumpf(anfrage(), SCHEMA);
    expect(r).toEqual({ ok: true, daten: { saveResult: true } });
  });

  it("leerer Rumpf aus Leerzeichen gilt als kein Rumpf", async () => {
    const r = await leseOptionalenRumpf(anfrage("   "), SCHEMA);
    expect(r.ok).toBe(true);
  });

  it("gültiger Rumpf wird geprüft übernommen", async () => {
    const r = await leseOptionalenRumpf(anfrage('{"totalRevenue":150000,"saveResult":false}'), SCHEMA);
    expect(r).toEqual({ ok: true, daten: { totalRevenue: 150000, saveResult: false } });
  });

  it("kaputtes JSON wird abgelehnt statt übergangen", async () => {
    const r = await leseOptionalenRumpf(anfrage('{"totalRevenue":'), SCHEMA);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unerwartet");
    expect(r.antwort.status).toBe(400);
  });

  it("ein Erlös als Text wird abgelehnt — die Probeberechnung wird nicht zur gespeicherten", async () => {
    const r = await leseOptionalenRumpf(anfrage('{"totalRevenue":"150000","saveResult":false}'), SCHEMA);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unerwartet");
    expect(r.antwort.status).toBe(400);
    const rumpf = await r.antwort.json();
    expect(rumpf.details).toBeDefined();
  });
});
