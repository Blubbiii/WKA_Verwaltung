/**
 * Recursively convert Prisma Decimal and BigInt values to plain numbers.
 * Use this before passing Prisma results to NextResponse.json().
 */
export function serializePrisma<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj) as unknown as T;
  if (obj instanceof Date) return obj.toISOString() as unknown as T;

  // Prisma Decimal: duck-type check (instanceof can fail across module boundaries)
  if (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as Record<string, unknown>).toFixed === "function" &&
    typeof (obj as Record<string, unknown>).toNumber === "function"
  ) {
    return (obj as unknown as { toNumber: () => number }).toNumber() as unknown as T;
  }

  if (Array.isArray(obj)) return obj.map(serializePrisma) as unknown as T;

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializePrisma(value);
    }
    return result as T;
  }
  return obj;
}
