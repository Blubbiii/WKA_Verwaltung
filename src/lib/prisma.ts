import { Prisma, PrismaClient } from "@prisma/client";
import { withEncryption } from "@/lib/encryption-middleware";
import { logger } from "@/lib/logger";

// Make BigInt JSON-serializable globally (Prisma returns BigInt for BigInt columns)
// eslint-disable-next-line no-extend-native
(BigInt.prototype as unknown as { toJSON: () => number | string }).toJSON = function () {
  const n = Number(this);
  if (n > Number.MAX_SAFE_INTEGER || n < Number.MIN_SAFE_INTEGER) {
    return this.toString();
  }
  return n;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof withEncryption> | undefined;
};

function createPrismaClient() {
  const baseClient = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : ["error"],
  });

  // Log slow database queries in development
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (baseClient as unknown as { $on: (event: string, callback: (e: Prisma.QueryEvent) => void) => void }).$on("query", (e: Prisma.QueryEvent) => {
      if (e.duration > 100) {
        logger.warn(
          `[SLOW QUERY] ${e.duration}ms: ${e.query?.substring(0, 200)}`
        );
      }
    });
  }

  // Apply automatic bank data encryption/decryption extension
  return withEncryption(baseClient);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Type-safe dynamic model accessor
// Replaces `prisma as any` patterns for dynamic model access by name.

/** Prisma model delegate shape for type-safe dynamic access */
export interface PrismaModelDelegate {
  findMany: (args?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findFirst: (args?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  findUnique: (args?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  delete: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

/**
 * Known Prisma model names that can be accessed dynamically.
 * Add model names here as they are used with getPrismaModel().
 */
type DynamicModelName = "systemConfig" | "emailTemplate" | "massCommunication";

/**
 * Type-safe accessor for Prisma model delegates by name.
 * Only allows known model names (see DynamicModelName).
 */
export function getPrismaModel(name: DynamicModelName): PrismaModelDelegate {
  return (prisma as unknown as Record<string, PrismaModelDelegate>)[name];
}

/**
 * Check if a Prisma model exists (safe for models that may not have been generated yet).
 */
export function hasPrismaModel(name: string): boolean {
  return name in prisma && !name.startsWith("$");
}
