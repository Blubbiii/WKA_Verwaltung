/**
 * Priority scale of operational tasks (and optimization measures, which are
 * tasks too). Stored as Int in OperationalTask.priority: 1 is the highest.
 */
export const PRIORITAETEN = [
  { wert: 1, label: "Hoch", farbe: "bg-red-100 text-red-800" },
  { wert: 2, label: "Normal", farbe: "bg-blue-100 text-blue-700" },
  { wert: 3, label: "Niedrig", farbe: "bg-gray-100 text-gray-700" },
] as const;

export const STANDARD_PRIORITAET = 2;

export function prioritaet(wert: number) {
  return PRIORITAETEN.find((p) => p.wert === wert);
}
