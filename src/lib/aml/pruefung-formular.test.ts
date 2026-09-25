import { describe, expect, it } from "vitest";
import { leeresAmlFormular, amlFormularFehler, amlFormularZuPayload } from "./pruefung-formular";

const PERSON = "11111111-1111-4111-8111-111111111111";
const ZEICHNUNG = "22222222-2222-4222-8222-222222222222";

describe("Legitimationsprüfung: Formular → API", () => {
  it("leere Textfelder gehen als null, nicht als leerer String", () => {
    const payload = amlFormularZuPayload(leeresAmlFormular(), PERSON);
    expect(payload).toMatchObject({
      personId: PERSON,
      subscriptionId: null,
      status: "PENDING",
      method: "IN_PERSON",
      identifiedAt: null,
      documentType: null,
      documentNumber: null,
      documentValidUntil: null,
      nextReviewAt: null,
      notes: null,
      isPep: false,
      beneficialOwnerVerified: false,
      riskLevel: "LOW",
    });
  });

  it("Werte werden getrimmt und die Zeichnung mitgegeben", () => {
    const payload = amlFormularZuPayload(
      {
        ...leeresAmlFormular(),
        status: "VERIFIED",
        identifiedAt: "2026-09-01",
        documentType: "  Personalausweis ",
        documentNumber: " L01X00T47 ",
      },
      PERSON,
      ZEICHNUNG,
    );
    expect(payload.subscriptionId).toBe(ZEICHNUNG);
    expect(payload.identifiedAt).toBe("2026-09-01");
    expect(payload.documentType).toBe("Personalausweis");
    expect(payload.documentNumber).toBe("L01X00T47");
  });

  it("abgeschlossen ohne Identifizierungsdatum ist ein Fehler (§ 8 Abs. 1 GwG)", () => {
    expect(amlFormularFehler({ ...leeresAmlFormular(), status: "VERIFIED" })).toBe(
      "identifiedAtRequired",
    );
    expect(
      amlFormularFehler({ ...leeresAmlFormular(), status: "VERIFIED", identifiedAt: "2026-09-01" }),
    ).toBeNull();
    expect(amlFormularFehler(leeresAmlFormular())).toBeNull();
  });
});
