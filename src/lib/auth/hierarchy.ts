/**
 * RANGSTUFEN DER ROLLEN
 * ======================
 *
 * Höhere Zahl = mehr Befugnis. Die Stufen ersetzen die alten
 * `UserRole`-Enum-Abfragen.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Die Konstante stand in `permissions.ts`. Die Datei zieht über `auth()` das
 * halbe next-auth mit sich — wer nur die Zahl 100 braucht, bekam den ganzen
 * Anmeldeapparat dazu und konnte sie in einem Unit-Test gar nicht laden.
 *
 * Aufgefallen ist das beim Wächter für die Berechtigungs-Matrix: er soll
 * festhalten, dass die Bypass-Grenze im Export dieselbe ist wie in der
 * Rechteprüfung — und scheiterte daran, dass sich die Grenze nicht ohne
 * Datenbank und Sitzung importieren liess.
 *
 * `permissions.ts` exportiert sie weiterhin. Bestehende Importe bleiben
 * gültig; es gibt nur nicht mehr zwei Definitionen.
 */

/**
 * Rangstufen für rollenbasierte Prüfungen.
 *
 * **100 ist besonders:** ab dieser Stufe gibt `requirePermission()` frei, ohne
 * irgendein Recht zu prüfen (`withPermission.ts`). Eine Rolle auf dieser Stufe
 * darf alles — unabhängig davon, was ihr zugewiesen ist. Wer die Zahl ändert,
 * ändert damit auch, was die exportierte Berechtigungs-Matrix zeigt; der
 * Wächter `effektive-rechte.test.ts` besteht darauf, dass beide dasselbe
 * meinen.
 */
export const ROLE_HIERARCHY = {
  SUPERADMIN: 100,
  ADMIN: 80,
  MANAGER: 60,
  MITARBEITER: 50,
  NUR_LESEN: 40,
  PORTAL: 20,
} as const;
