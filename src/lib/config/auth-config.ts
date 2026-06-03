/**
 * Central auth/session configuration.
 * Env-overridable constants for session duration, password policy, etc.
 */

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

export const AUTH_CONFIG = {
  /** Session max age in seconds (default: 24 hours) */
  sessionMaxAge: envInt("SESSION_MAX_AGE", 24 * 60 * 60),

  /** Bcrypt salt rounds for password hashing */
  bcryptSaltRounds: envInt("BCRYPT_SALT_ROUNDS", 12),

  /** Minimum password length */
  passwordMinLength: envInt("PASSWORD_MIN_LENGTH", 8),

  /** Maximum password length */
  passwordMaxLength: envInt("PASSWORD_MAX_LENGTH", 128),

  /**
   * Impersonation session duration in seconds (default: 4 hours).
   * EINE Quelle für Cookie-MaxAge UND HMAC-Payload-exp — beides MUSS synchron sein,
   * sonst gibt es Inkonsistenzen (Cookie noch da, Payload abgelaufen oder umgekehrt).
   * Backward-Compat: liest auch noch IMPERSONATION_MAX_AGE als Fallback.
   */
  impersonationTtlSeconds: envInt(
    "IMPERSONATION_TTL_SECONDS",
    envInt("IMPERSONATION_MAX_AGE", 60 * 60 * 4),
  ),

  /** Password reset token validity in hours (default: 24h — gives users time to find the email) */
  passwordResetTokenExpiryHours: envInt("PASSWORD_RESET_TOKEN_EXPIRY_HOURS", 24),
} as const;

/** Default tenant limits (env-overridable) */
export const DEFAULT_TENANT_LIMITS = {
  maxUsers: envInt("DEFAULT_TENANT_MAX_USERS", 50),
  maxStorageMb: envInt("DEFAULT_TENANT_MAX_STORAGE_MB", 5000),
  maxParks: envInt("DEFAULT_TENANT_MAX_PARKS", 20),
} as const;
