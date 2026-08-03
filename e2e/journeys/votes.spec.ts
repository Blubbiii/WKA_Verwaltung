/**
 * Abstimmungen: die Auszählung kommt durch.
 *
 * ## Was dieser Test leistet — und was nicht
 *
 * Die eigentlichen Fehler lagen in der **Rechnung**: Enthaltungen in der
 * Mehrheitsgrundlage, Zustimmung über den Text „Ja" gesucht, Stimmgewicht mit
 * `||` statt `??` abgeleitet. Sie steckten in drei getrennten Fassungen
 * derselben Auszählung — Verwaltungsansicht, Gesellschafterportal und
 * Beschlussprotokoll — die voneinander abwichen. Geprüft wird das dort, wo
 * es hingehört: in `src/lib/votes/tally.test.ts`, mit nachgerechneten Zahlen.
 *
 * Was hier geprüft wird, ist der Weg drumherum: dass die Route nach der
 * Zusammenführung noch antwortet und ihre Zahlen zusammenpassen.
 *
 * **Nicht** geprüft wird eine echte Stimmabgabe. Stimmen lassen sich
 * ausschliesslich über das Gesellschafterportal erfassen, und das verlangt
 * einen Benutzer, der mit einem Gesellschafter verknüpft ist. Dieser Aufbau
 * gehört in einen eigenen Test mit eigener Anmeldung — hier vorzutäuschen,
 * die Abstimmung sei durchgespielt, wäre schlimmer als die Lücke.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";

interface Abstimmung {
  id: string;
  options: string[];
  stats: {
    totalEligible: number;
    totalResponses: number;
    quorumMet: boolean;
    isApproved: boolean | null;
    resultReason?: string | null;
  };
  results: {
    byHead: { option: string; count: number; percentage: string }[];
    byCapital: { option: string; capitalWeight: string; percentage: string }[];
  };
}

test.describe("Abstimmungen", () => {
  test("die Auswertung antwortet und ihre Zahlen passen zusammen", async ({
    page,
    api,
  }) => {
    test.setTimeout(180_000);

    // Eine Abstimmung braucht eine Gesellschaft. Gibt es keine, ist das kein
    // Fehler, sondern ein leerer Bestand.
    const fonds = await api.get<{ data?: { id: string; name: string }[] }>(
      "/api/funds?limit=1",
    );
    const fund = (fonds.data ?? [])[0];
    await requireOrSkip(
      Boolean(fund),
      "Es gibt keine Gesellschaft — ohne sie laesst sich keine Abstimmung anlegen",
    );

    const titel = testName("Abstimmung");
    const heute = new Date();
    const inEinerWoche = new Date(Date.now() + 7 * 86_400_000);

    const res = await page.request.post("/api/votes", {
      data: {
        fundId: fund!.id,
        title: titel,
        description: "Angelegt von der Journey-Suite",
        voteType: "simple",
        options: ["Ja", "Nein", "Enthaltung"],
        startDate: heute.toISOString(),
        endDate: inEinerWoche.toISOString(),
        quorumPercentage: 50,
        requiresCapitalMajority: true,
        status: "DRAFT",
      },
    });
    expect(
      res.ok(),
      `Abstimmung anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);
    const rumpf = await res.json();
    const angelegt = rumpf.data ?? rumpf;
    api.track({ collection: "votes", id: angelegt.id, name: titel });

    // --- Die Auswertung ---------------------------------------------------
    // Sie lief bis eben in drei getrennten Fassungen. Nach der
    // Zusammenfuehrung muss sie ueberhaupt erst einmal antworten.
    const gelesen = await api.get<Abstimmung>(`/api/votes/${angelegt.id}`);

    expect(
      gelesen.results?.byCapital,
      "Die Auswertung liefert keine Ergebnisse nach Kapital",
    ).toBeTruthy();

    // Jede Antwortmoeglichkeit muss vorkommen — auch die mit null Stimmen.
    // Faellt eine weg, sieht die Aufstellung vollstaendig aus und ist es nicht.
    for (const option of ["Ja", "Nein", "Enthaltung"]) {
      expect(
        gelesen.results.byCapital.some((r) => r.option === option),
        `Die Antwortmoeglichkeit „${option}" fehlt in der Auswertung nach Kapital`,
      ).toBe(true);
      expect(
        gelesen.results.byHead.some((r) => r.option === option),
        `Die Antwortmoeglichkeit „${option}" fehlt in der Auswertung nach Koepfen`,
      ).toBe(true);
    }

    // Ohne Stimmen: alles null, nichts NaN. Ein NaN in einer Prozentangabe
    // kaeme aus einer Division durch null und wuerde als „—" oder „NaN%"
    // durchschlagen.
    for (const zeile of gelesen.results.byCapital) {
      expect(
        Number.isNaN(Number(zeile.percentage)),
        `Der Anteil fuer „${zeile.option}" ist keine Zahl (${zeile.percentage}) — ` +
          `vermutlich eine Division durch null`,
      ).toBe(false);
    }

    expect(
      gelesen.stats.totalResponses,
      "Eine frisch angelegte Abstimmung hat Stimmen",
    ).toBe(0);

    // Ein Entwurf hat kein Ergebnis — weder angenommen noch abgelehnt.
    expect(
      gelesen.stats.isApproved,
      "Ein noch nicht geschlossener Entwurf weist bereits einen Beschluss aus",
    ).toBeNull();

    // Quorum von 50 %, aber niemand hat gestimmt.
    expect(
      gelesen.stats.quorumMet,
      "Ohne eine einzige Stimme gilt ein Quorum von 50 % als erreicht",
    ).toBe(false);
  });

  test("eigene Antwortmoeglichkeiten kommen unveraendert zurueck", async ({
    page,
    api,
  }) => {
    test.setTimeout(180_000);

    // Der Assistent laesst zu, die Antwortmoeglichkeiten frei zu setzen. Die
    // Auswertung suchte die Zustimmung aber ueber den Text „Ja" — bei
    // „Zustimmung"/„Ablehnung" kam dort immer 0 heraus, und die Abstimmung
    // wurde als ABGELEHNT ausgewiesen, egal wie alle gestimmt hatten.
    //
    // Ob daraus jetzt richtig „nicht bestimmbar" statt „abgelehnt" wird,
    // prueft der Unit-Test. Hier geht es darum, dass die Optionen ueberhaupt
    // heil durch Anlegen und Auswertung kommen.
    const fonds = await api.get<{ data?: { id: string }[] }>("/api/funds?limit=1");
    const fund = (fonds.data ?? [])[0];
    await requireOrSkip(Boolean(fund), "Es gibt keine Gesellschaft");

    const titel = testName("Abstimmung eigene Optionen");
    const res = await page.request.post("/api/votes", {
      data: {
        fundId: fund!.id,
        title: titel,
        voteType: "simple",
        options: ["Zustimmung", "Ablehnung", "Enthaltung"],
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        requiresCapitalMajority: false,
        status: "DRAFT",
      },
    });
    expect(res.ok(), `Anlegen fehlgeschlagen: ${await res.text()}`).toBe(true);
    const angelegt = (await res.json()).data ?? (await res.json());
    api.track({ collection: "votes", id: angelegt.id, name: titel });

    const gelesen = await api.get<Abstimmung>(`/api/votes/${angelegt.id}`);

    expect(
      gelesen.results.byHead.map((r) => r.option),
      "Die eigenen Antwortmoeglichkeiten kommen nicht unveraendert zurueck — " +
        "die Auswertung faellt vermutlich auf Ja/Nein/Enthaltung zurueck",
    ).toEqual(["Zustimmung", "Ablehnung", "Enthaltung"]);
  });
});
