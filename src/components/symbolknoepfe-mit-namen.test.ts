/**
 * Symbolknöpfe brauchen einen Namen.
 *
 * Ein Knopf, der nur ein Symbol zeigt (Stift, Mülleimer, Pfeil), ist für
 * Screenreader stumm — und für Tests nicht auffindbar. Der Bugtest fand 58
 * davon auf zehn Seiten. Ein Name kommt über aria-label, title oder sr-only-Text.
 *
 * Die erste Fassung suchte mit `<Button([^>]*)>` und brach am ">" von
 * `onClick={() => …}` ab — genau diese Knöpfe blieben unerkannt. Jetzt liest
 * jsxElemente() das öffnende Tag mit Klammern und Anführungszeichen.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxElemente } from "./jsx-tags";

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

function symbolknoepfeOhneNamen(quelle: string): string[] {
  const funde: string[] = [];
  // Any <Button> or raw <button> whose only content is an icon — not just
  // size="icon": the vote form had raw <button>s with an X to remove options.
  const elemente = [...jsxElemente(quelle, "Button"), ...jsxElemente(quelle, "button")];
  for (const { attrs, inhalt, start } of elemente) {
    if (!/<[A-Z]\w*\b[^>]*\/>/.test(inhalt)) continue; // no icon at all
    if (/\baria-label(ledby)?=|\btitle=|\{\.\.\./.test(attrs)) continue;
    if (/sr-only|aria-label=|<span\b[^>]*>[^<{]*\w/.test(inhalt)) continue;
    // Text content besides the icon (e.g. {t("x")} or plain words) names it too
    const ohneIcons = inhalt.replace(/<[A-Z]\w*\b[^>]*\/>/g, "").replace(/<[^>]+>/g, "").trim();
    if (ohneIcons) continue;
    const zeile = quelle.slice(0, start).split("\n").length;
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
    // The case the regex version missed: an arrow function before the icon
    expect(
      symbolknoepfeOhneNamen(`<Button\n  size="icon"\n  onClick={() => handleEdit(rt)}\n>\n  <Pencil className="h-4 w-4" />\n</Button>`),
    ).toHaveLength(1);
  });
});

/**
 * Der Name muss auch stimmen. Die automatische Benennung gab 80 Pfeil-Knöpfen
 * den Namen "Verknüpfen", weil in ihnen ein <Link> steckt — der Screenreader
 * las "Verknüpfen" statt "Zurück".
 */
const NAME_ZUM_SYMBOL: Array<[string, RegExp]> = [
  ["ArrowLeft", /zurück/i],
  ["ArrowRight", /weiter|öffnen|nächste/i],
  ["ExternalLink", /öffnen/i],
];

function falscheNamen(quelle: string): string[] {
  const funde: string[] = [];
  for (const { attrs, inhalt, start } of [...jsxElemente(quelle, "Button"), ...jsxElemente(quelle, "button")]) {
    const name = attrs.match(/aria-label="([^"]*)"/)?.[1];
    if (!name) continue;
    const icons = [...inhalt.matchAll(/<([A-Z]\w*)\b[^>]*\/>/g)].map((m) => m[1]);
    if (icons.length !== 1) continue;
    const regel = NAME_ZUM_SYMBOL.find(([icon]) => icon === icons[0]);
    if (regel && !regel[1].test(name)) {
      funde.push(`Zeile ${quelle.slice(0, start).split("\n").length}: ${icons[0]} heißt "${name}"`);
    }
  }
  return funde;
}

describe("Symbolknöpfe mit passendem Namen", () => {
  it("Pfeile und Außenlinks heißen, was sie tun", () => {
    const alle: string[] = [];
    for (const datei of dateien(SRC)) {
      for (const fund of falscheNamen(readFileSync(datei, "utf8"))) {
        alle.push(`${datei.slice(SRC.length + 1).split("\\").join("/")}: ${fund}`);
      }
    }
    expect(alle).toEqual([]);
  });

  it("erkennt den Fall", () => {
    expect(falscheNamen(`<Button aria-label="Verknüpfen" size="icon" asChild><Link href="/x"><ArrowLeft className="h-4 w-4" /></Link></Button>`)).toHaveLength(1);
    expect(falscheNamen(`<Button aria-label="Zurück" size="icon" asChild><Link href="/x"><ArrowLeft className="h-4 w-4" /></Link></Button>`)).toEqual([]);
  });
});
