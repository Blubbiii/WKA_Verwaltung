/**
 * Freigaben zu Funktionen, die es nicht mehr gibt.
 *
 * Buchungen festschreiben/stornieren und der SEPA-Zahllauf sind mit der
 * Buchhaltung entfallen. Die Aktionen bleiben im Datenbank-Enum stehen: Das
 * Deployment synchronisiert das Schema per `prisma db push`, und das scheitert,
 * sobald auch nur eine alte Anfrage einen entfernten Wert trägt — dann startet
 * der Container nicht. Solche Anfragen können also noch auftauchen.
 *
 * Wer eine davon freigibt, soll erfahren, warum nichts passiert. Und es darf
 * nichts passieren: Bis September 2026 setzte die SEPA-Freigabe weiter einen
 * Zahllauf auf „freigegeben", den niemand mehr ausführen konnte.
 */

import { describe, expect, it, vi } from "vitest";

const sepaUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sepaPaymentBatch: { findFirst: vi.fn(), update: (...a: unknown[]) => sepaUpdate(...a) },
  },
}));

import { executeApprovedAction } from "./executors";
import type { ApprovalRequest } from "@prisma/client";

function anfrage(action: string): ApprovalRequest {
  return {
    id: "req-1",
    tenantId: "t1",
    action,
    entityId: "e1",
  } as unknown as ApprovalRequest;
}

describe("Freigaben entfallener Funktionen", () => {
  it.each(["SEPA_RUN", "JOURNAL_POST", "JOURNAL_REVERSE"])(
    "%s wird nicht ausgeführt und sagt, warum",
    async (action) => {
      const ergebnis = await executeApprovedAction(anfrage(action), "u1");

      expect(ergebnis.success).toBe(false);
      expect(ergebnis.error, "Die Meldung muss den Grund nennen").toMatch(/entfallen/);
      expect(ergebnis.error, "Die Meldung muss sagen, was stattdessen zu tun ist").toMatch(
        /ablehnen/i,
      );
    },
  );

  it("die SEPA-Freigabe schreibt nichts mehr", async () => {
    await executeApprovedAction(anfrage("SEPA_RUN"), "u1");
    expect(sepaUpdate).not.toHaveBeenCalled();
  });
});
