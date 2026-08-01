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

/**
 * Wird gerade gebaut statt ausgeführt?
 *
 * `next build` importiert beim „Collecting page data" jedes Route-Modul, um
 * dessen Metadaten zu ermitteln — und damit transitiv auch dieses hier. Ein
 * Image braucht zum BAUEN aber keine Datenbank: seine echte Umgebung bekommt
 * es erst bei `docker run`. Ein Wurf an dieser Stelle bricht deshalb den
 * Build, ohne über die Produktionskonfiguration irgendetwas auszusagen.
 *
 * `NEXT_PHASE` setzt Next selbst; `SKIP_ENV_VALIDATION` ist der ausdrückliche
 * Schalter, den das Dockerfile setzt — damit der Build nicht davon abhängt,
 * dass die Phasenerkennung greift.
 */
const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_ENV_VALIDATION === "1" ||
  process.env.SKIP_ENV_VALIDATION === "true";

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

  if (isBuildTime) {
    // Laut, aber nicht tödlich: niemand soll glauben, hier sei geprüft worden.
    // Die echte Prüfung läuft beim Start über `instrumentation.ts` — dort
    // liegen die Werte an, und dort ist ein Abbruch auch richtig.
    console.warn(
      `[env] Build-Zeit: Umgebungsprüfung übersprungen. Beim Start wird geprüft.\n${issues}`,
    );
    return {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      REDIS_URL: process.env.REDIS_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NODE_ENV: (process.env.NODE_ENV as Env["NODE_ENV"]) ?? "production",
    };
  }

  console.error(`[env] Invalid environment variables:\n${issues}`);
  throw new Error(
    "Invalid environment configuration - see stderr for details.",
  );
}

/**
 * Validated environment variables. Access via `env.DATABASE_URL`, etc.
 * Fails fast at module load if required vars are missing.
 */
export const env: Env = parseEnv();
