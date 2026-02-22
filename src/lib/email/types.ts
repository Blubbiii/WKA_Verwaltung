/**
 * Email System Types
 *
 * Type definitions for the WindparkManager email system.
 */

/**
 * Email provider types supported by the system
 */
export type EmailProviderType = 'smtp' | 'sendgrid' | 'ses';

/**
 * User email preferences structure
 */
export interface EmailPreferences {
  votes: boolean;
  documents: boolean;
  invoices: boolean;
  contracts: boolean;
  system: boolean;
}

/**
 * Default email preferences for new users
 */
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  votes: true,
  documents: true,
  invoices: true,
  contracts: true,
  system: true,
};

/**
 * SMTP configuration structure
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

/**
 * SendGrid configuration structure
 */
export interface SendGridConfig {
  apiKey: string;
}

/**
 * AWS SES configuration structure
 */
export interface SesConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Union type for provider configurations
 */
export type EmailProviderConfig = SmtpConfig | SendGridConfig | SesConfig;

/**
 * Tenant email settings stored in database
 */
export interface TenantEmailSettings {
  provider: EmailProviderType | null;
  config: EmailProviderConfig | null;
  fromAddress: string | null;
  fromName: string | null;
}

/**
 * Email attachment structure
 */
export interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
  encoding?: string;
}

/**
 * Email sending options
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  tenantId: string;
  headers?: Record<string, string>;
}

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: EmailProviderType;
}

/**
 * Email template names
 */
export type EmailTemplateName =
  | 'welcome'
  | 'password-reset'
  | 'new-invoice'
  | 'vote-invitation'
  | 'tenant-admin-invitation'
  | 'portal-invitation'
  | 'vote-reminder'
  | 'vote-result'
  | 'document-shared'
  | 'settlement-notification'
  | 'news-announcement'
  | 'service-event'
  | 'report-ready';

/**
 * Template rendering context - base interface
 */
export interface BaseTemplateProps {
  tenantName: string;
  /** Application name for header/footer branding (defaults to tenantName) */
  appName?: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  currentYear: number;
  unsubscribeUrl?: string;
}

/**
 * Welcome email template props
 */
export interface WelcomeEmailProps extends BaseTemplateProps {
  userName: string;
  loginUrl: string;
}

/**
 * Password reset email template props
 */
export interface PasswordResetEmailProps extends BaseTemplateProps {
  userName: string;
  resetUrl: string;
  expiresIn: string;
}

/**
 * New invoice email template props
 */
export interface NewInvoiceEmailProps extends BaseTemplateProps {
  recipientName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  downloadUrl: string;
}

/**
 * Vote invitation email template props
 */
export interface VoteInvitationEmailProps extends BaseTemplateProps {
  shareholderName: string;
  voteName: string;
  voteDescription: string;
  deadline: string;
  voteUrl: string;
}

/**
 * Tenant admin invitation email template props
 */
export interface TenantAdminInvitationEmailProps extends BaseTemplateProps {
  userName: string;
  invitationUrl: string;
  expiresIn: string;
}

/**
 * Portal invitation email template props
 */
export interface PortalInvitationEmailProps extends BaseTemplateProps {
  userName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}

/**
 * Vote reminder email template props
 */
export interface VoteReminderEmailProps extends BaseTemplateProps {
  shareholderName: string;
  voteName: string;
  voteDescription?: string;
  deadline: string;
  voteUrl: string;
}

/**
 * Vote result email template props
 */
export interface VoteResultEmailProps extends BaseTemplateProps {
  shareholderName: string;
  voteName: string;
  result: string;
  resultUrl: string;
}

/**
 * Document shared email template props
 */
export interface DocumentSharedEmailProps extends BaseTemplateProps {
  recipientName: string;
  documentTitle: string;
  documentCategory?: string;
  sharedBy?: string;
  documentUrl: string;
}

/**
 * Settlement notification email template props
 */
export interface SettlementNotificationEmailProps extends BaseTemplateProps {
  recipientName: string;
  settlementPeriod: string;
  parkName: string;
  totalAmount?: string;
  settlementUrl: string;
}

/**
 * News announcement email template props
 */
export interface NewsAnnouncementEmailProps extends BaseTemplateProps {
  recipientName: string;
  newsTitle: string;
  newsExcerpt?: string;
  newsUrl: string;
  publishedAt?: string;
}

/**
 * Service event email template props
 */
export interface ServiceEventEmailProps extends BaseTemplateProps {
  title: string;
  message?: string;
  anomalyCount?: number;
  criticalCount?: number;
  warningCount?: number;
  link?: string;
}

/**
 * Report ready email template props
 */
export interface ReportReadyEmailProps extends BaseTemplateProps {
  reportName: string;
  reportTitle?: string;
  generatedAt?: string;
  downloadUrl: string;
}

/**
 * Encryption utilities for email config
 */
export interface EncryptionUtils {
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
}
