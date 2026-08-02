/**
 * Datei-Downloads laufen über src/lib/download.ts.
 *
 * Ausgangslage: Das Muster ObjectURL → unsichtbarer <a> → click → revoke stand
 * an 49 Stellen in 44 Dateien kopiert im Code, jede mit eigener
 * Filename-Logik. Zwei Fallstricke, die dabei ungleich behandelt wurden:
 *
 *  1. Der Dateiname aus `Content-Disposition` — nur ein Teil der Stellen las
 *     ihn, und die meisten davon per eigenem Regex ohne RFC-6266-Form
 *     (`filename*=UTF-8''…`), also ohne Umlaut-Unterstützung.
 *  2. Der Zeitpunkt des `revokeObjectURL` — Firefox und Safari brechen den
 *     Download ab, wenn direkt nach `click()` widerrufen wird. Drei Stellen
 *     wussten das und verzögerten, die übrigen nicht.
 *
 * Der Helper löst beides einheitlich. Dieser Test hält fest, dass niemand
 * daneben ein neues Muster aufbaut.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(process.cwd(), "src");
const HELPER = join(SRC, "lib/download.ts");

/**
 * Stellen, die `createObjectURL` bewusst NICHT über den Helper nutzen: alle
 * drei sind Vorschauen, bei denen die URL am Leben bleiben muss. Ein
 * sofortiges `revokeObjectURL` wäre dort ein Fehler, kein Fortschritt.
 */
const PREVIEW_EXCEPTIONS = [
  // Dokument-Vorschau, Freigabe im useEffect-Cleanup.
  "app/(dashboard)/documents/paperless/page.tsx",
  // Avatar-Vorschau direkt aus der Datei-Auswahl.
  "app/(dashboard)/settings/page.tsx",
  // Briefkopf-Vorschau via window.open, Freigabe verzögert um 60 s.
  "components/settings/LetterheadSettings.tsx",
].map((p) => p.split("/").join(sep));

/**
 * Ergebnis des Baum-Durchlaufs, einmal je Prozess.
 *
 * Beide Tests dieser Datei brauchen dieselbe Liste, und der Durchlauf liest
 * jede Quelldatei des Projekts. Ohne diesen Zwischenspeicher lief er zweimal
 * und brauchte zusammen mehr als die voreingestellten fuenf Sekunden — im
 * Gesamtlauf, unter Last der uebrigen Dateien, kippte der zweite Test dadurch
 * in einen Zeitueberlauf. Allein lief er durch.
 *
 * Ein Test, der je nach Nachbarn mal rot und mal gruen ist, ist schlimmer als
 * ein langsamer: man gewoehnt sich an, ihn nicht ernst zu nehmen.
 */
let zwischenspeicher: string[] | null = null;

function filesUsingObjectUrl(): string[] {
  if (zwischenspeicher) return zwischenspeicher;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (full === HELPER) continue;
      if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
      if (readFileSync(full, "utf-8").includes("createObjectURL(")) {
        hits.push(relative(SRC, full));
      }
    }
  };
  walk(SRC);
  zwischenspeicher = hits;
  return hits;
}

describe("Download-Helper", () => {
  it("außerhalb des Helpers nutzt nur noch die Vorschau createObjectURL", () => {
    const hits = filesUsingObjectUrl();
    const unexpected = hits.filter((h) => !PREVIEW_EXCEPTIONS.includes(h));
    expect(
      unexpected,
      `Neues handkopiertes Download-Muster in:\n  ${unexpected.join("\n  ")}`,
    ).toEqual([]);
  });

  it("die dokumentierten Ausnahmen existieren noch", () => {
    // Verhindert, dass die Liste veraltet und der Test dadurch schwächer wird.
    const hits = filesUsingObjectUrl();
    const gone = PREVIEW_EXCEPTIONS.filter((e) => !hits.includes(e));
    expect(gone, `Ausnahme nicht mehr nötig: ${gone.join(", ")}`).toEqual([]);
  });

  it("der Helper gibt jede ObjectURL wieder frei", () => {
    const source = readFileSync(HELPER, "utf-8");
    const creates = (source.match(/createObjectURL\(/g) ?? []).length;
    const revokes = (source.match(/revokeObjectURL\(/g) ?? []).length;
    expect(creates).toBe(1);
    expect(revokes).toBe(creates);
  });

  it("der Helper widerruft NICHT synchron nach dem Klick", () => {
    // Genau das bricht den Download in Firefox und Safari ab. Die Erfahrung
    // stand vorher nur an der SEPA-Ausleitung im Code.
    const source = readFileSync(HELPER, "utf-8");
    expect(source).toMatch(/setTimeout\(\s*\(\)\s*=>\s*URL\.revokeObjectURL/);
  });

  it("der Dateiname kommt aus Content-Disposition, nicht aus einem eigenen Regex", () => {
    const source = readFileSync(HELPER, "utf-8");
    expect(source).toContain("extractFilename");
    // Kein handgebauter Filename-Regex neben dem vorhandenen Helper.
    expect(source).not.toMatch(/filename="?\(/);
  });

  it("downloadText und downloadFromResponse bauen auf downloadBlob auf", () => {
    // Sonst driften die drei Wege wieder auseinander — der Ursprung des Befunds.
    const source = readFileSync(HELPER, "utf-8");
    const body = source.slice(source.indexOf("export async function downloadFromResponse"));
    expect(body).toContain("downloadBlob(");
    const textBody = source.slice(source.indexOf("export function downloadText"));
    expect(textBody).toContain("downloadBlob(");
  });
});
