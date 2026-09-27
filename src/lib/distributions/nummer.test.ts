/**
 * Distribution numbers AS-<year>-<nnn>, per tenant.
 *
 * The number was "count + 1". Drafts can be deleted — with 001, 002, 003
 * and 002 deleted, "count + 1" gave 003 again and the create failed. The
 * next number follows the highest one given, gaps stay gaps.
 */

import { describe, expect, it } from "vitest";
import { naechsteAusschuettungsnummer } from "./nummer";

describe("Ausschüttungsnummer", () => {
  it("die erste im Jahr ist 001", () => {
    expect(naechsteAusschuettungsnummer(2026, [])).toBe("AS-2026-001");
  });

  it("folgt der höchsten vergebenen Nummer", () => {
    expect(naechsteAusschuettungsnummer(2026, ["AS-2026-001", "AS-2026-002"])).toBe("AS-2026-003");
  });

  it("nach einem gelöschten Entwurf keine doppelte Nummer", () => {
    expect(naechsteAusschuettungsnummer(2026, ["AS-2026-001", "AS-2026-003"])).toBe("AS-2026-004");
  });

  it("zählt über 999 hinaus weiter", () => {
    expect(naechsteAusschuettungsnummer(2026, ["AS-2026-999"])).toBe("AS-2026-1000");
  });

  it("fremde Formate und andere Jahre zählen nicht", () => {
    expect(naechsteAusschuettungsnummer(2026, ["AS-2025-007", "AS-2026-abc", "XY-2026-050"])).toBe("AS-2026-001");
  });
});
