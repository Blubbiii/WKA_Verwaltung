/**
 * Vitest-Setup: minimale Environment-Variablen für Unit-Tests.
 *
 * Hintergrund: `src/lib/env.ts` validiert die kritischen Env-Vars beim Import
 * und wirft bei fehlenden Werten (Fail-Fast beim Boot). `src/lib/prisma.ts`
 * importiert es — damit reißt jeder Test, der irgendwo transitiv Prisma
 * importiert, schon beim Laden ab, obwohl er gar keine DB braucht.
 *
 * Vitest lädt `.env` nicht in `process.env`, deshalb werden hier
 * Platzhalter gesetzt. Es wird KEINE Verbindung aufgebaut — die Werte müssen
 * nur das Zod-Schema erfüllen.
 *
 * Wer einen Integrationstest gegen eine echte DB schreibt, überschreibt
 * DATABASE_URL vorher in der eigenen Testdatei oder per CI-Env.
 */

// NODE_ENV setzt Vitest selbst auf "test" — das Zod-Schema akzeptiert das.
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/wpm_test?schema=public";
process.env.AUTH_SECRET ??= "test-secret-not-used-for-real-signing";
