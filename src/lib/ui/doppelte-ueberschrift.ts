/**
 * Finds a CardTitle that repeats the PageHeader title of the same page —
 * resolved through the German message file, because the keys differ
 * ("title" vs "table.title") while the words are the same.
 */

type Nachrichten = Record<string, unknown>;

function wert(nachrichten: Nachrichten, pfad: string): string | undefined {
  let knoten: unknown = nachrichten;
  for (const teil of pfad.split(".")) {
    if (!knoten || typeof knoten !== "object") return undefined;
    knoten = (knoten as Record<string, unknown>)[teil];
  }
  return typeof knoten === "string" ? knoten : undefined;
}

/** Namespace per translator variable: const t = useTranslations("a.b"). */
function namensraeume(quelle: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of quelle.matchAll(/const (\w+) = useTranslations\("([^"]+)"\)/g)) m.set(x[1], x[2]);
  return m;
}

/** Resolves {t("key")} or a plain string literal to its German text. */
function aufloesen(ausdruck: string, ns: Map<string, string>, de: Nachrichten): string | undefined {
  const aufruf = ausdruck.match(/^\{?\s*(\w+)\("([^"]+)"\)\s*\}?$/);
  if (aufruf) {
    const raum = ns.get(aufruf[1]);
    return raum ? wert(de, `${raum}.${aufruf[2]}`) : undefined;
  }
  const literal = ausdruck.match(/^"([^"]+)"$/) ?? ausdruck.match(/^([^{}<>"]+)$/);
  return literal ? literal[1].trim() : undefined;
}

const norm = (s: string) => s.trim().toLocaleLowerCase("de");

export function doppelteUeberschriften(quelle: string, de: Nachrichten): string[] {
  const ns = namensraeume(quelle);
  // Page heading: <PageHeader title=…> or a plain <h1>…</h1>.
  const kopf =
    quelle.match(/<PageHeader[\s\S]*?\btitle=(\{[^}]*\}|"[^"]*")/)?.[1] ??
    quelle.match(/<h1\b[^>]*>([^<]*)<\/h1>/)?.[1];
  if (!kopf) return [];
  const seitentitel = aufloesen(kopf, ns, de);
  if (!seitentitel) return [];
  const funde: string[] = [];
  for (const k of quelle.matchAll(/<CardTitle\b[^>]*>([\s\S]*?)<\/CardTitle>/g)) {
    // Ignore icons and whitespace inside the title.
    const inhalt = k[1].replace(/<[A-Z]\w*[^>]*\/>/g, "").trim();
    const text = aufloesen(inhalt, ns, de);
    if (text && norm(text) === norm(seitentitel)) {
      funde.push(`Zeile ${quelle.slice(0, k.index).split("\n").length}: "${text}"`);
    }
  }
  return funde;
}
