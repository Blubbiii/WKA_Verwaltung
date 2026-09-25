/**
 * Schalter, Häkchen, Auswahllisten und Eingaben mit Wirkung.
 *
 * Der Wächter "Knöpfe ohne Wirkung" deckt Buttons und Menüeinträge ab. Ein
 * Schalter kann auf zwei Arten tot sein:
 *  - gesteuert, aber ohne Rückweg: `checked={x}` ohne `onCheckedChange` —
 *    er springt beim Klicken zurück;
 *  - weder gesteuert noch mit Formular verbunden — er schaltet nur sich selbst.
 * Dasselbe gilt für Select/RadioGroup (`value` ohne `onValueChange`) und für
 * Eingabefelder (`value` ohne `onChange`, React friert sie ein).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsxElemente } from "./jsx-tags";

const SRC = join(process.cwd(), "src");

function dateien(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "ui" && e !== "api") out.push(...dateien(p));
    } else if (p.endsWith(".tsx") && !/\.test\.|\.stories\./.test(p)) {
      out.push(p);
    }
  }
  return out;
}

// Wired to react-hook-form or passes props on — the effect lives elsewhere.
const WEITERGEREICHT = /\{\.\.\.|\bname=|\bform=|\bdisabled\b|\breadOnly\b|aria-readonly|\bdefault(Checked|Value)=/;

const REGELN: Array<{ tag: string; wert: RegExp; aenderung: RegExp }> = [
  { tag: "Switch", wert: /\bchecked=/, aenderung: /\bonCheckedChange=|\bonClick=/ },
  { tag: "Checkbox", wert: /\bchecked=/, aenderung: /\bonCheckedChange=|\bonClick=|\bonChange=/ },
  { tag: "Select", wert: /\bvalue=/, aenderung: /\bonValueChange=/ },
  { tag: "RadioGroup", wert: /\bvalue=/, aenderung: /\bonValueChange=/ },
  { tag: "Slider", wert: /\bvalue=/, aenderung: /\bonValueChange=|\bonValueCommit=/ },
  { tag: "Input", wert: /\bvalue=/, aenderung: /\bonChange=|\bonInput=/ },
  { tag: "Textarea", wert: /\bvalue=/, aenderung: /\bonChange=|\bonInput=/ },
];

export function toteSchalter(quelle: string): string[] {
  const funde: string[] = [];
  for (const { tag, wert, aenderung } of REGELN) {
    for (const { attrs, start } of jsxElemente(quelle, tag)) {
      if (WEITERGEREICHT.test(attrs) || aenderung.test(attrs)) continue;
      const gesteuert = wert.test(attrs);
      // An uncontrolled Input/Textarea without anything is just a free field
      // read via ref/FormData — only flag controlled ones for those.
      if (!gesteuert && (tag === "Input" || tag === "Textarea")) continue;
      // Inside a FormControl the field props usually come via cloneElement.
      const davor = quelle.slice(Math.max(0, start - 300), start);
      if (/<FormControl>\s*$/.test(davor)) continue;
      const zeile = quelle.slice(0, start).split("\n").length;
      funde.push(`<${tag}> Zeile ${zeile}: ${gesteuert ? "gesteuert ohne Änderung" : "ohne Wirkung"}`);
    }
  }
  return funde;
}

describe("Schalter und Eingaben mit Wirkung", () => {
  it("erkennt die Fälle", () => {
    expect(toteSchalter(`<Switch checked={on} />`)).toHaveLength(1);
    expect(toteSchalter(`<Switch />`)).toHaveLength(1);
    expect(toteSchalter(`<Input value={x} />`)).toHaveLength(1);
    expect(toteSchalter(`<Select value={v}><SelectTrigger/></Select>`)).toHaveLength(1);
  });

  it("lässt richtige in Ruhe", () => {
    expect(toteSchalter(`<Switch checked={on} onCheckedChange={setOn} />`)).toEqual([]);
    expect(toteSchalter(`<Switch {...field} />`)).toEqual([]);
    expect(toteSchalter(`<Switch checked disabled />`)).toEqual([]);
    expect(toteSchalter(`<Input value={x} readOnly />`)).toEqual([]);
    expect(toteSchalter(`<Input name="q" />`)).toEqual([]);
    expect(toteSchalter(`<FormControl>\n<Switch checked={field.value} />`)).toEqual([]);
  });

  it("jeder Schalter, jede Auswahl und jedes gesteuerte Feld hat eine Wirkung", () => {
    const alle: string[] = [];
    for (const datei of dateien(SRC)) {
      for (const fund of toteSchalter(readFileSync(datei, "utf8"))) {
        alle.push(`${datei.slice(SRC.length + 1).split("\\").join("/")}: ${fund}`);
      }
    }
    expect(alle).toEqual([]);
  });
});
