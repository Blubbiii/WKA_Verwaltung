/**
 * Keine Karte wiederholt die Seitenüberschrift (UX-Durchsicht, Punkt 11).
 *
 * Viele Listen zeigten "Pachtverträge" als Seitenkopf und darunter noch
 * einmal "Pachtverträge / Übersicht aller Pachtverträge" als Kartentitel —
 * rund 100 px, die nichts sagen.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doppelteUeberschriften } from "./doppelte-ueberschrift";

const SRC = join(process.cwd(), "src");
const de = JSON.parse(readFileSync(join(SRC, "messages", "de.json"), "utf8"));

function seiten(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...seiten(p));
    else if (p.endsWith("page.tsx")) out.push(p);
  }
  return out;
}

describe("doppelte Überschriften", () => {
  it("erkennt gleiche Wörter hinter verschiedenen Schlüsseln", () => {
    const quelle = `const t = useTranslations("leases.list");
      <PageHeader title={t("title")} />
      <CardTitle>{t("table.title")}</CardTitle>`;
    const nachrichten = { leases: { list: { title: "Pachtverträge", table: { title: "Pachtverträge" } } } };
    expect(doppelteUeberschriften(quelle, nachrichten)).toHaveLength(1);
  });

  it("lässt andere Kartentitel in Ruhe", () => {
    const quelle = `<PageHeader title="Parks" /><CardTitle>Anlagen</CardTitle>`;
    expect(doppelteUeberschriften(quelle, {})).toEqual([]);
  });

  it("keine Seite wiederholt ihre Überschrift als Kartentitel", () => {
    const alle: string[] = [];
    for (const datei of seiten(join(SRC, "app"))) {
      for (const f of doppelteUeberschriften(readFileSync(datei, "utf8"), de)) {
        alle.push(`${datei.slice(SRC.length + 1).split("\\").join("/")}: ${f}`);
      }
    }
    expect(alle).toEqual([]);
  });
});
