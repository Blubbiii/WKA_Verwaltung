/**
 * Symbolknöpfe brauchen einen Namen.
 *
 * Ein Knopf, der nur ein Symbol zeigt (Stift, Mülleimer, Pfeil), ist für
 * Screenreader stumm — und für Tests nicht auffindbar. Der Bugtest fand 58
 * davon auf zehn Seiten. Ein Name kommt über aria-label, title, sr-only-Text
 * oder ein Label mit htmlFor.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function dateien(dir: string): string[] {
  const out: string[] = [];
  for (const eintrag of readdirSync(dir)) {
    const pfad = join(dir, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag !== "ui" && eintrag !== "api") out.push(...dateien(pfad));
    } else if (pfad.endsWith(".tsx") && !/\.test\.|\.stories\./.test(pfad)) {
      out.push(pfad);
    }
  }
  return out;
}

export function symbolknoepfeOhneNamen(quelle: string): string[] {
  const funde: string[] = [];
  const re = /<Button\b([^>]*?\bsize=["{]["']?icon["']?}?[^>]*?)>([\s\S]*?)<\/Button>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(quelle))) {
    const [, attrs, inhalt] = m;
    if (/\baria-label(ledby)?=|\btitle=|\{\.\.\./.test(attrs)) continue;
    if (/sr-only|aria-label=|<span\b[^>]*>[^<{]*\w/.test(inhalt)) continue;
    // Text content besides the icon (e.g. {t("x")} or plain words) names it too
    const ohneIcons = inhalt.replace(/<[A-Z]\w*\b[^>]*\/>/g, "").replace(/<[^>]+>/g, "").trim();
    if (ohneIcons) continue;
    const zeile = quelle.slice(0, m.index).split("\n").length;
    funde.push(`Zeile ${zeile}: ${inhalt.replace(/\s+/g, " ").trim().slice(0, 50)}`);
  }
  return funde;
}

describe("Symbolknöpfe mit Namen", () => {
  it("jeder Symbolknopf hat einen zugänglichen Namen", () => {
    const alle: string[] = [];
    for (const datei of dateien(SRC)) {
      for (const fund of symbolknoepfeOhneNamen(readFileSync(datei, "utf8"))) {
        alle.push(`${datei.slice(SRC.length + 1).split("\\").join("/")}: ${fund}`);
      }
    }
    expect(alle).toEqual([]);
  });

  it("erkennt und verschont richtig", () => {
    expect(symbolknoepfeOhneNamen(`<Button size="icon"><Trash2 className="h-4 w-4" /></Button>`)).toHaveLength(1);
    expect(symbolknoepfeOhneNamen(`<Button size="icon" aria-label={t("x")}><Trash2 /></Button>`)).toEqual([]);
    expect(symbolknoepfeOhneNamen(`<Button size="icon"><Trash2 /><span className="sr-only">Löschen</span></Button>`)).toEqual([]);
  });
});
