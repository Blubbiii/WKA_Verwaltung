/**
 * Support access to a customer's data (2026-09).
 *
 * The platform operator sees no customer data unless the customer granted
 * a time-limited access (FREIGABE) or the operator opened an emergency
 * access with a reason (NOTFALL, at most one hour). Everyone else reaches
 * a tenant only through an active membership.
 */

import { describe, expect, it } from "vitest";
import { gueltigBisFuer, istAktiv, zugangErlaubt, NOTFALL_DAUER_MS } from "./regeln";

const JETZT = new Date("2026-09-28T10:00:00Z");

describe("Laufzeit einer Freigabe", () => {
  it("1 Stunde, 1 Tag, 7 Tage ab jetzt", () => {
    expect(gueltigBisFuer("1h", JETZT).toISOString()).toBe("2026-09-28T11:00:00.000Z");
    expect(gueltigBisFuer("1d", JETZT).toISOString()).toBe("2026-09-29T10:00:00.000Z");
    expect(gueltigBisFuer("7d", JETZT).toISOString()).toBe("2026-10-05T10:00:00.000Z");
  });

  it("ein Notfallzugang dauert höchstens eine Stunde", () => {
    expect(NOTFALL_DAUER_MS).toBe(60 * 60 * 1000);
  });
});

describe("aktiv", () => {
  it("bis zum Ablauf und solange niemand beendet hat", () => {
    expect(istAktiv({ gueltigBis: new Date("2026-09-28T11:00:00Z"), beendetAm: null }, JETZT)).toBe(true);
  });

  it("abgelaufen ist nicht mehr aktiv", () => {
    expect(istAktiv({ gueltigBis: new Date("2026-09-28T09:59:59Z"), beendetAm: null }, JETZT)).toBe(false);
  });

  it("vorzeitig beendet ist nicht mehr aktiv", () => {
    expect(
      istAktiv({ gueltigBis: new Date("2026-09-29T00:00:00Z"), beendetAm: new Date("2026-09-28T09:30:00Z") }, JETZT),
    ).toBe(false);
  });
});

describe("Zugang zu einem fremden Mandanten", () => {
  it("mit aktiver Mitgliedschaft", () => {
    expect(zugangErlaubt({ mitglied: true, superadmin: false, supportAktiv: false })).toBe(true);
  });

  it("der Superadmin nur mit aktivem Support-Zugriff", () => {
    expect(zugangErlaubt({ mitglied: false, superadmin: true, supportAktiv: true })).toBe(true);
    expect(zugangErlaubt({ mitglied: false, superadmin: true, supportAktiv: false })).toBe(false);
  });

  it("ein Support-Zugriff öffnet nichts für Nicht-Superadmins", () => {
    expect(zugangErlaubt({ mitglied: false, superadmin: false, supportAktiv: true })).toBe(false);
  });
});
