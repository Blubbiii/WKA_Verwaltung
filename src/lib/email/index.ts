/**
 * Email System - Central Export Module
 *
 * Provides a unified interface for sending emails in the WindparkManager application.
 *
 * @example
 * ```typescript
 * import { sendEmail, sendTemplatedEmailSync, sendEmailAsync } from '@/lib/email';
 *
 * // Send a welcome email synchronously
 * await sendTemplatedEmailSync(
 *   'welcome',
 *   { userName: 'Max Mustermann', loginUrl: 'https://app.example.com/login' },
 *   'user@example.com',
 *   'tenant-123'
 * );
 *
 * // Send an email asynchronously via queue
 * await sendEmailAsync(
 *   'vote-invitation',
 *   { shareholderName: 'Max', voteName: 'Jahresabschluss 2025', ... },
 *   'user@example.com',
 *   'tenant-123'
 * );
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  EmailProviderType,
  EmailPreferences,
  SmtpConfig,
  SendGridConfig,
  SesConfig,
  EmailProviderConfig,
  TenantEmailSettings,
  EmailAttachment,
  SendEmailOptions,
  EmailSendResult,
  EmailTemplateName,
  BaseTemplateProps,
  WelcomeEmailProps,
  PasswordResetEmailProps,
  NewInvoiceEmailProps,
  VoteInvitationEmailProps,
  TenantAdminInvitationEmailProps,
} from './types';

export { DEFAULT_EMAIL_PREFERENCES } from './types';

// =============================================================================
// Provider
// =============================================================================

export {
  type EmailProvider,
  SmtpProvider,
  SendGridProvider,
  SesProvider,
  createProvider,
  getProvider,
  getCachedProvider,
  clearProviderCache,
  getDefaultSmtpConfig,
  getDefaultSenderInfo,
} from './provider';

// =============================================================================
// Encryption
// =============================================================================

export {
  encrypt,
  decrypt,
  encryptConfig,
  decryptConfig,
  isEncrypted,
  maskSensitive,
} from './encryption';

// =============================================================================
// Renderer
// =============================================================================

export {
  renderTemplate,
  renderCustomTemplate,
  renderEmail,
  previewTemplate,
  getBaseTemplateProps,
  replacePlaceholders,
  type RenderResult,
} from './renderer';

// =============================================================================
// Sender
// =============================================================================

export {
  sendEmailSync,
  sendTemplatedEmailSync,
  sendEmailAsync,
  sendEmailIfAllowed,
  sendBulkEmail,
  shouldSendEmail,
  testEmailConfiguration,
  verifyEmailProvider,
} from './sender';

// =============================================================================
// Templates
// =============================================================================

export {
  BaseLayout,
  Button,
  Heading,
  Paragraph,
  InfoBox,
  WelcomeEmail,
  PasswordResetEmail,
  NewInvoiceEmail,
  VoteInvitationEmail,
  TenantAdminInvitationEmail,
} from './templates';

// =============================================================================
// Convenience Function
// =============================================================================

import { sendEmailSync } from './sender';
import type { SendEmailOptions, EmailSendResult } from './types';

/**
 * Main email sending function
 *
 * This is a convenience wrapper around sendEmailSync for simple use cases.
 * For templated emails, use sendTemplatedEmailSync or sendEmailAsync.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  return sendEmailSync(options);
}
