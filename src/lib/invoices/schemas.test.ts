/**
 * Was das Anlegen leer lassen darf, darf auch das Bearbeiten leer lassen.
 *
 * Ein Entwurf ohne Adresse ließ sich anlegen, aber nie mehr speichern: die
 * Bearbeiten-Seite schickt ein leeres Feld als null, das Bearbeiten-Schema
 * kannte für recipientAddress (und drei weitere Felder) kein null. Der Nutzer
 * sah nur "Validierungsfehler".
 */

import { describe, expect, it } from "vitest";
import { invoiceCreateSchema, invoiceUpdateSchema } from "./schemas";

describe("Rechnungs-Schemas", () => {
  it("jedes Feld, das beim Anlegen null sein darf, darf es auch beim Bearbeiten", () => {
    const anlegen = invoiceCreateSchema.shape;
    const bearbeiten = invoiceUpdateSchema.shape;
    const abweichend = Object.keys(bearbeiten).filter(
      (feld) =>
        feld in anlegen &&
        anlegen[feld as keyof typeof anlegen].safeParse(null).success &&
        !bearbeiten[feld as keyof typeof bearbeiten].safeParse(null).success,
    );
    expect(abweichend).toEqual([]);
  });

  it("nimmt einen Entwurf ohne Adresse beim Speichern an", () => {
    const ergebnis = invoiceUpdateSchema.safeParse({ recipientName: "Muster GmbH", recipientAddress: null });
    expect(ergebnis.success).toBe(true);
  });
});
