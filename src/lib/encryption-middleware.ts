/**
 * Prisma Encryption Extension
 *
 * Automatically encrypts bank data fields before writing to the database
 * and decrypts them after reading. This is transparent to the application -
 * API routes and business logic work with plaintext values.
 *
 * Encrypted models and fields:
 * - Person: bankIban, bankBic, bankName
 * - Tenant: iban, bic, bankName
 *
 * Uses the existing AES-256-GCM encryption from @/lib/email/encryption.
 * Implemented as a Prisma Client Extension (compatible with Prisma v5+/v6+).
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { encrypt, decrypt, isEncrypted } from "@/lib/email/encryption";
import { dbLogger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Configuration: which fields on which models should be encrypted
// ---------------------------------------------------------------------------

const PERSON_ENCRYPTED_FIELDS = ["bankIban", "bankBic", "bankName"] as const;
const TENANT_ENCRYPTED_FIELDS = ["iban", "bic", "bankName"] as const;

// ---------------------------------------------------------------------------
// Helper: encrypt a single field value
// ---------------------------------------------------------------------------

function encryptField(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  if (value === "") return value;

  // Do not double-encrypt
  if (isEncrypted(value)) return value;

  try {
    return encrypt(value);
  } catch (error) {
    dbLogger.error({ err: error }, "Failed to encrypt field value");
    return value;
  }
}

// ---------------------------------------------------------------------------
// Helper: decrypt a single field value
// ---------------------------------------------------------------------------

function decryptField(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  if (value === "") return value;

  // Only decrypt values that look encrypted
  if (!isEncrypted(value)) return value;

  try {
    return decrypt(value);
  } catch (error) {
    dbLogger.error({ err: error }, "Failed to decrypt field value, returning raw value");
    return value;
  }
}

// ---------------------------------------------------------------------------
// Helper: encrypt all relevant fields in a data object
// ---------------------------------------------------------------------------

function encryptFields(
  data: Record<string, unknown> | undefined,
  fields: readonly string[]
): Record<string, unknown> | undefined {
  if (!data) return data;

  const result = { ...data };
  for (const field of fields) {
    if (field in result) {
      result[field] = encryptField(result[field]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helper: decrypt all relevant fields in a result object (single record)
// ---------------------------------------------------------------------------

function decryptRecord<T>(record: T, fields: readonly string[]): T {
  if (!record || typeof record !== "object") return record;

  const obj = record as Record<string, unknown>;
  const result = { ...obj };
  for (const field of fields) {
    if (field in result) {
      result[field] = decryptField(result[field]);
    }
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// Helper: decrypt results (single record or array)
// ---------------------------------------------------------------------------

function decryptResults<T>(results: T, fields: readonly string[]): T {
  if (results === null || results === undefined) return results;

  if (Array.isArray(results)) {
    return results.map((record) => decryptRecord(record, fields)) as T;
  }

  if (typeof results === "object") {
    return decryptRecord(results, fields);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helper: encrypt data arguments for write operations
// ---------------------------------------------------------------------------

function encryptWriteArgs(
  args: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const result = { ...args };

  // Standard create/update: data field
  if (result.data && typeof result.data === "object") {
    result.data = encryptFields(result.data as Record<string, unknown>, fields);
  }

  // Upsert: create and update fields
  if (result.create && typeof result.create === "object") {
    result.create = encryptFields(result.create as Record<string, unknown>, fields);
  }
  if (result.update && typeof result.update === "object") {
    result.update = encryptFields(result.update as Record<string, unknown>, fields);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: encrypt data arguments for createMany operations
// ---------------------------------------------------------------------------

function encryptCreateManyArgs(
  args: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const result = { ...args };

  if (result.data) {
    if (Array.isArray(result.data)) {
      result.data = result.data.map((item: unknown) =>
        encryptFields(item as Record<string, unknown>, fields)
      );
    } else if (typeof result.data === "object") {
      result.data = encryptFields(result.data as Record<string, unknown>, fields);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build model-specific query hooks for a given set of encrypted fields
// ---------------------------------------------------------------------------

function buildModelQueryHooks(fields: readonly string[]) {
  return {
    // --- READ operations: decrypt after reading ---

    async findFirst({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const result = await query(args);
      return decryptResults(result, fields);
    },

    async findFirstOrThrow({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const result = await query(args);
      return decryptResults(result, fields);
    },

    async findUnique({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const result = await query(args);
      return decryptResults(result, fields);
    },

    async findUniqueOrThrow({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const result = await query(args);
      return decryptResults(result, fields);
    },

    async findMany({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const result = await query(args);
      return decryptResults(result, fields);
    },

    // --- WRITE operations: encrypt before saving, decrypt the returned record ---

    async create({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const encryptedArgs = encryptWriteArgs(args, fields);
      const result = await query(encryptedArgs);
      return decryptResults(result, fields);
    },

    async update({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const encryptedArgs = encryptWriteArgs(args, fields);
      const result = await query(encryptedArgs);
      return decryptResults(result, fields);
    },

    async upsert({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const encryptedArgs = encryptWriteArgs(args, fields);
      const result = await query(encryptedArgs);
      return decryptResults(result, fields);
    },

    async createMany({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const encryptedArgs = encryptCreateManyArgs(args, fields);
      return query(encryptedArgs);
    },

    async updateMany({ args, query }: { args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }) {
      const encryptedArgs = encryptWriteArgs(args, fields);
      return query(encryptedArgs);
    },
  };
}

// ---------------------------------------------------------------------------
// Main: create a Prisma Client Extension with encryption support
// ---------------------------------------------------------------------------

export function withEncryption(prisma: PrismaClient) {
  return prisma.$extends({
    name: "bank-data-encryption",
    query: {
      person: buildModelQueryHooks(PERSON_ENCRYPTED_FIELDS) as unknown as Record<string, (params: { args: Prisma.Args<typeof prisma.person, "findFirst">; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>>,
      tenant: buildModelQueryHooks(TENANT_ENCRYPTED_FIELDS) as unknown as Record<string, (params: { args: Prisma.Args<typeof prisma.tenant, "findFirst">; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>>,
    },
  });
}
