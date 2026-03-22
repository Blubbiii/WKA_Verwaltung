/**
 * Central validation patterns/regex used across the application.
 * Import from here instead of defining locally.
 */

/** Basic email format check (not RFC-complete, but sufficient for form validation) */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}
