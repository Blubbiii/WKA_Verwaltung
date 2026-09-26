/**
 * References in the operational records of the management service
 * (tasks, defects, inspections, claims).
 *
 * The routes took parkId, turbineId and assignedToId unchecked and answered
 * with the park's and the user's name — any id revealed a foreign name.
 * Allowed: the tenant's own park, or a park of a client tenant the tenant
 * manages (an active ParkStakeholder entry — the same rule as the park
 * picker, management-billing/available-parks).
 */

import { describe, expect, it } from "vitest";
import { verweisFehler, type Befund } from "./verweise";

const ICH = "mandant-dienstleister";
const KUNDE = "mandant-kunde";
const FREMD = "mandant-fremd";

const leer: Befund = { eigene: {} };

describe("Verweise der Betriebsführung", () => {
  it("ohne Verweise ist nichts zu prüfen", () => {
    expect(verweisFehler(ICH, {}, leer)).toBeNull();
    expect(verweisFehler(ICH, { parkId: null, turbineId: "" }, leer)).toBeNull();
  });

  describe("Park", () => {
    it("der eigene Park ist erlaubt", () => {
      const befund: Befund = { ...leer, park: { mandant: ICH, betreut: false } };
      expect(verweisFehler(ICH, { parkId: "p1" }, befund)).toBeNull();
    });

    it("der Park eines betreuten Kunden ist erlaubt", () => {
      const befund: Befund = { ...leer, park: { mandant: KUNDE, betreut: true } };
      expect(verweisFehler(ICH, { parkId: "p1" }, befund)).toBeNull();
    });

    it("ein fremder Park wird abgewiesen", () => {
      const befund: Befund = { ...leer, park: { mandant: FREMD, betreut: false } };
      expect(verweisFehler(ICH, { parkId: "p1" }, befund)).toBe("parkId");
    });

    it("ein unbekannter Park wird abgewiesen", () => {
      expect(verweisFehler(ICH, { parkId: "gibt-es-nicht" }, { ...leer, park: null })).toBe("parkId");
    });
  });

  describe("Anlage", () => {
    it("eine Anlage im eigenen oder betreuten Park ist erlaubt", () => {
      const eigen: Befund = { ...leer, anlage: { parkId: "p1", mandant: ICH, betreut: false } };
      const kunde: Befund = { ...leer, anlage: { parkId: "p2", mandant: KUNDE, betreut: true } };
      expect(verweisFehler(ICH, { turbineId: "t1" }, eigen)).toBeNull();
      expect(verweisFehler(ICH, { turbineId: "t2" }, kunde)).toBeNull();
    });

    it("eine fremde oder unbekannte Anlage wird abgewiesen", () => {
      const fremd: Befund = { ...leer, anlage: { parkId: "p9", mandant: FREMD, betreut: false } };
      expect(verweisFehler(ICH, { turbineId: "t9" }, fremd)).toBe("turbineId");
      expect(verweisFehler(ICH, { turbineId: "t9" }, { ...leer, anlage: null })).toBe("turbineId");
    });

    it("die Anlage muss im angegebenen Park stehen", () => {
      const befund: Befund = {
        ...leer,
        park: { mandant: ICH, betreut: false },
        anlage: { parkId: "p-anderer", mandant: ICH, betreut: false },
      };
      expect(verweisFehler(ICH, { parkId: "p1", turbineId: "t1" }, befund)).toBe("turbineId");
    });
  });

  it("ein Serviceeinsatz folgt der Regel seiner Anlage", () => {
    const erlaubt: Befund = { ...leer, einsatzAnlage: { parkId: "p2", mandant: KUNDE, betreut: true } };
    const fremd: Befund = { ...leer, einsatzAnlage: { parkId: "p9", mandant: FREMD, betreut: false } };
    expect(verweisFehler(ICH, { serviceEventId: "s1" }, erlaubt)).toBeNull();
    expect(verweisFehler(ICH, { serviceEventId: "s9" }, fremd)).toBe("serviceEventId");
  });

  describe("Bearbeiter", () => {
    it("ein Benutzer des eigenen Mandanten ist erlaubt — auch über eine Mitgliedschaft", () => {
      const befund: Befund = { ...leer, bearbeiter: { mandanten: [FREMD, ICH] } };
      expect(verweisFehler(ICH, { assignedToId: "u1" }, befund)).toBeNull();
    });

    it("ein Benutzer eines Kunden oder fremden Mandanten wird abgewiesen", () => {
      // Tasks are the service provider's work — the client's staff are not assignees.
      const befund: Befund = { ...leer, bearbeiter: { mandanten: [KUNDE] } };
      expect(verweisFehler(ICH, { assignedToId: "u1" }, befund)).toBe("assignedToId");
      expect(verweisFehler(ICH, { assignedToId: "u1" }, { ...leer, bearbeiter: null })).toBe("assignedToId");
    });
  });

  it("eigene Datensätze (Checkliste, Prüfbericht, Vertrag …) müssen im Mandanten liegen", () => {
    const befund: Befund = { eigene: { checklistId: true, contractId: false } };
    expect(verweisFehler(ICH, { checklistId: "c1" }, befund)).toBeNull();
    expect(verweisFehler(ICH, { contractId: "v9" }, befund)).toBe("contractId");
  });
});

describe("jede Route mit Verweisen prüft sie", () => {
  it("Anlegen und Ändern in der Betriebsführung ruft verweisePruefen", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const wurzel = join(process.cwd(), "src/app/api/management-billing");
    const routen: string[] = [];
    const sammle = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const pfad = join(dir, name);
        if (statSync(pfad).isDirectory()) sammle(pfad);
        else if (name === "route.ts") routen.push(pfad);
      }
    };
    sammle(wurzel);
    // A body that carries parkId/turbineId … into a create or update.
    const ohne = routen.filter((r) => {
      const s = readFileSync(r, "utf8");
      return /parsed\.data/.test(s) && /\b(parkId|turbineId|assignedToId)\b.*= parsed\.data/.test(s) && !s.includes("verweisePruefen(");
    });
    expect(ohne.map((r) => r.slice(wurzel.length + 1))).toEqual([]);
  });
});
