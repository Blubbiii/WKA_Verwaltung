/**
 * Kleine Helper für Query-String-Validierung.
 *
 * Motivation: 15+ API-Routes casten den Status aus `searchParams.get("status")`
 * direkt mit `as OperationalTaskStatus` (o.ä.) an Prisma weiter. Wenn ein User
 * `?status=DELETED` in die URL schreibt, kommt das ohne Fehler bei Prisma an
 * und produziert entweder eine leere Liste (im besten Fall) oder einen
 * verwirrenden Runtime-Error.
 *
 * `enumParam` fungiert als schmaler Guard: nur Werte aus der `allowed`-Liste
 * werden durchgelassen, alles andere wird zu `undefined` — sicher zu droppen
 * per Prisma-Spread `{ ...(status && { status }) }`.
 */

/**
 * Parse a query-string value against an allowed enum list.
 *
 * @param value  Raw `searchParams.get(...)` result — String oder null.
 * @param allowed Whitelist zulässiger Werte (Prisma-Enum, Union-Literal, ...).
 * @returns Der Wert, wenn er in `allowed` ist — sonst `undefined`.
 *
 * @example
 *   const status = enumParam(searchParams.get("status"), ["OPEN", "DONE"] as const);
 *   if (status) where.status = status;   // typisiert, kein Cast nötig
 */
export function enumParam<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
