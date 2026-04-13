/**
 * Time constants in milliseconds.
 *
 * Use these instead of hand-rolled `1000 * 60 * 60 * 24` multiplications.
 * The named constants make intent obvious and eliminate arithmetic typos.
 */

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Compute whole days between two timestamps (flooring).
 * Returns 0 if `to` is before `from`.
 */
export function daysBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / MS_PER_DAY);
}
