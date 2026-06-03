/**
 * Path-Traversal-Schutz für Dateipfade die aus User-Input oder DB-Spalten
 * (welche selbst aus User-Input befüllt wurden) stammen.
 *
 * Hintergrund: Auch wenn Admin-User Pfade in der DB setzen können, dürfen
 * sie damit nicht aus dem erlaubten Basisverzeichnis ausbrechen (z.B.
 * `..\..\..\.env` lesen).
 */

import path from "path";

export class UnsafePathError extends Error {
  constructor(message: string, public readonly input: string) {
    super(message);
    this.name = "UnsafePathError";
  }
}

/**
 * Whitelist-Validierung eines relativen Pfads VOR `path.resolve`.
 * Lehnt ab:
 *  - `..` Segmente (Path-Traversal)
 *  - Drive-Letter (`C:`, Windows)
 *  - Absolute Pfade (führendes `/` oder `\`)
 *  - URL-Encoded-Traversal (`%2e%2e`, `%2f`, `%5c`)
 *  - NUL-Bytes (`\0`)
 */
export function assertSafeRelativePath(input: string): void {
  if (!input || typeof input !== "string") {
    throw new UnsafePathError("Pfad fehlt oder ist kein String", String(input));
  }

  // NUL-Byte ist immer ein Angriff
  if (input.includes("\0")) {
    throw new UnsafePathError("Pfad enthält NUL-Byte", input);
  }

  // URL-Encoded-Traversal-Versuche
  const lower = input.toLowerCase();
  if (lower.includes("%2e%2e") || lower.includes("%2f") || lower.includes("%5c")) {
    throw new UnsafePathError("Pfad enthält URL-encoded Traversal-Sequenzen", input);
  }

  // Drive-Letter (Windows): `C:`, `D:\…`
  if (/^[a-zA-Z]:/.test(input)) {
    throw new UnsafePathError("Pfad enthält Drive-Letter", input);
  }

  // Absolute Pfade (führendes / oder \) sind nicht erlaubt
  if (input.startsWith("/") || input.startsWith("\\")) {
    throw new UnsafePathError("Absoluter Pfad nicht erlaubt", input);
  }

  // Segmente prüfen — auf beiden Trennzeichen splitten
  const segments = input.split(/[\\/]+/);
  for (const seg of segments) {
    if (seg === "..") {
      throw new UnsafePathError("Pfad enthält Traversal-Segment (..)", input);
    }
  }
}

/**
 * Sicheres Joinen mit Basis-Verzeichnis: validiert + resolved + prüft,
 * dass das Ergebnis tatsächlich unter `baseDir` liegt.
 *
 * Wirft `UnsafePathError` bei Verstoss — Caller MUSS abfangen und 400 zurückgeben.
 *
 * @example
 *   const publicDir = path.resolve(process.cwd(), "public");
 *   const safeLocal = safeJoin(publicDir, document.fileUrl);
 */
export function safeJoin(baseDir: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);

  const baseResolved = path.resolve(baseDir);
  const joined = path.resolve(baseResolved, relativePath);

  // Belt-and-suspenders: nach resolve nochmal prüfen, dass wir im baseDir sind.
  // Trailing separator nötig, damit `/public-evil` nicht als unter `/public` zählt.
  const baseWithSep = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  if (joined !== baseResolved && !joined.startsWith(baseWithSep)) {
    throw new UnsafePathError(
      `Resolved path liegt ausserhalb des Basis-Verzeichnisses (${baseResolved})`,
      relativePath,
    );
  }

  return joined;
}

/**
 * Convenience-Wrapper: joined unter dem `public/`-Verzeichnis im CWD.
 */
export function safeJoinPublic(relativePath: string): string {
  const publicDir = path.resolve(process.cwd(), "public");
  return safeJoin(publicDir, relativePath);
}
