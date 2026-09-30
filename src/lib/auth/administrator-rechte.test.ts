/**
 * The system role "Administrator" (2026-09): everything a customer's admin
 * needs — all catalog permissions except platform ones (module "system"),
 * the investor portal (module "portal") and those reserved for the platform
 * operator (unenforcedReason "superadmin-only").
 *
 * The boot-time sync created new permissions but never gave them to the
 * role: in the dev database the administrator had 120 of 188 — incoming
 * invoices, faults, dismantling, CRM were missing and answered 403.
 */

import { describe, expect, it } from "vitest";
import { administratorRechte } from "./administrator-rechte";

const katalog = [
  { name: "parks:read", module: "parks" },
  { name: "faults:update", module: "faults" },
  { name: "crm:read", module: "crm" },
  { name: "system:config", module: "system" },
  { name: "portal:access", module: "portal" },
  { name: "admin:tenants", module: "admin", unenforcedReason: "superadmin-only" as const },
  { name: "admin:settings", module: "admin" },
  { name: "reports:read", module: "reports", unenforcedReason: "ui-only" as const },
];

describe("Rechte des Administrators", () => {
  it("alle Fachmodule, auch neu hinzugekommene", () => {
    expect(administratorRechte(katalog)).toEqual(
      expect.arrayContaining(["parks:read", "faults:update", "crm:read", "admin:settings", "reports:read"]),
    );
  });

  it("nichts von Plattform, Portal oder „nur Superadmin\"", () => {
    const rechte = administratorRechte(katalog);
    expect(rechte).not.toContain("system:config");
    expect(rechte).not.toContain("portal:access");
    expect(rechte).not.toContain("admin:tenants");
  });
});
