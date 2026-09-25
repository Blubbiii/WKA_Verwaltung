/**
 * prisma/seed.ts muss sich übersetzen lassen.
 *
 * Beim Ausbau der Buchhaltung wurden aus seedLedgerAccounts nur die
 * Prisma-Aufrufe gestrichen; übrig blieb `for (…) { where: … }` und ein Import
 * von AccountCategory/TaxBehavior, die es im Schema nicht mehr gibt. `tsc`
 * prüft den Seed nicht (tsconfig schließt prisma/ aus) — aufgefallen wäre es
 * erst beim Einrichten einer frischen Datenbank.
 */

import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("prisma/seed.ts", () => {
  it("übersetzt ohne Fehler gegen den generierten Prisma-Client", () => {
    const datei = join(process.cwd(), "prisma", "seed.ts");
    const programm = ts.createProgram([datei], {
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      strict: false,
      types: ["node"],
    });
    const fehler = ts
      .getPreEmitDiagnostics(programm)
      .filter((d) => d.file?.fileName.replace(/\\/g, "/").endsWith("prisma/seed.ts"))
      .map((d) => {
        const zeile = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
        return `Zeile ${zeile}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
      });
    expect(fehler).toEqual([]);
  }, 120_000);
});
