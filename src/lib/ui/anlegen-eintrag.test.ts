/**
 * "Aus der Auswahl anlegen": der letzte Eintrag jeder Auswahlliste.
 *
 * Wer beim Vertrag die Gesellschaft nicht fand, musste den Assistenten
 * verlassen, sie anlegen und von vorn anfangen. Jetzt steht unten
 * "+ Neue Gesellschaft anlegen" — mit dem Suchtext als Vorschlag.
 */

import { describe, expect, it } from "vitest";
import { anlegenEintrag } from "./anlegen-eintrag";

const gesellschaft = { neu: "Neue Gesellschaft anlegen", mitName: "„{name}“ als neue Gesellschaft anlegen" };

describe("anlegenEintrag", () => {
  it("ohne Suchtext: allgemeiner Eintrag, nichts vorbelegt", () => {
    expect(anlegenEintrag("", gesellschaft, false)).toEqual({ text: "Neue Gesellschaft anlegen", vorbelegung: "" });
  });

  it("Suchtext ohne Treffer: wird Vorschlag und Vorbelegung", () => {
    expect(anlegenEintrag("  Siedecamp ", gesellschaft, false)).toEqual({
      text: "„Siedecamp“ als neue Gesellschaft anlegen",
      vorbelegung: "Siedecamp",
    });
  });

  it("Suchtext mit Treffern: kein Namensvorschlag, man sucht ja etwas Vorhandenes", () => {
    expect(anlegenEintrag("Sied", gesellschaft, true)).toEqual({ text: "Neue Gesellschaft anlegen", vorbelegung: "Sied" });
  });
});
