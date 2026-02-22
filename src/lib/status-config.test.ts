import { describe, it, expect } from "vitest";
import {
  INVOICE_STATUS,
  CONTRACT_STATUS,
  ENTITY_STATUS,
  VOTE_STATUS,
  DISTRIBUTION_STATUS,
  PAYMENT_STATUS,
  PORTAL_DISTRIBUTION_STATUS,
  getStatusBadge,
} from "./status-config";

// =============================================================================
// INVOICE_STATUS
// =============================================================================

describe("INVOICE_STATUS", () => {
  it("enthaelt alle erwarteten Status-Schluessel", () => {
    expect(Object.keys(INVOICE_STATUS)).toEqual(
      expect.arrayContaining(["DRAFT", "SENT", "PAID", "CANCELLED", "OVERDUE"])
    );
  });

  it("hat korrekte deutsche Labels", () => {
    expect(INVOICE_STATUS.DRAFT.label).toBe("Entwurf");
    expect(INVOICE_STATUS.SENT.label).toBe("Versendet");
    expect(INVOICE_STATUS.PAID.label).toBe("Bezahlt");
    expect(INVOICE_STATUS.CANCELLED.label).toBe("Storniert");
    expect(INVOICE_STATUS.OVERDUE.label).toBe("Ueberfaellig");
  });

  it("hat className fuer jeden Status", () => {
    for (const key of Object.keys(INVOICE_STATUS)) {
      expect(INVOICE_STATUS[key].className).toBeTruthy();
      expect(typeof INVOICE_STATUS[key].className).toBe("string");
    }
  });

  it("verwendet passende Farben fuer Status", () => {
    expect(INVOICE_STATUS.DRAFT.className).toContain("gray");
    expect(INVOICE_STATUS.PAID.className).toContain("green");
    expect(INVOICE_STATUS.CANCELLED.className).toContain("red");
    expect(INVOICE_STATUS.OVERDUE.className).toContain("orange");
    expect(INVOICE_STATUS.SENT.className).toContain("blue");
  });
});

// =============================================================================
// CONTRACT_STATUS
// =============================================================================

describe("CONTRACT_STATUS", () => {
  it("enthaelt alle erwarteten Status-Schluessel", () => {
    expect(Object.keys(CONTRACT_STATUS)).toEqual(
      expect.arrayContaining(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"])
    );
  });

  it("hat korrekte deutsche Labels", () => {
    expect(CONTRACT_STATUS.DRAFT.label).toBe("Entwurf");
    expect(CONTRACT_STATUS.ACTIVE.label).toBe("Aktiv");
    expect(CONTRACT_STATUS.EXPIRING.label).toBe("Laeuft aus");
    expect(CONTRACT_STATUS.EXPIRED.label).toBe("Abgelaufen");
    expect(CONTRACT_STATUS.TERMINATED.label).toBe("Gekuendigt");
  });

  it("verwendet Gruen fuer ACTIVE", () => {
    expect(CONTRACT_STATUS.ACTIVE.className).toContain("green");
  });

  it("verwendet Rot fuer EXPIRED und TERMINATED", () => {
    expect(CONTRACT_STATUS.EXPIRED.className).toContain("red");
    expect(CONTRACT_STATUS.TERMINATED.className).toContain("red");
  });
});

// =============================================================================
// ENTITY_STATUS
// =============================================================================

describe("ENTITY_STATUS", () => {
  it("enthaelt ACTIVE, INACTIVE, ARCHIVED", () => {
    expect(Object.keys(ENTITY_STATUS)).toEqual(
      expect.arrayContaining(["ACTIVE", "INACTIVE", "ARCHIVED"])
    );
  });

  it("hat korrekte deutsche Labels", () => {
    expect(ENTITY_STATUS.ACTIVE.label).toBe("Aktiv");
    expect(ENTITY_STATUS.INACTIVE.label).toBe("Inaktiv");
    expect(ENTITY_STATUS.ARCHIVED.label).toBe("Archiviert");
  });
});

// =============================================================================
// VOTE_STATUS
// =============================================================================

describe("VOTE_STATUS", () => {
  it("enthaelt DRAFT, ACTIVE, CLOSED", () => {
    expect(Object.keys(VOTE_STATUS)).toEqual(
      expect.arrayContaining(["DRAFT", "ACTIVE", "CLOSED"])
    );
  });

  it("hat korrekte deutsche Labels", () => {
    expect(VOTE_STATUS.DRAFT.label).toBe("Entwurf");
    expect(VOTE_STATUS.ACTIVE.label).toBe("Aktiv");
    expect(VOTE_STATUS.CLOSED.label).toBe("Beendet");
  });
});

// =============================================================================
// DISTRIBUTION_STATUS
// =============================================================================

describe("DISTRIBUTION_STATUS", () => {
  it("enthaelt DRAFT, EXECUTED, CANCELLED", () => {
    expect(Object.keys(DISTRIBUTION_STATUS)).toEqual(
      expect.arrayContaining(["DRAFT", "EXECUTED", "CANCELLED"])
    );
  });

  it("hat korrekte deutsche Labels", () => {
    expect(DISTRIBUTION_STATUS.DRAFT.label).toBe("Entwurf");
    expect(DISTRIBUTION_STATUS.EXECUTED.label).toBe("Ausgefuehrt");
    expect(DISTRIBUTION_STATUS.CANCELLED.label).toBe("Storniert");
  });
});

// =============================================================================
// PAYMENT_STATUS (lowercase keys)
// =============================================================================

describe("PAYMENT_STATUS", () => {
  it("verwendet lowercase Keys", () => {
    expect(Object.keys(PAYMENT_STATUS)).toEqual(
      expect.arrayContaining(["pending", "paid", "overdue"])
    );
  });

  it("hat korrekte deutsche Labels", () => {
    expect(PAYMENT_STATUS.pending.label).toBe("Offen");
    expect(PAYMENT_STATUS.paid.label).toBe("Bezahlt");
    expect(PAYMENT_STATUS.overdue.label).toBe("Ueberfaellig");
  });
});

// =============================================================================
// PORTAL_DISTRIBUTION_STATUS
// =============================================================================

describe("PORTAL_DISTRIBUTION_STATUS", () => {
  it("verwendet andere Labels als DISTRIBUTION_STATUS fuer SENT/PAID", () => {
    expect(PORTAL_DISTRIBUTION_STATUS.SENT.label).toBe("Offen");
    expect(PORTAL_DISTRIBUTION_STATUS.PAID.label).toBe("Ausgezahlt");
  });

  it("enthaelt DRAFT, SENT, PAID, CANCELLED", () => {
    expect(Object.keys(PORTAL_DISTRIBUTION_STATUS)).toEqual(
      expect.arrayContaining(["DRAFT", "SENT", "PAID", "CANCELLED"])
    );
  });
});

// =============================================================================
// getStatusBadge
// =============================================================================

describe("getStatusBadge", () => {
  it("gibt korrekten Badge fuer bekannten Status zurueck", () => {
    const badge = getStatusBadge(INVOICE_STATUS, "PAID");
    expect(badge.label).toBe("Bezahlt");
    expect(badge.className).toContain("green");
  });

  it("gibt Fallback-Badge fuer unbekannten Status zurueck", () => {
    const badge = getStatusBadge(INVOICE_STATUS, "UNKNOWN_STATUS");
    expect(badge.label).toBe("UNKNOWN_STATUS");
    expect(badge.className).toContain("gray");
  });

  it("verwendet den Status-String als Label im Fallback", () => {
    const badge = getStatusBadge(CONTRACT_STATUS, "PENDING_REVIEW");
    expect(badge.label).toBe("PENDING_REVIEW");
  });

  it("gibt immer eine className im Fallback zurueck", () => {
    const badge = getStatusBadge(ENTITY_STATUS, "NONEXISTENT");
    expect(badge.className).toBeTruthy();
    expect(typeof badge.className).toBe("string");
  });

  it("funktioniert mit verschiedenen Status-Maps", () => {
    expect(getStatusBadge(VOTE_STATUS, "CLOSED").label).toBe("Beendet");
    expect(getStatusBadge(PAYMENT_STATUS, "paid").label).toBe("Bezahlt");
    expect(getStatusBadge(DISTRIBUTION_STATUS, "EXECUTED").label).toBe("Ausgefuehrt");
  });

  it("gibt Fallback mit Dark-Mode Klassen zurueck", () => {
    const badge = getStatusBadge(INVOICE_STATUS, "NONEXISTENT");
    expect(badge.className).toContain("dark:");
  });
});
