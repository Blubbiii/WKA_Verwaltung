/**
 * Konventions-Sperren — damit die Zahlen aus dem Audit nicht wieder wachsen.
 *
 * Das Audit 2026-08 hat drei Muster gefunden, die zu weit verbreitet sind, um
 * sie in einem Zug umzustellen: handgerollte Datenabrufe (280 Dateien),
 * handgerollte Formulare (25) und selbstgebaute Tabellen (169). Für alle drei
 * gibt es eine bessere Lösung, und für alle drei lautet die Regel „Neues nutzt
 * sie, Bestehendes zieht bei Gelegenheit um".
 *
 * ## Warum eine Sperre und keine Lint-Regel
 *
 * Eine Lint-Regel kennt nur „erlaubt" oder „verboten". Bei 280 bestehenden
 * Fundstellen hiesse verboten: 280 Ausnahmen eintragen oder die Regel als
 * Warnung führen — und Warnungen sammeln sich, bis niemand mehr hinsieht.
 *
 * Diese Tests zählen stattdessen. Wer eine Fundstelle beseitigt, darf die
 * Zahl senken; wer eine hinzufügt, bekommt einen roten Test mit dem Hinweis,
 * was stattdessen zu tun ist. Die Richtung ist damit erzwungen, ohne dass
 * jemand einen Umbau über hunderte Dateien prüfen müsste.
 *
 * **Diese Zahlen dürfen NUR nach unten.** Steigt eine, ist das kein Grund den
 * Wert anzuheben, sondern der Hinweis, dass eine neue Datei dem alten Muster
 * folgt.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, out);
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Kommentare entfernen, bevor gesucht wird.
 *
 * Ohne das schlägt jede Regel auf ihrer eigenen Erklärung an: eine Datei, die
 * im Kopfkommentar begründet, warum sie `useQuery` statt useEffect + fetch
 * benutzt, wurde als Verstoss gezählt. Der Hinweis, der jemanden aufhalten
 * soll, wurde damit zum Grund, ihn nicht hinzuschreiben.
 *
 * Aufgefallen am 03.08.2026 an genau so einer Datei.
 */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const TSX_FILES = walk(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).replace(/\\/g, "/"),
  source: ohneKommentare(readFileSync(path, "utf-8")),
}));

function count(predicate: (f: { path: string; source: string }) => boolean) {
  return TSX_FILES.filter(predicate).map((f) => f.path);
}

// ---------------------------------------------------------------------------
// C7 · Datenabruf
// ---------------------------------------------------------------------------

describe("Datenabruf im Client (C7)", () => {
  /**
   * Stand 03.08.2026 (vorher 280). Nur senken.
   *
   * Die Zahl ist um eins gesunken, weil seither Kommentare vor der Suche
   * entfernt werden — eine Datei zaehlte nur wegen ihrer eigenen Erklaerung
   * mit. Ohne diese Nachfuehrung waere der Waechter still lockerer geworden.
   *
   * CLAUDE.md verlangt seit langem react-query für neue Fetches; die Quote hat
   * sich seither trotzdem verschlechtert (79 % → 91 %). Genau deshalb steht
   * hier eine Zahl und nicht nur ein Satz.
   */
  const BASELINE = 279;

  it(`nicht mehr als ${BASELINE} Dateien mit useEffect + fetch`, () => {
    const offenders = count(
      (f) => f.source.includes("useEffect") && f.source.includes("fetch("),
    );
    expect(
      offenders.length,
      offenders.length > BASELINE
        ? `Es ist mindestens eine Datei dazugekommen, die den Abruf von Hand baut. ` +
            `Neue Fetches gehören in useQuery/useMutation (siehe CLAUDE.md). ` +
            `Wurde stattdessen eine bestehende umgestellt, darf diese Zahl sinken.`
        : "",
    ).toBeLessThanOrEqual(BASELINE);
  });
});

// ---------------------------------------------------------------------------
// C6 · Formulare
// ---------------------------------------------------------------------------

describe("Formulare (C6)", () => {
  /** Stand 01.08.2026. Nur senken. */
  const BASELINE = 25;

  it(`nicht mehr als ${BASELINE} handgerollte Formulare`, () => {
    const offenders = count(
      (f) => f.source.includes("onSubmit") && !f.source.includes("react-hook-form"),
    );
    expect(
      offenders.length,
      offenders.length > BASELINE
        ? `Ein neues Formular ohne react-hook-form. Handgerollte Formulare haben ` +
            `typischerweise keine Feldprüfung vor dem Absenden und keinen Schutz ` +
            `gegen Doppelklick.`
        : "",
    ).toBeLessThanOrEqual(BASELINE);
  });
});

// ---------------------------------------------------------------------------
// C1 · Listen
// ---------------------------------------------------------------------------

describe("Listen (C1)", () => {
  /** Stand 01.08.2026, nach Umstellung von zwei Listen. Nur senken. */
  const BASELINE_SHADCN = 161;
  /** Rohes <table> — dafür gibt es keinen guten Grund mehr. */
  const BASELINE_RAW = 13;

  it(`nicht mehr als ${BASELINE_SHADCN} Dateien mit direktem <Table>`, () => {
    const offenders = count(
      (f) =>
        f.source.includes('from "@/components/ui/table"') &&
        !f.path.startsWith("components/ui/"),
    );
    expect(
      offenders.length,
      offenders.length > BASELINE_SHADCN
        ? `Eine neue Liste baut Sortierung, Suche, Paginierung und Leerzustand ` +
            `selbst. Dafür gibt es <DataTable> (siehe CLAUDE.md). Ausnahme: ` +
            `serverseitig paginierte Listen — dann diese Zahl anheben und ` +
            `begründen.`
        : "",
    ).toBeLessThanOrEqual(BASELINE_SHADCN);
  });

  it(`nicht mehr als ${BASELINE_RAW} Dateien mit rohem <table>`, () => {
    const offenders = count((f) => /<table[\s>]/.test(f.source));
    expect(offenders.length).toBeLessThanOrEqual(BASELINE_RAW);
  });
});

// ---------------------------------------------------------------------------
// C2 · Bestätigungen — hier ist die Zahl bereits null und muss es bleiben
// ---------------------------------------------------------------------------

describe("Bestätigungen (C2)", () => {
  it("kein nativer confirm() mehr", () => {
    // Welle 2 hat alle vierzehn ersetzt. Der Browserdialog kann keine
    // Auflistung dessen zeigen, was gleich passiert, und lässt sich in
    // manchen Browsern für die Sitzung unterdrücken — dann liefe die Aktion
    // kommentarlos durch.
    const offenders = count(
      (f) =>
        f.path !== "components/ui/use-confirm.tsx" &&
        /(^|[^.\w])confirm\(|window\.confirm\(/m.test(
          f.source.replace(/await confirm\(/g, ""),
        ),
    );
    expect(
      offenders.join(", "),
      "Statt window.confirm() den Hook useConfirm() aus @/components/ui/use-confirm nutzen.",
    ).toBe("");
  });
});
