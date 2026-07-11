/**
 * Boot-time environment validation.
 *
 * Zod schema for the truly critical process.env vars.  Missing/malformed
 * values throw here rather than surfacing as confusing runtime errors
 * deeper in the stack (Non-null-assertion in prisma.ts was the trigger).
 *
 * Scope: only vars WITHOUT a sensible default. Non-critical envs (SMTP,
 * S3, feature flags, ...) are handled by `src/lib/config/index.ts` via
 * `envFallback` and should stay there.
 *
 * Import order:
 *   - `src/instrumentation.ts` imports this module at boot for fail-fast.
 *   - `src/lib/prisma.ts` imports `env.DATABASE_URL` instead of the
 *     `process.env.DATABASE_URL!` non-null-assertion.
 *
 * This module is server-only (references DATABASE_URL / AUTH_SECRET
 * which are NOT exposed to the client).  Do not import from client
 * components.
 */

import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    // NextAuth v5 supports either name — at least one must be present.
    AUTH_SECRET: z.string().min(1).optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional(),
    // Redis is optional (falls back to localhost via config/redis.ts),
    // but if present it must be non-empty.
    REDIS_URL: z.string().min(1).optional(),
    // Public app URL (used in emails, callbacks) — optional, empty string tolerated.
    NEXT_PUBLIC_APP_URL: z.union([z.url(), z.literal("")]).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("production"),
  })
  .refine((v) => Boolean(v.AUTH_SECRET || v.NEXTAUTH_SECRET), {
    message: "Either AUTH_SECRET or NEXTAUTH_SECRET must be set",
    path: ["AUTH_SECRET"],
  });

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    console.error(`[env] Invalid environment variables:\n${issues}`);
    throw new Error(
      "Invalid environment configuration - see stderr for details.",
    );
  }
  return result.data;
}

/**
 * Validated environment variables. Access via `env.DATABASE_URL`, etc.
 * Fails fast at module load if required vars are missing.
 */
export const env: Env = parseEnv();
