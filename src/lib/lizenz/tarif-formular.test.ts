import { describe, expect, it } from "vitest";
import { formularAusTarif, leeresTarifFormular, tarifAusFormular } from "./tarif-formular";
import { tarifSchema } from "./tarif-schema";

describe("Tarif-Formular → API", () => {
  it("leere Grenzen heißen unbegrenzt, Leistungen sind eine pro Zeile", () => {
    const eingabe = tarifAusFormular({
      ...leeresTarifFormular(),
      key: "m",
      name: "M",
      preisMonatEur: "249,50",
      maxFirmen: "3",
      maxWea: "10",
      maxBenutzer: "",
      leistungen: "Pachtabrechnung\n\n  SCADA-Import  \nGesellschafterportal",
    });
    expect(eingabe).toMatchObject({
      key: "m",
      name: "M",
      preisMonatEur: 249.5,
      maxFirmen: 3,
      maxWea: 10,
      maxBenutzer: null,
      maxUmspannwerke: null,
      leistungen: ["Pachtabrechnung", "SCADA-Import", "Gesellschafterportal"],
    });
    // What the form produces is what the route accepts.
    expect(tarifSchema.safeParse(eingabe).success).toBe(true);
  });

  it("ohne Preis bleibt der Preis offen („auf Anfrage“)", () => {
    expect(tarifAusFormular({ ...leeresTarifFormular(), key: "xl", name: "XL" }).preisMonatEur).toBeNull();
  });

  it("hin und zurück ändert nichts", () => {
    const tarif = {
      key: "s",
      name: "S",
      beschreibung: "Für den Einstieg",
      preisMonatEur: "99.00",
      preisHinweis: "zzgl. MwSt.",
      maxFirmen: 1,
      maxUmspannwerke: 0,
      maxWea: 3,
      maxBenutzer: 2,
      maxSpeicherMb: null,
      leistungen: ["Pachtabrechnung"],
      hervorgehoben: false,
      sichtbar: true,
      sortierung: 1,
    };
    expect(tarifAusFormular(formularAusTarif(tarif))).toEqual({ ...tarif, preisMonatEur: 99 });
  });
});
