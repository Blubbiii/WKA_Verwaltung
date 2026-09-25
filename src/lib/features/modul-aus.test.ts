/**
 * Ausgeschaltetes Modul: wer kann es einschalten?
 *
 * Die Seiten sagten jedem "Bitte wenden Sie sich an Ihren Administrator" —
 * auch dem Administrator. Freischalten kann nur der Superadmin
 * (/api/admin/feature-flags prüft requireSuperadmin).
 */

import { describe, expect, it } from "vitest";
import { modulAusVariante, MODUL_AKTIVIEREN_HREF } from "./modul-aus";

describe("modulAusVariante", () => {
  it("Superadmin bekommt den Weg zum Einschalten", () => {
    expect(modulAusVariante(100)).toBe("aktivieren");
  });

  it("Mandanten-Admin wird an den Systembetreiber verwiesen, nicht an sich selbst", () => {
    expect(modulAusVariante(80)).toBe("betreiberFragen");
  });

  it("alle anderen an ihren Administrator", () => {
    expect(modulAusVariante(60)).toBe("adminFragen");
    expect(modulAusVariante(40)).toBe("adminFragen");
    expect(modulAusVariante(undefined)).toBe("adminFragen");
  });

  it("der Link führt auf die Feature-Schalter", () => {
    expect(MODUL_AKTIVIEREN_HREF).toBe("/admin/system-admin?tab=flags&subtab=feature-flags");
  });
});
