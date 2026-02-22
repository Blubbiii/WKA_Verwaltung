/**
 * Email Configuration Encryption
 *
 * Provides encryption/decryption for sensitive email configuration data
 * stored in the database (SMTP passwords, API keys, etc.).
 */

import crypto from 'crypto';
import { emailLogger as logger } from "@/lib/logger";

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Get the encryption key from environment variable.
 *
 * In production, EMAIL_ENCRYPTION_KEY MUST be set -- the function throws
 * immediately if it is missing.  In development, a deterministic fallback
 * key is derived so that local work is not blocked, but a warning is
 * logged on every call.
 */
function getEncryptionKey(): string {
  const key = process.env.EMAIL_ENCRYPTION_KEY;

  if (key) {
    return key;
  }

  // Production: hard-fail when the key is missing
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[Email Encryption] EMAIL_ENCRYPTION_KEY environment variable is not set. ' +
        'This is required in production. Aborting to prevent use of a predictable key.'
    );
  }

  // Development / test: derive a deterministic fallback and warn
  const fallbackSource = process.env.DATABASE_URL || 'windparkmanager-default-key';
  logger.warn(
    '[Email Encryption] EMAIL_ENCRYPTION_KEY is not set. ' +
      'Using fallback key derived from DATABASE_URL. ' +
      'Set EMAIL_ENCRYPTION_KEY before deploying to production.'
  );
  return crypto.createHash('sha256').update(fallbackSource).digest('hex').slice(0, 64);
}

/**
 * Validate that the encryption setup is correct.
 *
 * Call this at server startup (e.g. in an instrumentation hook or a
 * top-level server module) to surface configuration problems early
 * instead of at the first encrypt/decrypt call.
 *
 * @returns {{ valid: boolean; message: string }}
 */
export function validateEncryptionSetup(): { valid: boolean; message: string } {
  const key = process.env.EMAIL_ENCRYPTION_KEY;

  if (key) {
    return { valid: true, message: 'EMAIL_ENCRYPTION_KEY is configured.' };
  }

  if (process.env.NODE_ENV === 'production') {
    return {
      valid: false,
      message:
        '[Email Encryption] EMAIL_ENCRYPTION_KEY is NOT set. ' +
        'Encryption will fail in production. Set this variable before starting the server.',
    };
  }

  return {
    valid: true,
    message:
      '[Email Encryption] EMAIL_ENCRYPTION_KEY is not set. ' +
      'A fallback key will be used for development. Do NOT use this in production.',
  };
}

/**
 * Derive a key from password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt sensitive data (e.g., SMTP password, API keys)
 *
 * @param plaintext - The text to encrypt
 * @returns Base64 encoded encrypted string (salt:iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string): string {
  const encryptionKey = getEncryptionKey();

  // Generate salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from master key + salt
  const key = deriveKey(encryptionKey, salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + ciphertext (all base64)
  const result = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]).toString('base64');

  return result;
}

/**
 * Decrypt sensitive data
 *
 * @param ciphertext - Base64 encoded encrypted string
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export function decrypt(ciphertext: string): string {
  const encryptionKey = getEncryptionKey();

  try {
    // Decode from base64
    const buffer = Buffer.from(ciphertext, 'base64');

    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = buffer.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from master key + salt
    const key = deriveKey(encryptionKey, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error({ err: error }, '[Email Encryption] Decryption failed');
    throw new Error('Failed to decrypt email configuration');
  }
}

/**
 * Encrypt an entire configuration object
 *
 * @param config - Configuration object with sensitive values
 * @returns Encrypted JSON string
 */
export function encryptConfig(config: Record<string, unknown>): string {
  const jsonString = JSON.stringify(config);
  return encrypt(jsonString);
}

/**
 * Decrypt a configuration object
 *
 * @param encryptedConfig - Encrypted JSON string
 * @returns Decrypted configuration object
 */
export function decryptConfig<T extends Record<string, unknown>>(
  encryptedConfig: string
): T {
  const jsonString = decrypt(encryptedConfig);
  return JSON.parse(jsonString) as T;
}

/**
 * Check if a string appears to be encrypted (base64 with expected length)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;

  try {
    const buffer = Buffer.from(value, 'base64');
    // Minimum length: salt (64) + iv (16) + authTag (16) + at least 1 byte of data
    return buffer.length >= SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Mask sensitive values for logging/display
 *
 * @param value - The value to mask
 * @param showChars - Number of characters to show at start and end
 * @returns Masked string like "abc...xyz"
 */
export function maskSensitive(value: string, showChars: number = 3): string {
  if (!value || value.length <= showChars * 2) {
    return '***';
  }

  return `${value.slice(0, showChars)}...${value.slice(-showChars)}`;
}
