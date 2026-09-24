/**
 * Minimal JSX tag scanner for source-level guard tests.
 *
 * A regex like `<Button([^>]*)>` stops at the ">" of an arrow function in
 * `onClick={() => …}` — the guard for unnamed icon buttons missed exactly
 * those buttons. This scanner tracks braces and quotes to find the real end
 * of the opening tag.
 */

export interface JsxElement {
  /** Attribute source of the opening tag */
  attrs: string;
  /** Source between opening and closing tag ("" for self-closing tags) */
  inhalt: string;
  /** Offset of "<" in the source */
  start: number;
  /** Offset just after the closing tag */
  ende: number;
}

function endeDesOeffnungstags(quelle: string, ab: number): { ende: number; selbstschliessend: boolean } | null {
  let tiefe = 0;
  let quote: string | null = null;
  for (let i = ab; i < quelle.length; i++) {
    const c = quelle[i];
    if (quote) {
      if (c === quote && quelle[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") tiefe++;
    else if (c === "}") tiefe--;
    else if (c === ">" && tiefe === 0) return { ende: i, selbstschliessend: quelle[i - 1] === "/" };
  }
  return null;
}

export function jsxElemente(quelle: string, tag: string): JsxElement[] {
  const out: JsxElement[] = [];
  const oeffnen = new RegExp(`<${tag}(?=[\\s>/])`, "g");
  let m: RegExpExecArray | null;
  while ((m = oeffnen.exec(quelle))) {
    const kopf = endeDesOeffnungstags(quelle, m.index + tag.length + 1);
    if (!kopf) break;
    const attrs = quelle.slice(m.index + tag.length + 1, kopf.selbstschliessend ? kopf.ende - 1 : kopf.ende);
    if (kopf.selbstschliessend) {
      out.push({ attrs, inhalt: "", start: m.index, ende: kopf.ende + 1 });
      continue;
    }
    const schluss = quelle.indexOf(`</${tag}>`, kopf.ende);
    if (schluss < 0) break;
    out.push({ attrs, inhalt: quelle.slice(kopf.ende + 1, schluss), start: m.index, ende: schluss + tag.length + 3 });
  }
  return out;
}
