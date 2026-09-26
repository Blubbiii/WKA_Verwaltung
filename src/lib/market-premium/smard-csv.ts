/**
 * Reads SMARD wholesale price downloads (smard.de → Großhandelspreise, CSV)
 * into the hourly series POST /api/energy/spot-prices expects.
 *
 * Two layouts exist:
 *   - since the 15-minute day-ahead market (Oct 2025):
 *       "Datum von;Datum bis;Deutschland/Luxemburg [€/MWh] …"
 *       01.09.2026 00:15;01.09.2026 00:30;85,12
 *   - older hourly downloads:
 *       "Datum;Anfang;Ende;Deutschland/Luxemburg [€/MWh] …"
 *       15.01.2024;00:00;01:00;39,01
 *
 * Times are German local time. They are converted to UTC; in the repeated
 * hour of the autumn switch the second occurrence is winter time.
 *
 * Quarter-hours are averaged per hour, because the stored series and the
 * negative-hour rule in lib/market-premium work on hours. The caller shows
 * `viertelstunden` so this is never silent.
 */

import { ausBerlin, berlinTeile } from "@/lib/zeit/berlin";

export interface SmardErgebnis {
  preise: { hour: string; priceEurMwh: number }[];
  /** True when the file had quarter-hours that were averaged. */
  viertelstunden: boolean;
  /** Rows without a price ("-") — gaps, not zeros. */
  luecken: number;
  spalte: string;
}

const STUNDE_MS = 3_600_000;

function zahl(text: string): number | null {
  const t = text.trim();
  if (!t || t === "-") return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function zeitpunkt(datum: string, uhrzeit: string): { y: number; m: number; d: number; h: number; min: number } | null {
  const dm = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(datum.trim());
  const um = /^(\d{2}):(\d{2})$/.exec(uhrzeit.trim());
  if (!dm || !um) return null;
  return { d: +dm[1], m: +dm[2], y: +dm[3], h: +um[1], min: +um[2] };
}

export function leseSmardCsv(text: string): SmardErgebnis {
  const zeilen = text.replace(/^﻿/, "").split(/\r?\n/).filter((z) => z.trim());
  if (zeilen.length < 2) throw new Error("Die Datei enthält keine Preiszeilen.");

  const kopf = zeilen[0].split(";");
  const spalte = kopf.findIndex((k) => k.includes("Deutschland/Luxemburg"));
  if (spalte < 0) {
    throw new Error("Keine Spalte „Deutschland/Luxemburg [€/MWh]“ gefunden — ist das ein SMARD-Großhandelspreis-Download?");
  }
  // "Datum von" carries date and time in one cell; the old layout splits them.
  const kombiniert = /datum von/i.test(kopf[0]);

  const summen = new Map<number, { summe: number; anzahl: number }>();
  let luecken = 0;
  let vorher = -Infinity;

  for (const zeile of zeilen.slice(1)) {
    const zellen = zeile.split(";");
    const [datum, uhrzeit] = kombiniert ? (zellen[0] ?? "").trim().split(/\s+/) : [zellen[0], zellen[1]];
    const t = zeitpunkt(datum ?? "", uhrzeit ?? "");
    if (!t) continue;

    let utc = ausBerlin(t.y, t.m, t.d, t.h, t.min).getTime();
    // At the autumn switch the local hour 02:xx exists twice. Take the
    // earlier (summer time) instant first, the later one on the repeat.
    const frueher = utc - STUNDE_MS;
    const f = berlinTeile(new Date(frueher));
    if (f.d === t.d && f.h === t.h && f.min === t.min && frueher > vorher) utc = frueher;
    if (utc <= vorher) utc += STUNDE_MS;
    vorher = utc;

    const preis = zahl(zellen[spalte] ?? "");
    if (preis === null) {
      luecken++;
      continue;
    }
    const stunde = Math.floor(utc / STUNDE_MS) * STUNDE_MS;
    const eintrag = summen.get(stunde) ?? { summe: 0, anzahl: 0 };
    eintrag.summe += preis;
    eintrag.anzahl += 1;
    summen.set(stunde, eintrag);
  }

  const preise = [...summen.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stunde, { summe, anzahl }]) => ({
      hour: new Date(stunde).toISOString(),
      priceEurMwh: Math.round((summe / anzahl) * 100) / 100,
    }));

  return {
    preise,
    viertelstunden: [...summen.values()].some((e) => e.anzahl > 1),
    luecken,
    spalte: kopf[spalte].trim(),
  };
}
