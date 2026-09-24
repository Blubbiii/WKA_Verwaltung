/**
 * Validation message for the user: German, with the field it concerns.
 *
 * Zod speaks English by default and `issues[0].message` names no field —
 * "Too big: expected string to have <=11 characters" left the user guessing.
 * Importing this module switches zod to German (z.config is global per
 * module instance); instrumentation.ts does the same at server start.
 */

import { z } from "zod";

z.config(z.locales.de());

export function zodMeldung(fehler: z.ZodError, ersatz = "Ungültige Eingabe"): string {
  const issue = fehler.issues[0];
  if (!issue) return ersatz;
  const feld = issue.path.map(String).join(".");
  if (feld) return `${feld}: ${issue.message}`;
  // A root-level issue ("expected string") says little on its own.
  return issue.message ? `${ersatz}: ${issue.message}` : ersatz;
}
