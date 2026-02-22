import { Prisma, PrismaClient } from "@prisma/client";
import { withEncryption } from "@/lib/encryption-middleware";
import { logger } from "@/lib/logger";

// Make BigInt JSON-serializable globally (Prisma returns BigInt for BigInt columns)
// eslint-disable-next-line no-extend-native
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
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
