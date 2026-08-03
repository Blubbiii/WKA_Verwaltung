/**
 * Dokumentversionen: wer eine berichtigte Fassung hochlädt, bekommt sie auch.
 *
 * ## Der Fehler
 *
 * Eine neue Fassung wird als **eigene Zeile** angelegt, die über `parentId`
 * auf das Ursprungsdokument zeigt. Das Ursprungsdokument behält seine eigene
 * `fileUrl` — die der ersten Fassung.
 *
 * Die Liste zeigt nur die Wurzeln (kommentiert mit „Only show latest
 * versions", was genau verkehrt herum ist), und Herunterladen wie Vorschau
 * riefen die Wurzel-Kennung auf. Ergebnis: **immer die erste Fassung**. Die
 * Versionshistorie markierte obendrein die Wurzel als „Aktuell" — die
 * unterste, älteste Zeile trug das Kennzeichen.
 *
 * Wer einen korrigierten Vertrag hochlud, sah ihn in der Historie stehen und
 * bekam beim Herunterladen weiter den alten. Die neue Datei lag im Speicher
 * und zählte gegen das Kontingent.
 *
 * ## Was hier geprüft wird
 *
 * Die Metadaten-Kette — welche Fassung gilt als aktuell, welche Datei-Angaben
 * liefert die Detailansicht, welche Versionsnummer steht in der Liste.
 *
 * **Nicht** geprüft wird der Dateiabruf selbst. Der braucht einen erreichbaren
 * Objektspeicher; lokal ist keiner konfiguriert (`S3_ACCESS_KEY not set`).
 * Der Test legt deshalb Dokumente mit erfundenen Speicherschlüsseln an — die
 * Auflösung, welche Fassung gilt, findet davor statt und ist genau die Stelle,
 * an der es falsch war.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";

interface Fassung {
  id: string;
  version: number;
  fileName: string;
  isCurrent: boolean;
}

interface Dokument {
  id: string;
  fileName: string;
  fileUrl: string;
  currentVersionId?: string;
  versions: Fassung[];
}

test.describe("Dokumentversionen", () => {
  test("die neueste Fassung gilt als die aktuelle", async ({ page, api }) => {
    test.setTimeout(180_000);

    // --- Ursprungsdokument ------------------------------------------------
    const titel = testName("Vertrag");
    const res = await page.request.post("/api/documents", {
      data: {
        title: titel,
        category: "CONTRACT",
        fileName: "vertrag-v1.pdf",
        fileUrl: `e2e/${titel.replace(/\s+/g, "-")}-v1.pdf`,
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      },
    });
    expect(
      res.ok(),
      `Dokument anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);
    const rumpf = await res.json();
    const dokument = rumpf.data ?? rumpf;
    api.track({ collection: "documents", id: dokument.id, name: titel });

    // --- Berichtigte Fassung ----------------------------------------------
    // Anderer Dateiname als v1 — bei zweimal demselben waere nicht zu
    // unterscheiden, ob die richtige Fassung ausgeliefert wird oder nur
    // zufaellig die gleiche.
    const zweite = await page.request.post(`/api/documents/${dokument.id}/versions`, {
      data: {
        fileName: "vertrag-v2-berichtigt.pdf",
        fileUrl: `e2e/${titel.replace(/\s+/g, "-")}-v2.pdf`,
        fileSizeBytes: 2048,
        mimeType: "application/pdf",
        description: "Berichtigte Fassung",
      },
    });
    expect(
      zweite.ok(),
      `Neue Fassung anlegen fehlgeschlagen: HTTP ${zweite.status()}\n` +
        `${await zweite.text()}`,
    ).toBe(true);
    const neueFassung = await zweite.json();
    expect(neueFassung.version, "Die neue Fassung hat nicht Version 2").toBe(2);

    // --- Was gilt jetzt als aktuell? --------------------------------------
    const gelesen = await api.get<Dokument>(`/api/documents/${dokument.id}`);

    const aktuelle = gelesen.versions.filter((v) => v.isCurrent);
    expect(
      aktuelle.length,
      `${aktuelle.length} Fassungen sind als aktuell markiert — es kann nur eine geben`,
    ).toBe(1);

    expect(
      aktuelle[0].version,
      `Als aktuell gilt Version ${aktuelle[0].version}, nicht die neueste (2). ` +
        `Die Historie ist absteigend sortiert — damit trug die unterste, ` +
        `aelteste Zeile das Kennzeichen „Aktuell".`,
    ).toBe(2);

    // --- Und welche Datei liefert die Detailansicht? -----------------------
    expect(
      gelesen.fileName,
      `Die Detailansicht weist „${gelesen.fileName}" aus. Erwartet ist die ` +
        `berichtigte Fassung. Wird hier die Wurzel geliefert, bekommt jeder ` +
        `Download und jede Vorschau die alte Datei — die berichtigte liegt ` +
        `im Speicher und ist ueber die Oberflaeche nicht zu bekommen.`,
    ).toBe("vertrag-v2-berichtigt.pdf");

    expect(
      gelesen.currentVersionId,
      "Die Detailansicht nennt die Kennung der aktuellen Fassung nicht",
    ).toBe(neueFassung.id);

    // --- Die Versionsroute muss dasselbe sagen ----------------------------
    // Sie hatte eine EIGENE Auslegung von „aktuell": die gerade abgefragte
    // Fassung. Damit war jede Fassung aktuell, sobald man sie aufrief.
    const ueberVersionen = await api.get<{ versions: Fassung[] }>(
      `/api/documents/${dokument.id}/versions`,
    );
    const dortAktuell = ueberVersionen.versions.filter((v) => v.isCurrent);
    expect(
      dortAktuell.map((v) => v.version),
      "Die Versionsroute markiert eine andere Fassung als aktuell als die " +
        "Detailansicht. Zwei Ansichten desselben Dokuments duerfen sich nicht " +
        "widersprechen.",
    ).toEqual([2]);

    // --- Und die Liste ----------------------------------------------------
    const liste = await api.get<{
      data?: { id: string; version: number; versionCount: number }[];
    }>(`/api/documents?search=${encodeURIComponent(titel)}&limit=10`);
    const zeile = (liste.data ?? []).find((d) => d.id === dokument.id);
    expect(zeile, `Das Dokument „${titel}" steht nicht in der Liste`).toBeTruthy();

    expect(
      zeile!.version,
      `Die Liste zeigt Version ${zeile!.version} neben ` +
        `${zeile!.versionCount} Fassungen — „v1 von 2" ist keine Auskunft, ` +
        `sondern ein Widerspruch.`,
    ).toBe(2);
  });

  test("eine Fassung bleibt einzeln abrufbar", async ({ page, api }) => {
    test.setTimeout(180_000);

    // Die Gegenprobe zur Auflösung: wer AUSDRUECKLICH eine aeltere Fassung
    // anfordert, muss sie auch bekommen. Loeste auch dieser Weg auf die
    // aktuelle auf, waere die Historie nur Zierde — und eine
    // aufbewahrungspflichtige Unterlage nicht mehr im Original abrufbar.
    const titel = testName("Vertrag einzeln");
    const res = await page.request.post("/api/documents", {
      data: {
        title: titel,
        category: "CONTRACT",
        fileName: "original.pdf",
        fileUrl: `e2e/${titel.replace(/\s+/g, "-")}-v1.pdf`,
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      },
    });
    expect(res.ok(), `Anlegen: ${await res.text()}`).toBe(true);
    const rumpf = await res.json();
    const dokument = rumpf.data ?? rumpf;
    api.track({ collection: "documents", id: dokument.id, name: titel });

    await page.request.post(`/api/documents/${dokument.id}/versions`, {
      data: {
        fileName: "nachfolger.pdf",
        fileUrl: `e2e/${titel.replace(/\s+/g, "-")}-v2.pdf`,
        fileSizeBytes: 2048,
        mimeType: "application/pdf",
      },
    });

    // Die Wurzel einzeln abfragen: sie ist Version 1 und bleibt es.
    const versionen = await api.get<{ versions: Fassung[] }>(
      `/api/documents/${dokument.id}/versions`,
    );
    const erste = versionen.versions.find((v) => v.version === 1);
    expect(
      erste?.fileName,
      "Die erste Fassung ist nicht mehr unter ihrem eigenen Dateinamen zu " +
        "finden — die Auflösung hat die Historie ueberschrieben",
    ).toBe("original.pdf");
    expect(
      erste?.isCurrent,
      "Die erste Fassung gilt weiterhin als die aktuelle",
    ).toBe(false);
  });
});
