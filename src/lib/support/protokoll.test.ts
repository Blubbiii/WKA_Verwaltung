/**
 * Central protocol of the platform support (2026-09, phase 2).
 *
 * The customer's protocol showed only what a route logged itself —
 * creating a position template as support left no trace. Now every
 * writing request the support makes in a customer's tenant is recorded,
 * derived from the permission the request needed.
 */

import { describe, expect, it } from "vitest";
import { supportEintrag } from "./protokoll";

describe("Protokolleintrag des Supports", () => {
  it("Anlegen, Ändern, Löschen werden als solche protokolliert", () => {
    expect(supportEintrag("parks:create")).toEqual({ action: "CREATE", recht: "parks:create" });
    expect(supportEintrag("invoices:update")).toEqual({ action: "UPDATE", recht: "invoices:update" });
    expect(supportEintrag("plots:delete")).toEqual({ action: "DELETE", recht: "plots:delete" });
  });

  it("andere schreibende Rechte zählen als Änderung", () => {
    expect(supportEintrag("energy:settlements:finalize")).toEqual({ action: "UPDATE", recht: "energy:settlements:finalize" });
    expect(supportEintrag("roles:assign")).toEqual({ action: "UPDATE", recht: "roles:assign" });
  });

  it("Lesen, Export und Download nicht", () => {
    expect(supportEintrag("parks:read")).toBeNull();
    expect(supportEintrag("invoices:export")).toBeNull();
    expect(supportEintrag("documents:download")).toBeNull();
  });

  it("bei mehreren Rechten zählt das stärkste schreibende", () => {
    expect(supportEintrag(["parks:read", "parks:update"])).toEqual({ action: "UPDATE", recht: "parks:update" });
    expect(supportEintrag(["parks:update", "parks:delete"])).toEqual({ action: "DELETE", recht: "parks:delete" });
    expect(supportEintrag(["parks:read", "funds:read"])).toBeNull();
  });
});
