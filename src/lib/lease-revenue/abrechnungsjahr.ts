/**
 * Is the settlement year before the park's commissioning year?
 *
 * Revenue phases count operating years from 1; a year before commissioning is
 * operating year 0 and cannot be settled. The wizard checks this in step 1
 * instead of failing in step 3 after it has already stored revenue data.
 */

import { calendarDay } from "@/lib/validation/not-in-future";

export function jahrVorInbetriebnahme(
  jahr: number,
  inbetriebnahme: string | Date | null | undefined,
): boolean {
  if (!inbetriebnahme) return false;
  const datum = new Date(inbetriebnahme);
  if (Number.isNaN(datum.getTime())) return false;
  // Calendar year in Berlin, like every other business date here
  return jahr < Number(calendarDay(datum).slice(0, 4));
}
