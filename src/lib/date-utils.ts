/**
 * Overflow-safe date arithmetic.
 *
 * Background: `Date.prototype.setMonth()` / `setFullYear()` mutate ONE field
 * while the day-of-month of the *source* date is still in place. Calling
 * `setMonth(+1)` on 2026-01-31 therefore asks for "February 31st", which
 * JavaScript silently rolls over to 2026-03-03. A subsequent `setDate(1)`
 * then lands on 2026-03-01 instead of 2026-02-01 — a whole month is skipped.
 *
 * Every helper here writes year/month/day in a SINGLE `setFullYear(y, m, d)`
 * call (which is atomic and does not roll over between the components) and
 * clamps the day against the real length of the target month.
 *
 * Time-of-day (hours/minutes/seconds/ms) is always preserved.
 */

/**
 * Number of days in the given month.
 * @param year  full year (e.g. 2026)
 * @param monthIndex 0-based month (0 = January, 11 = December)
 */
export function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of month+1 === last day of `monthIndex`. The Date constructor
  // normalises monthIndex === 12 into January of year+1 by itself.
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Adds (or, with a negative value, subtracts) whole months without ever
 * rolling over into the following month.
 *
 * @param date      base date (not mutated)
 * @param months    number of months to add; may be negative
 * @param targetDay optional day-of-month to land on. Defaults to the day of
 *                  `date`. Clamped to [1, daysInMonth(target month)].
 *
 * @example addMonthsSafe(new Date(2026, 0, 31), 1)     // 2026-02-28
 * @example addMonthsSafe(new Date(2026, 0, 31), 1, 15) // 2026-02-15
 */
export function addMonthsSafe(date: Date, months: number, targetDay?: number): Date {
  const result = new Date(date.getTime());

  const totalMonths = result.getMonth() + months;
  const targetYear = result.getFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  const wantedDay = targetDay ?? result.getDate();
  const clampedDay = clampDay(wantedDay, targetYear, targetMonth);

  result.setFullYear(targetYear, targetMonth, clampedDay);
  return result;
}

/**
 * Adds (or subtracts) whole years without rolling over.
 * 29.02. in a leap year becomes 28.02. in a non-leap year (not 01.03.).
 *
 * @example addYearsSafe(new Date(2024, 1, 29), 1) // 2025-02-28
 */
export function addYearsSafe(date: Date, years: number, targetDay?: number): Date {
  const result = new Date(date.getTime());

  const targetYear = result.getFullYear() + years;
  const targetMonth = result.getMonth();
  const wantedDay = targetDay ?? result.getDate();

  result.setFullYear(targetYear, targetMonth, clampDay(wantedDay, targetYear, targetMonth));
  return result;
}

/**
 * Moves the date to an absolute month of the SAME year (or of `year` when
 * given) without rolling over.
 *
 * Needed wherever code says "next run is in April/July/January" instead of
 * "+N months" — `setMonth(3)` on a 31st has exactly the same overflow bug.
 *
 * @example setMonthSafe(new Date(2026, 0, 31), 3, 1) // 2026-04-01
 */
export function setMonthSafe(
  date: Date,
  monthIndex: number,
  targetDay?: number,
  year?: number,
): Date {
  const result = new Date(date.getTime());

  const targetYear = year ?? result.getFullYear();
  const wantedDay = targetDay ?? result.getDate();

  result.setFullYear(targetYear, monthIndex, clampDay(wantedDay, targetYear, monthIndex));
  return result;
}

/**
 * Sets the day-of-month, clamped to the length of the current month.
 * `setDayOfMonthSafe(new Date(2026, 1, 10), 31)` → 2026-02-28, not 2026-03-03.
 */
export function setDayOfMonthSafe(date: Date, day: number): Date {
  const result = new Date(date.getTime());
  const year = result.getFullYear();
  const month = result.getMonth();

  result.setFullYear(year, month, clampDay(day, year, month));
  return result;
}

function clampDay(day: number, year: number, monthIndex: number): number {
  const max = daysInMonth(year, monthIndex);
  if (!Number.isFinite(day)) return 1;
  return Math.min(Math.max(Math.trunc(day), 1), max);
}
