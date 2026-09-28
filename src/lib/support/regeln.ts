/**
 * Pure rules of the support access (2026-09) — no server imports, usable
 * in the UI too. The database side lives in ./zugang.
 */

export type Laufzeit = "1h" | "1d" | "7d";

const STUNDE = 60 * 60 * 1000;
const LAUFZEIT_MS: Record<Laufzeit, number> = { "1h": STUNDE, "1d": 24 * STUNDE, "7d": 7 * 24 * STUNDE };
export const NOTFALL_DAUER_MS = STUNDE;

export function gueltigBisFuer(laufzeit: Laufzeit, jetzt: Date = new Date()): Date {
  return new Date(jetzt.getTime() + LAUFZEIT_MS[laufzeit]);
}

export function istAktiv(z: { gueltigBis: Date; beendetAm: Date | null }, jetzt: Date = new Date()): boolean {
  return z.beendetAm === null && z.gueltigBis.getTime() > jetzt.getTime();
}

export function zugangErlaubt(l: { mitglied: boolean; superadmin: boolean; supportAktiv: boolean }): boolean {
  return l.mitglied || (l.superadmin && l.supportAktiv);
}
