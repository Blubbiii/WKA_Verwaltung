/**
 * A1 (Audit 2026-07): Störungsvorgang.
 *
 * Die Rechenregeln stehen in lost-energy.test.ts. Hier geht es um die
 * Verdrahtung und um die Entscheidungen, bei denen ein Vorgang still falsche
 * Zahlen produzieren würde.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CAUSE_CATEGORIES, CLAIM_STATUSES, CLAIMABLE_CAUSES } from "./constants";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model FaultCase {"));
  const body = model.slice(0, model.indexOf("\n}"));

  it("der Vorgang haengt an einer Anlage", () => {
    expect(body).toContain("turbineId   String");
  });

  it("die Vorgangsnummer ist je Mandant eindeutig", () => {
    expect(body).toContain("@@unique([tenantId, caseNumber])");
  });

  it("der Satz wird MITGESPEICHERT, nicht nachgeschlagen", () => {
    // Sonst aendert sich der bezifferte Schaden rueckwirkend, sobald jemand
    // einen Monatssatz korrigiert.
    expect(body).toContain("ratePerKwh");
    expect(body).toContain("rateSource");
    expect(body).toContain("lostRevenueEur");
  });

  it("das Verfahren steht am Datensatz", () => {
    // Eine Forderung ist nur so viel wert wie ihre Herleitung.
    expect(body).toContain("lostEnergyMethod");
    expect(body).toContain("lostEnergyBasis");
    expect(body).toContain("lostEnergyComputedAt");
  });

  it("der Ausfall ist nullable — nicht ermittelt ist nicht null kWh", () => {
    expect(body).toMatch(/lostEnergyKwh\s+Decimal\?/);
  });

  it("Verjaehrung und Wiedervorlage sind indiziert", () => {
    // Sie tragen die beiden Listen, die taeglich gebraucht werden.
    expect(body).toContain("@@index([tenantId, followUpAt])");
    expect(body).toContain("@@index([tenantId, claimDeadline])");
  });

  it("UNKNOWN ist ein eigener Wert, kein null", () => {
    // "noch nicht geprueft" ist eine Aussage, "kein Wert" waere keine.
    expect(body).toContain("causeCategory  FaultCauseCategory @default(UNKNOWN)");
  });

  it("die SCADA-Zuordnung haelt eine Momentaufnahme", () => {
    // scada_state_events ist eine Hypertable, die beschnitten wird. Der
    // Vorgang muss den Rohdatenstand ueberleben.
    const link = schema.slice(schema.indexOf("model FaultCaseScadaEvent {"));
    const linkBody = link.slice(0, link.indexOf("\n}"));
    expect(linkBody).toContain("eventTimestamp DateTime");
    expect(linkBody).toContain("state          Int");
    // Kein FK auf die Hypertable.
    expect(codeOnly(linkBody)).not.toContain("ScadaStateEvent @relation");
  });

  it("die Migration verzichtet aus demselben Grund auf den FK", () => {
    const migration = read("prisma/migrations/manual/fault_cases.sql");
    expect(migration).toContain("BEWUSST OHNE FK auf scada_state_events");
  });
});

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

describe("Bewertungsdienst", () => {
  const service = src("lib/faults/valuation-service.ts");

  it("mitgestoerte Referenzanlagen werden ausgeschlossen", () => {
    // Naehme man sie mit, fiele die Erwartung zu niedrig aus und der Ausfall
    // wuerde zu KLEIN ausgewiesen — der Fehler ginge immer zu Lasten des
    // Anspruchstellers.
    expect(service).toContain("const overlappingCases = await prisma.faultCase.findMany");
    expect(service).toContain("id: { notIn: [...excluded] }");
  });

  it("die Mandantenbindung laeuft ueber den Park", () => {
    // Turbine traegt keine tenantId — ohne den Umweg liesse sich eine fremde
    // Anlage bewerten.
    expect(service).toContain("park: { tenantId }");
    expect(codeOnly(service)).not.toMatch(/prisma\.turbine\.find\w+\(\{\s*where: \{ id: turbineId, tenantId \}/);
  });

  it("die Zeitreihen kommen in EINER Abfrage", () => {
    // Sonst eine Abfrage je Referenzanlage.
    expect(service).toContain("turbineId: { in: ids }");
  });

  it("die Zahl der Referenzen ist begrenzt", () => {
    expect(service).toContain("const MAX_REFERENCES");
    expect(service).toContain("take: MAX_REFERENCES");
  });

  it("der Satz kommt aus dem Monat des STOERUNGSBEGINNS", () => {
    // Beim Ende bekaeme eine ueber den Monatswechsel laufende Stoerung den
    // Satz des Folgemonats.
    expect(service).toContain("findRate(tenantId, startAt)");
  });
});

// ---------------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------------

describe("Bewertungsroute", () => {
  const route = src("app/api/faults/[id]/valuate/route.ts");

  it("ohne Stoerungsende wird nicht bewertet", () => {
    // Eine laufende Stoerung "bis jetzt" zu bewerten ergaebe eine Zahl, die
    // beim naechsten Klick anders ausfaellt — und trotzdem festgeschrieben
    // im Datensatz stuende.
    expect(route).toContain("if (!faultCase.endAt)");
  });

  it("ohne berechenbares Ergebnis wird NICHTS geschrieben", () => {
    // Ein Vorgang ohne Bewertung ist ehrlicher als einer mit erfundener.
    expect(route).toMatch(/if \(outcome\.energy\.method === null\)[\s\S]{0,400}computed: false/);
  });

  it("der Grund geht an die Oberflaeche zurueck", () => {
    expect(route).toContain("reason: outcome.energy.reason");
  });

  it("ohne Satz bleibt der Eurobetrag leer statt 0", () => {
    // Ein Ausfall in kWh ohne Bewertung ist ein brauchbarer Zwischenstand,
    // ein Schaden von 0 EUR waere es nicht.
    expect(route).toContain("...(outcome.ratePerKwh !== null && {");
  });

  it("Menge, Herleitung, Satz und Betrag werden gemeinsam geschrieben", () => {
    const update = route.slice(route.indexOf("prisma.faultCase.update"));
    expect(update).toContain("lostEnergyKwh:");
    expect(update).toContain("lostEnergyBasis:");
    expect(update).toContain("lostEnergyComputedAt:");
  });

  it("die Hinweise gehen an den Bearbeiter, nicht nur ins Json-Feld", () => {
    expect(route).toContain("warnings: energy.warnings");
  });
});

describe("Listen- und Detailroute", () => {
  const list = src("app/api/faults/route.ts");
  const detail = src("app/api/faults/[id]/route.ts");

  it("Suche und Faelligkeitsfilter ueberschreiben einander nicht", () => {
    // Beide brauchen ein OR. Nebeneinander im selben Objekt gewinnt das
    // zweite — die Suche waere dann wirkungslos, ohne dass es auffaellt.
    expect(list).toContain("AND: [");
    expect(list).toContain("Deshalb ueber AND kombiniert");
  });

  it("die Anlage wird gegen den Mandanten geprueft", () => {
    expect(list).toContain("park: { tenantId: check.tenantId! }");
  });

  it("ein Ende vor dem Beginn wird abgewiesen", () => {
    expect(list).toContain("Ende liegt vor dem Beginn");
    expect(detail).toContain("Ende liegt vor dem Beginn");
  });

  it("eine Nummernkollision wird wiederholt statt zu scheitern", () => {
    expect(list).toContain("isCaseNumberConflict(error)");
    expect(list).toContain("CASE_NUMBER_RETRIES");
  });

  it("Handeingabe setzt das Verfahren auf MANUAL", () => {
    // Sonst behauptet der Datensatz weiterhin, die Zahl kaeme aus den
    // Referenzanlagen, und die hinterlegte Herleitung passt nicht dazu.
    expect(detail).toContain('lostEnergyMethod: data.lostEnergyKwh === null ? null : "MANUAL"');
    expect(detail).toContain("lostEnergyBasis: Prisma.DbNull");
  });

  it("der Eurobetrag wird bei Mengen- oder Satzaenderung neu gerechnet", () => {
    // Sonst stuende ein Betrag da, der zu den Feldern daneben nicht passt.
    expect(detail).toContain("const recomputeRevenue =");
    expect(detail).toContain("...(recomputeRevenue && { lostRevenueEur })");
  });

  it("der Erledigungszeitpunkt wird nur einmal gesetzt", () => {
    expect(detail).toContain("const becomesResolved =");
  });

  it("ein geltend gemachter Anspruch schuetzt vor dem Loeschen", () => {
    // Er ist ein laufender Vorgang gegenueber Dritten.
    expect(detail).toContain('["ASSERTED", "ACCEPTED", "SETTLED"].includes(existing.claimStatus)');
  });
});

// ---------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------

describe("Rechte", () => {
  it("jede Route prueft ein eigenes Recht", () => {
    const list = src("app/api/faults/route.ts");
    const detail = src("app/api/faults/[id]/route.ts");
    const valuate = src("app/api/faults/[id]/valuate/route.ts");

    expect(list).toContain("PERMISSIONS.FAULTS_READ");
    expect(list).toContain("PERMISSIONS.FAULTS_CREATE");
    expect(detail).toContain("PERMISSIONS.FAULTS_UPDATE");
    expect(detail).toContain("PERMISSIONS.FAULTS_DELETE");
    expect(valuate).toContain("PERMISSIONS.FAULTS_VALUATE");
  });

  it("die Rechte stehen im Katalog", () => {
    const catalog = src("lib/auth/permissions.catalog.ts");
    for (const name of ["faults:read", "faults:create", "faults:update", "faults:delete", "faults:valuate"]) {
      expect(catalog, name).toContain(`name: "${name}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Wertelisten
// ---------------------------------------------------------------------------

describe("Wertelisten", () => {
  it("Client und Server teilen sie sich", () => {
    const listPage = src("app/(dashboard)/faults/page.tsx");
    expect(listPage).toContain('from "@/lib/faults/constants"');
  });

  it("Wetter und Eigenverschulden begruenden keinen Anspruch", () => {
    // Dort einen Anspruch anzumahnen waere Laerm ohne Nutzen.
    expect(CLAIMABLE_CAUSES).not.toContain("WEATHER");
    expect(CLAIMABLE_CAUSES).not.toContain("OWN_FAULT");
    expect(CLAIMABLE_CAUSES).toContain("MANUFACTURER");
  });

  it("es gibt einen Zustand fuer den versaeumten Anspruch", () => {
    // Sonst bliebe ein verjaehrter Anspruch still auf ASSERTED stehen.
    expect(CLAIM_STATUSES).toContain("TIME_BARRED");
  });

  it("die Wertelisten decken sich mit dem Schema", () => {
    const schema = read("prisma/schema.prisma");
    const enumBlock = schema.slice(schema.indexOf("enum FaultCauseCategory {"));
    const values = enumBlock.slice(0, enumBlock.indexOf("\n}"));
    for (const cause of CAUSE_CATEGORIES) {
      expect(values, cause).toContain(cause);
    }
  });
});

// ---------------------------------------------------------------------------
// Oberfläche
// ---------------------------------------------------------------------------

describe("Oberflaeche", () => {
  const listPage = src("app/(dashboard)/faults/page.tsx");
  const detailPage = src("app/(dashboard)/faults/[id]/page.tsx");

  it("die Faelligkeitsliste ist ein sichtbarer Schalter", () => {
    expect(listPage).toContain('t("filterDueOnly")');
  });

  it("unbewertet wird nicht als 0 dargestellt", () => {
    // "Nicht bewertet" ist etwas anderes als "kein Ausfall".
    expect(listPage).toContain('t("notValuated")');
    expect(detailPage).toContain('t("notValuated")');
  });

  it("die Herleitung steht sichtbar am Vorgang", () => {
    expect(detailPage).toContain('t("detail.basisLine"');
    expect(detailPage).toContain("basis.warnings?.map");
  });

  it("die Verjaehrungsfrist wird NICHT berechnet", () => {
    // Sie haengt vom Vertragstyp ab; eine automatisch gesetzte Frist waere
    // eine Rechtsauskunft im Code.
    expect(detailPage).toContain('t("detail.deadlineHint")');
    const de = JSON.parse(read(join("src", "messages", "de.json")));
    expect(de.faults.detail.deadlineHint).toContain("Wird nicht berechnet");
  });

  it("eine abgelaufene Frist wird sichtbar gemacht", () => {
    expect(detailPage).toContain("deadlinePassed");
  });

  it("die Berechnung ist ohne Stoerungsende gesperrt", () => {
    expect(detailPage).toContain("disabled={valuating || !data.endAt}");
  });

  it("das Anlegeformular schuetzt vor Datenverlust", () => {
    const newPage = src("app/(dashboard)/faults/new/page.tsx");
    expect(newPage).toContain("useUnsavedChanges(");
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("Uebersetzungen", () => {
  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
  }

  for (const locale of ["de", "en", "de-personal"] as const) {
    it(`${locale}: jede Ursache und jeder Anspruchsstand hat einen Text`, () => {
      const messages = JSON.parse(read(join("src", "messages", `${locale}.json`)));
      for (const cause of CAUSE_CATEGORIES) {
        expect(get(messages, `faults.cause.${cause}`), cause).toBeTypeOf("string");
      }
      for (const claim of CLAIM_STATUSES) {
        expect(get(messages, `faults.claim.${claim}`), claim).toBeTypeOf("string");
      }
    });
  }
});
