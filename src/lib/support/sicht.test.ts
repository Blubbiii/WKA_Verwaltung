/**
 * What the platform operator sees of a tenant (2026-09, support phase 2).
 *
 * Without the customer's consent: figures only. Details — names, e-mail
 * addresses, protocol contents, job payloads — of the tenant the operator
 * works in (own tenant, or a customer entered with support access) and of
 * tenants with an active support access.
 */

import { describe, expect, it } from "vitest";
import { superadminSiehtMandant } from "./sicht";

const lage = { aktiverMandant: "system", mitFreigabe: new Set(["kunde-a"]) };

describe("Sicht des Superadmins", () => {
  it("der Mandant, in dem er arbeitet", () => {
    expect(superadminSiehtMandant("system", lage)).toBe(true);
  });

  it("ein Kunde mit aktiver Freigabe", () => {
    expect(superadminSiehtMandant("kunde-a", lage)).toBe(true);
  });

  it("kein Kunde ohne Freigabe", () => {
    expect(superadminSiehtMandant("kunde-b", lage)).toBe(false);
  });

  it("nach dem Betreten eines Kunden: dieser Kunde", () => {
    expect(superadminSiehtMandant("kunde-a", { aktiverMandant: "kunde-a", mitFreigabe: new Set() })).toBe(true);
  });
});
