/**
 * Jeder API-Aufruf der Oberfläche trifft eine Route mit dieser Methode.
 *
 * Der Verdrahtungs-Audit (2026-09) fand zwei Knöpfe, die ins Leere liefen:
 * die Briefpapier-Vorschau rief eine Route, die es nie gab (404), und die
 * Dokumentenliste sendete PATCH an eine Route, die nur PUT kennt (405).
 *
 * Geprüft werden fetch-Aufrufe mit fester Adresse und fester oder fehlender
 * Methode. `${…}` gilt als ein Segment. Aufrufe mit Methode aus einer
 * Variablen oder an Fremdsysteme (Paperless) bleiben außen vor.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const API = join(SRC, "app", "api");

function dateien(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...dateien(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

interface Route { muster: RegExp; methoden: Set<string>; statisch: number; beispiel: string }
const routen: Route[] = dateien(API, (p) => p.endsWith(`${sep}route.ts`)).map((datei) => {
  const text = readFileSync(datei, "utf8");
  const methoden = new Set<string>();
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) methoden.add(m[1]);
  for (const m of text.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)) methoden.add(m[1]);
  const block = text.match(/export\s*\{([^}]*)\}/);
  if (block) for (const t of block[1].split(",")) { const n = t.trim().split(" as ").pop(); if (n && /^(GET|POST|PUT|PATCH|DELETE)$/.test(n)) methoden.add(n); }
  const teile = relative(join(SRC, "app"), join(datei, "..")).split(sep);
  let rx = "";
  let statisch = 0;
  // The route with each dynamic segment as "X" — matched by call templates
  // whose placeholder stands for a fixed segment (`/api/plots/${id}/${rolle}`).
  const beispiel = "/" + teile.map((t) => (t.startsWith("[") ? "X" : t)).join("/");
  for (const t of teile) {
    if (t.startsWith("[[...")) rx += "(/.*)?";
    else if (t.startsWith("[...")) rx += "/.+";
    else if (t.startsWith("[")) rx += "/[^/]+";
    else { rx += "/" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); statisch++; }
  }
  return { muster: new RegExp(`^${rx}/?$`), methoden, statisch, beispiel };
});

// Clients of third-party APIs that happen to use /api/… paths.
const FREMD = [`lib${sep}paperless${sep}client.ts`];

function aufrufeOhneRoute(): string[] {
  const funde: string[] = [];
  const quellen = dateien(SRC, (p) => /\.(tsx?)$/.test(p) && !p.includes(`${sep}app${sep}api${sep}`) && !/\.test\./.test(p) && !FREMD.some((f) => p.endsWith(f)));
  for (const datei of quellen) {
    const text = readFileSync(datei, "utf8");
    for (const m of text.matchAll(/fetch\(\s*(["'`])(\/api\/[^"'`]*)\1/g)) {
      const roh = m[2];
      // A path ending in a template (…/${x}) may carry several segments or a query.
      const pfad = roh.replace(/\$\{[^}]*\}/g, "X").split("?")[0].replace(/\/+$/, "");
      if (/\$\{[^}]*\}$/.test(roh) && !roh.includes("/${")) continue; // "/api/x${query}"
      const rest = text.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
      const naechster = rest.indexOf("fetch(");
      const bereich = naechster === -1 ? rest : rest.slice(0, naechster);
      const fest = bereich.match(/method:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/);
      if (!fest && /method\s*[:,}]/.test(bereich)) continue; // method from a variable
      const methode = fest ? fest[1] : "GET";
      const pfadMuster = new RegExp(
        "^" + pfad.split("/").map((t) => (t === "X" ? "[^/]+" : t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/") + "$",
      );
      const passend = [
        ...routen.filter((r) => r.muster.test(pfad)),
        ...routen.filter((r) => !r.muster.test(pfad) && pfadMuster.test(r.beispiel)),
      ];
      const zeile = text.slice(0, m.index).split("\n").length;
      const ort = `${relative(SRC, datei).split(sep).join("/")}:${zeile}`;
      if (passend.length === 0) {
        funde.push(`${ort}: ${methode} ${roh} — keine Route`);
      } else if (!passend.some((r) => r.methoden.has(methode))) {
        funde.push(`${ort}: ${methode} ${roh} — Route kennt nur ${[...passend[0].methoden].join("/")}`);
      }
    }
  }
  return funde;
}

describe("API-Aufrufe der Oberfläche", () => {
  it("jeder Aufruf trifft eine Route mit dieser Methode", () => {
    expect(aufrufeOhneRoute()).toEqual([]);
  });
});
