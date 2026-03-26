import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
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
  pgPool: Pool | undefined;
};

function createPrismaClient() {
  // Pool as singleton — reused across hot-reloads in development
  const pool = globalForPrisma.pgPool ?? new Pool({
    connectionString: process.env.DATABASE_URL!,
  });
  globalForPrisma.pgPool = pool;

  // Prisma 7 + pg driver adapter: queries bypass the Prisma query engine,
  // so $on("query") events do not fire. Use $extends with a query extension
  // for instrumentation instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any);

  const baseClient = new PrismaClient({
    adapter,
    log: ["error"],
  });

  // Slow query logging via Prisma 7 Extension API (works with driver adapters)
  const clientWithLogging =
    process.env.NODE_ENV === "development"
      ? baseClient.$extends({
          query: {
            $allModels: {
              async $allOperations({ model, operation, args, query }) {
                const start = Date.now();
                const result = await query(args);
                const duration = Date.now() - start;
                if (duration > 100) {
                  logger.warn(
                    `[SLOW QUERY] ${duration}ms: ${model}.${operation}`
                  );
                }
                return result;
              },
            },
          },
        })
      : baseClient;

  // Apply automatic bank data encryption/decryption extension
  return withEncryption(clientWithLogging as unknown as PrismaClient);
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
