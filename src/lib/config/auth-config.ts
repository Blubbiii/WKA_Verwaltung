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

  /** Password reset token validity in hours (default: 24h — gives users time to find the email) */
  passwordResetTokenExpiryHours: envInt("PASSWORD_RESET_TOKEN_EXPIRY_HOURS", 24),
} as const;
