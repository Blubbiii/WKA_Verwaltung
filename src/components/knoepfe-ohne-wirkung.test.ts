/**
 * Knöpfe ohne Wirkung.
 *
 * Die PPA-Seite hatte vier Knöpfe, die nichts taten ("Neuer PPA",
 * "Ersten PPA anlegen", "Anzeigen", "Bearbeiten"), der GIS-Import einen
 * "Datei auswählen", der den Dateidialog nicht öffnete. Beschriftet, sichtbar,
 * klickbar — und ohne Handler. Dieser Test sucht solche Knöpfe im Quelltext.
 *
 * Ein Knopf wirkt, wenn er onClick/onSelect hat, asChild ist (Link oder
 * Trigger darin), submit ist, zu einem Formular gehört, deaktiviert ist oder
 * Props weiterreicht — oder wenn er in einem `…Trigger asChild` steckt.
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
      // shadcn primitives define Button itself
      if (eintrag !== "ui" && eintrag !== "api") out.push(...dateien(pfad));
    } else if (pfad.endsWith(".tsx") && !/\.test\.|\.stories\./.test(pfad)) {
      out.push(pfad);
    }
  }
  return out;
}

const WIRKT = /\bonClick=|\bonSelect=|\basChild\b|type=["{]?["']?submit|\bform=|\bdisabled\b|\{\.\.\.|\bhref=/;

function knoepfeOhneWirkung(quelle: string): string[] {
  const funde: string[] = [];
  // jsxElemente reads the opening tag with braces/quotes — a plain regex stops
  // at the ">" of an arrow function inside an attribute.
  const elemente = ["Button", "DropdownMenuItem", "ContextMenuItem"].flatMap((tag) =>
    jsxElemente(quelle, tag).map((e) => ({ tag, ...e })),
  );
  for (const { tag, attrs, inhalt, start } of elemente) {
    if (WIRKT.test(attrs)) continue;
    // Inside a Trigger/Close with asChild that is still open (FormControl etc. may sit between)
    const davor = quelle.slice(Math.max(0, start - 400), start);
    const trigger = davor.lastIndexOf("asChild");
    const oeffnet = /<\w+(Trigger|Close|Action|Cancel)\b[^>]*asChild[^>]*>/.test(davor.slice(Math.max(0, trigger - 200)));
    if (trigger >= 0 && oeffnet && !/<\/\w+(Trigger|Close|Action|Cancel)>/.test(davor.slice(trigger))) continue;
    const text = inhalt.replace(/<[^>]+>/g, " ").replace(/\{[^}]*\}/g, (x) => (/t\(|\w/.test(x) ? " x " : " ")).replace(/\s+/g, " ").trim();
    // Icon-only buttons are almost always menu/popover triggers
    if (!text) continue;
    const zeile = quelle.slice(0, start).split("\n").length;
    funde.push(`<${tag}> Zeile ${zeile}: ${inhalt.replace(/\s+/g, " ").trim().slice(0, 50)}`);
  }
  return funde;
}

describe("Knöpfe ohne Wirkung", () => {
  it("jeder beschriftete Knopf und Menüeintrag hat eine Aktion", () => {
    const alle: string[] = [];
    for (const datei of dateien(SRC)) {
      for (const fund of knoepfeOhneWirkung(readFileSync(datei, "utf8"))) {
        alle.push(`${datei.slice(SRC.length + 1).split("\\").join("/")}: ${fund}`);
      }
    }
    expect(alle).toEqual([]);
  });

  it("erkennt einen Knopf ohne Handler", () => {
    expect(knoepfeOhneWirkung(`<Button variant="outline">Neu</Button>`)).toHaveLength(1);
    expect(knoepfeOhneWirkung(`<DropdownMenuItem>Bearbeiten</DropdownMenuItem>`)).toHaveLength(1);
  });

  it("lässt Knöpfe mit Wirkung in Ruhe", () => {
    expect(knoepfeOhneWirkung(`<Button onClick={go}>Neu</Button>`)).toEqual([]);
    expect(knoepfeOhneWirkung(`<Button asChild><Link href="/x">Neu</Link></Button>`)).toEqual([]);
    expect(knoepfeOhneWirkung(`<Button type="submit">Speichern</Button>`)).toEqual([]);
    expect(knoepfeOhneWirkung(`<PopoverTrigger asChild>\n<FormControl>\n<Button variant="outline">{t("x")}</Button>`)).toEqual([]);
  });
});
