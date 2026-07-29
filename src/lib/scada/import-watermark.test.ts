import { describe, it, expect } from 'vitest';
import { computeContiguousWatermark } from './import-service';
import { localMonthStartUtc, localYearMonth } from './aggregation';

const d = (iso: string) => new Date(iso);

describe('computeContiguousWatermark', () => {
  it('gibt null zurück, wenn keine Datei erfolgreich war', () => {
    expect(computeContiguousWatermark([], [])).toBeNull();
    expect(computeContiguousWatermark([], [d('2026-01-01T00:00:00Z')])).toBeNull();
  });

  it('nimmt ohne Fehlschlag das größte erfolgreiche Datum', () => {
    const result = computeContiguousWatermark(
      [d('2026-01-01T00:00:00Z'), d('2026-01-03T00:00:00Z'), d('2026-01-02T00:00:00Z')],
      [],
    );
    expect(result?.toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });

  it('läuft NICHT über eine gescheiterte Datei hinaus', () => {
    // Tag 2 gescheitert, Tag 3 erfolgreich → Wasserzeichen bleibt bei Tag 1,
    // damit Tag 2 beim nächsten Lauf erneut versucht wird.
    const result = computeContiguousWatermark(
      [d('2026-01-01T00:00:00Z'), d('2026-01-03T00:00:00Z')],
      [d('2026-01-02T00:00:00Z')],
    );
    expect(result?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('gibt null zurück, wenn schon die erste Datei scheitert', () => {
    const result = computeContiguousWatermark(
      [d('2026-01-02T00:00:00Z')],
      [d('2026-01-01T00:00:00Z')],
    );
    expect(result).toBeNull();
  });

  it('behandelt einen Fehlschlag am selben Tag konservativ', () => {
    const result = computeContiguousWatermark(
      [d('2026-01-02T00:00:00Z')],
      [d('2026-01-02T00:00:00Z')],
    );
    expect(result).toBeNull();
  });
});

describe('localMonthStartUtc (Europe/Berlin)', () => {
  it('rechnet den Januar-Anfang mit Winterzeit-Offset (+1h) um', () => {
    expect(localMonthStartUtc(2026, 1).toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });

  it('rechnet den Juli-Anfang mit Sommerzeit-Offset (+2h) um', () => {
    expect(localMonthStartUtc(2026, 7).toISOString()).toBe('2026-06-30T22:00:00.000Z');
  });

  it('akzeptiert month = 13 als Januar des Folgejahres', () => {
    expect(localMonthStartUtc(2026, 13).toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});

describe('localYearMonth (Europe/Berlin)', () => {
  it('ordnet 01.01. 00:30 Ortszeit dem Januar zu (UTC wäre Dezember)', () => {
    // 2026-01-01 00:30 Berlin = 2025-12-31 23:30 UTC
    expect(localYearMonth(d('2025-12-31T23:30:00Z'))).toEqual({ year: 2026, month: 1 });
  });

  it('ordnet 31.12. 23:30 Ortszeit dem Dezember zu', () => {
    expect(localYearMonth(d('2025-12-31T22:30:00Z'))).toEqual({ year: 2025, month: 12 });
  });

  it('ordnet 01.07. 01:00 Sommerzeit dem Juli zu', () => {
    // 2026-07-01 01:00 Berlin (CEST) = 2026-06-30 23:00 UTC
    expect(localYearMonth(d('2026-06-30T23:00:00Z'))).toEqual({ year: 2026, month: 7 });
  });
});
