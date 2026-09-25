/**
 * Suchtext aus der Kontaktauswahl als Vorbelegung des Anlegen-Dialogs.
 */

import { describe, expect, it } from "vitest";
import { kontaktVorbelegung } from "./kontakt-vorbelegung";

describe("kontaktVorbelegung", () => {
  it("Firma an der Rechtsform erkannt", () => {
    expect(kontaktVorbelegung("Siedecamp GmbH & Co. KG")).toEqual({ personType: "legal", companyName: "Siedecamp GmbH & Co. KG" });
    expect(kontaktVorbelegung("Bürgerwind eG")).toEqual({ personType: "legal", companyName: "Bürgerwind eG" });
    expect(kontaktVorbelegung("Jagdgenossenschaft Borstel")).toEqual({ personType: "legal", companyName: "Jagdgenossenschaft Borstel" });
  });

  it("Person: letztes Wort ist der Nachname", () => {
    expect(kontaktVorbelegung("Rolf Meyer")).toEqual({ personType: "natural", firstName: "Rolf", lastName: "Meyer" });
    expect(kontaktVorbelegung("Anna Maria Schmidt")).toEqual({ personType: "natural", firstName: "Anna Maria", lastName: "Schmidt" });
  });

  it("ein Wort: Nachname", () => {
    expect(kontaktVorbelegung("Meyer")).toEqual({ personType: "natural", lastName: "Meyer" });
  });

  it("leer: nichts", () => {
    expect(kontaktVorbelegung("  ")).toEqual({});
  });
});
