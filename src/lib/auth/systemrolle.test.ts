/**
 * Mandanten-Assistent: gewählte Rolle -> Systemrolle.
 *
 * Der Assistent sendete die Rolle ("ADMIN") an /api/admin/users, das sie
 * verwarf — neue Benutzer hatten keine Rechte. Vergeben wird über
 * /api/admin/users/[id]/roles, und das braucht die ID der Systemrolle. Die
 * Systemrollen heißen deutsch ("Administrator", "Nur Lesen"); eindeutig ist
 * ihre Stufe.
 */

import { describe, expect, it } from "vitest";
import { systemrolleFuer } from "./systemrolle";

const rollen = [
  { id: "r100", name: "Superadmin", isSystem: true, hierarchy: 100 },
  { id: "r80", name: "Administrator", isSystem: true, hierarchy: 80 },
  { id: "r60", name: "Manager", isSystem: true, hierarchy: 60 },
  { id: "r40", name: "Nur Lesen", isSystem: true, hierarchy: 40 },
  { id: "eigen80", name: "Eigene Admin-Rolle", isSystem: false, hierarchy: 80 },
];

describe("systemrolleFuer", () => {
  it("ordnet über die Stufe zu, nicht über den Namen", () => {
    expect(systemrolleFuer(rollen, "ADMIN")).toBe("r80");
    expect(systemrolleFuer(rollen, "MANAGER")).toBe("r60");
    expect(systemrolleFuer(rollen, "VIEWER")).toBe("r40");
  });

  it("nimmt nur Systemrollen, keine gleich hohen eigenen", () => {
    expect(systemrolleFuer(rollen.filter((r) => r.id !== "r80"), "ADMIN")).toBeNull();
  });
});
