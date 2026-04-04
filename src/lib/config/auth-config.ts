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

  /** Impersonation session duration in seconds (default: 1 hour) */
  impersonationMaxAge: envInt("IMPERSONATION_MAX_AGE", 60 * 60),

  /** Password reset token validity in hours */
  passwordResetTokenExpiryHours: envInt("PASSWORD_RESET_TOKEN_EXPIRY_HOURS", 1),
} as const;

/** Default tenant limits (env-overridable) */
export const DEFAULT_TENANT_LIMITS = {
  maxUsers: envInt("DEFAULT_TENANT_MAX_USERS", 50),
  maxStorageMb: envInt("DEFAULT_TENANT_MAX_STORAGE_MB", 5000),
  maxParks: envInt("DEFAULT_TENANT_MAX_PARKS", 20),
} as const;
