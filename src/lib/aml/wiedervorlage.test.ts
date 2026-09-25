import { describe, expect, it } from "vitest";
import { neuesteJePerson } from "./wiedervorlage";

describe("GwG-Wiedervorlage: nur die neueste Prüfung je Person zählt", () => {
  it("eine ältere, abgelaufene Prüfung verschwindet, sobald eine neuere vorliegt", () => {
    const pruefungen = [
      { id: "alt", personId: "p1", createdAt: "2020-01-10T00:00:00.000Z" },
      { id: "neu", personId: "p1", createdAt: "2026-03-01T00:00:00.000Z" },
      { id: "einzig", personId: "p2", createdAt: "2024-05-05T00:00:00.000Z" },
    ];
    expect(neuesteJePerson(pruefungen).map((p) => p.id).sort()).toEqual(["einzig", "neu"]);
  });

  it("die Reihenfolge der Eingabe spielt keine Rolle, Date und String gehen beide", () => {
    const pruefungen = [
      { id: "neu", personId: "p1", createdAt: new Date("2026-03-01") },
      { id: "alt", personId: "p1", createdAt: new Date("2020-01-10") },
    ];
    expect(neuesteJePerson(pruefungen).map((p) => p.id)).toEqual(["neu"]);
  });
});
