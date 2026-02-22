/**
 * Email Sender
 *
 * Provides functions for sending emails both synchronously and asynchronously
 * via the BullMQ queue system.
 */

import { prisma } from '@/lib/prisma';
import { emailLogger } from '@/lib/logger';
import { enqueueEmail, EmailJobData, EmailTemplate as QueueEmailTemplate } from '@/lib/queue';
import { getCachedProvider, clearProviderCache, SmtpProvider, getDefaultSenderInfo } from './provider';
import { renderEmail, type SupportedTemplateName } from './renderer';
import { getEmailConfig } from '@/lib/config';
import type {
  SendEmailOptions,
  EmailSendResult,
  EmailTemplateName,
  WelcomeEmailProps,
  PasswordResetEmailProps,
  NewInvoiceEmailProps,
  VoteInvitationEmailProps,
  TenantAdminInvitationEmailProps,
  PortalInvitationEmailProps,
  VoteReminderEmailProps,
  VoteResultEmailProps,
  DocumentSharedEmailProps,
  SettlementNotificationEmailProps,
  NewsAnnouncementEmailProps,
  ServiceEventEmailProps,
  ReportReadyEmailProps,
  EmailPreferences,
} from './types';

// =============================================================================
// Template Props Type Mapping
// =============================================================================

type TemplatePropsMap = {
  welcome: Omit<WelcomeEmailProps, keyof import('./types').BaseTemplateProps>;
  'password-reset': Omit<PasswordResetEmailProps, keyof import('./types').BaseTemplateProps>;
  'new-invoice': Omit<NewInvoiceEmailProps, keyof import('./types').BaseTemplateProps>;
  'vote-invitation': Omit<VoteInvitationEmailProps, keyof import('./types').BaseTemplateProps>;
  'tenant-admin-invitation': Omit<TenantAdminInvitationEmailProps, keyof import('./types').BaseTemplateProps>;
  'portal-invitation': Omit<PortalInvitationEmailProps, keyof import('./types').BaseTemplateProps>;
  'vote-reminder': Omit<VoteReminderEmailProps, keyof import('./types').BaseTemplateProps>;
  'vote-result': Omit<VoteResultEmailProps, keyof import('./types').BaseTemplateProps>;
  'document-shared': Omit<DocumentSharedEmailProps, keyof import('./types').BaseTemplateProps>;
  'settlement-notification': Omit<SettlementNotificationEmailProps, keyof import('./types').BaseTemplateProps>;
  'news-announcement': Omit<NewsAnnouncementEmailProps, keyof import('./types').BaseTemplateProps>;
  'service-event': Omit<ServiceEventEmailProps, keyof import('./types').BaseTemplateProps>;
  'report-ready': Omit<ReportReadyEmailProps, keyof import('./types').BaseTemplateProps>;
};

// Map EmailTemplateName to QueueEmailTemplate for queue integration
const templateNameToQueue: Record<EmailTemplateName, QueueEmailTemplate> = {
  welcome: 'welcome',
  'password-reset': 'password-reset',
  'new-invoice': 'invoice-notification',
  'vote-invitation': 'vote-invitation',
  'tenant-admin-invitation': 'welcome',
  'portal-invitation': 'portal-invitation',
  'vote-reminder': 'vote-reminder',
  'vote-result': 'vote-result',
  'document-shared': 'document-shared',
  'settlement-notification': 'settlement-notification',
  'news-announcement': 'news-announcement',
  'service-event': 'service-event-notification',
  'report-ready': 'report-ready',
};

// =============================================================================
// Synchronous Email Sending
// =============================================================================

/**
 * Send an email synchronously (immediate delivery)
 *
 * Use this for critical emails like password resets where immediate delivery is required.
 */
export async function sendEmailSync(options: SendEmailOptions): Promise<EmailSendResult> {
  try {
    // Get tenant configuration
    // Note: emailProvider, emailConfig, emailFromAddress, emailFromName are new fields
    // They will be available after running prisma generate
    const tenant = await prisma.tenant.findUnique({
      where: { id: options.tenantId },
    }) as {
      emailProvider?: string | null;
      emailConfig?: unknown;
      emailFromAddress?: string | null;
      emailFromName?: string | null;
    } | null;

    // Get or create provider (tenant fields → system_configs → env vars)
    let provider = getCachedProvider(options.tenantId, {
      provider: tenant?.emailProvider as 'smtp' | 'sendgrid' | 'ses' | null,
      config: tenant?.emailConfig as string | null,
      fromAddress: tenant?.emailFromAddress || null,
      fromName: tenant?.emailFromName || null,
    });

    // Fallback: check system_configs table for SMTP settings
    if (!provider) {
      const sysConfig = await getEmailConfig(options.tenantId);
      if (sysConfig) {
        provider = new SmtpProvider(
          { host: sysConfig.host, port: sysConfig.port, secure: sysConfig.secure, user: sysConfig.user, password: sysConfig.password },
          sysConfig.fromAddress,
          sysConfig.fromName,
        );
      }
    }

    if (!provider) {
      return {
        success: false,
        error: 'No email provider configured',
      };
    }

    // Send email
    const result = await provider.send({
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      attachments: options.attachments,
      headers: options.headers,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    emailLogger.error({ err: error, to: options.to }, 'Sync email send failed');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send an email using a template synchronously
 */
export async function sendTemplatedEmailSync<T extends keyof TemplatePropsMap>(
  templateName: T,
  props: TemplatePropsMap[T],
  to: string | string[],
  tenantId: string,
  options?: {
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    attachments?: SendEmailOptions['attachments'];
  }
): Promise<EmailSendResult> {
  try {
    // Render the template (only supported templates)
    const { html, text, subject } = await renderEmail(
      templateName as SupportedTemplateName,
      props as unknown as Parameters<typeof renderEmail>[1],
      tenantId
    );

    // Send the email
    return sendEmailSync({
      to,
      subject,
      html,
      text,
      tenantId,
      ...options,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    emailLogger.error({ err: error, template: templateName, to }, 'Templated sync email send failed');

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Asynchronous Email Sending (Queue)
// =============================================================================

/**
 * Send an email asynchronously via the queue
 *
 * Use this for non-critical emails where immediate delivery is not required.
 * The email will be processed by the email worker.
 */
export async function sendEmailAsync(
  templateName: EmailTemplateName,
  data: Record<string, unknown>,
  to: string,
  tenantId: string,
  options?: {
    subject?: string;
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    attachments?: EmailJobData['attachments'];
    priority?: number;
  }
): Promise<{ jobId: string }> {
  // Map template name to queue template
  const queueTemplate = templateNameToQueue[templateName] || 'welcome';

  // Determine subject
  let subject = options?.subject;

  if (!subject) {
    // Get tenant name for default subject
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    subject = getDefaultSubject(templateName, data, tenant?.name || 'WindparkManager');
  }

  // Enqueue the email job
  const job = await enqueueEmail({
    to,
    subject,
    template: queueTemplate,
    data,
    tenantId,
    cc: options?.cc,
    bcc: options?.bcc,
    replyTo: options?.replyTo,
    attachments: options?.attachments,
    priority: options?.priority,
  });

  return { jobId: job.id || `unknown-${Date.now()}` };
}

/**
 * Get default subject for a template
 */
function getDefaultSubject(
  templateName: EmailTemplateName,
  data: Record<string, unknown>,
  tenantName: string
): string {
  switch (templateName) {
    case 'welcome':
      return `Willkommen bei ${tenantName}`;
    case 'password-reset':
      return `Passwort zuruecksetzen - ${tenantName}`;
    case 'new-invoice':
      return `Neue Rechnung ${data.invoiceNumber || ''} - ${tenantName}`;
    case 'vote-invitation':
      return `Neue Abstimmung: ${data.voteName || 'Abstimmung'} - ${tenantName}`;
    case 'tenant-admin-invitation':
      return `Einladung als Administrator - ${tenantName}`;
    case 'portal-invitation':
      return `Ihr Portal-Zugang - ${tenantName}`;
    case 'vote-reminder':
      return `Erinnerung: ${data.voteName || 'Abstimmung'} - ${tenantName}`;
    case 'vote-result':
      return `Abstimmungsergebnis: ${data.voteName || 'Abstimmung'} - ${tenantName}`;
    case 'document-shared':
      return `Neues Dokument: ${data.documentTitle || 'Dokument'} - ${tenantName}`;
    case 'settlement-notification':
      return `Pachtabrechnung ${data.year || ''} - ${tenantName}`;
    case 'news-announcement':
      return `${data.newsTitle || 'Neuigkeiten'} - ${tenantName}`;
    case 'service-event':
      return `Service-Meldung: ${data.title || data.eventType || ''} - ${tenantName}`;
    case 'report-ready':
      return `Bericht: ${data.reportName || 'Bericht'} - ${tenantName}`;
    default:
      return `Mitteilung von ${tenantName}`;
  }
}

// =============================================================================
// User Preference Checking
// =============================================================================

/**
 * Check if a user has email notifications enabled for a category
 */
export async function shouldSendEmail(
  userId: string,
  category: keyof EmailPreferences
): Promise<boolean> {
  // Note: emailPreferences is a new field, will be available after prisma generate
  const user = await prisma.user.findUnique({
    where: { id: userId },
  }) as { emailPreferences?: unknown } | null;

  if (!user) {
    return false;
  }

  try {
    const prefs = (user.emailPreferences || {}) as EmailPreferences;
    return prefs[category] ?? true; // Default to true if preference not set
  } catch {
    return true; // Default to true if parsing fails
  }
}

/**
 * Send an email only if user preferences allow it
 */
export async function sendEmailIfAllowed(
  userId: string,
  category: keyof EmailPreferences,
  templateName: EmailTemplateName,
  data: Record<string, unknown>,
  to: string,
  tenantId: string,
  options?: Parameters<typeof sendEmailAsync>[4]
): Promise<{ sent: boolean; jobId?: string; reason?: string }> {
  const allowed = await shouldSendEmail(userId, category);

  if (!allowed) {
    return {
      sent: false,
      reason: `User has disabled ${category} email notifications`,
    };
  }

  const result = await sendEmailAsync(templateName, data, to, tenantId, options);

  return {
    sent: true,
    jobId: result.jobId,
  };
}

// =============================================================================
// Bulk Email Sending
// =============================================================================

/**
 * Send emails to multiple recipients
 */
export async function sendBulkEmail(
  templateName: EmailTemplateName,
  recipients: Array<{
    to: string;
    data: Record<string, unknown>;
    userId?: string;
  }>,
  tenantId: string,
  category?: keyof EmailPreferences
): Promise<{
  queued: number;
  skipped: number;
  errors: number;
}> {
  let queued = 0;
  let skipped = 0;
  let errors = 0;

  for (const recipient of recipients) {
    try {
      // Check preferences if category is specified and userId is available
      if (category && recipient.userId) {
        const allowed = await shouldSendEmail(recipient.userId, category);

        if (!allowed) {
          skipped++;
          continue;
        }
      }

      await sendEmailAsync(templateName, recipient.data, recipient.to, tenantId);
      queued++;
    } catch (error) {
      emailLogger.error({ err: error, to: recipient.to, template: templateName }, 'Failed to queue bulk email');
      errors++;
    }
  }

  return { queued, skipped, errors };
}

// =============================================================================
// Email Configuration Management
// =============================================================================

/**
 * Test email configuration by sending a test email
 */
export async function testEmailConfiguration(
  tenantId: string,
  testEmail: string
): Promise<EmailSendResult> {
  // Clear provider cache to ensure fresh configuration
  clearProviderCache(tenantId);

  // Get tenant for sender info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const tenantName = tenant?.name || 'WindparkManager';

  // Send test email
  return sendEmailSync({
    to: testEmail,
    subject: `Test-E-Mail von ${tenantName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #3b82f6;">E-Mail-Konfiguration erfolgreich!</h1>
        <p>Diese Test-E-Mail bestaetigt, dass die E-Mail-Einstellungen fuer <strong>${tenantName}</strong> korrekt konfiguriert sind.</p>
        <p style="color: #6b7280; font-size: 14px;">Gesendet am: ${new Date().toLocaleString('de-DE')}</p>
      </div>
    `,
    text: `E-Mail-Konfiguration erfolgreich!\n\nDiese Test-E-Mail bestaetigt, dass die E-Mail-Einstellungen fuer ${tenantName} korrekt konfiguriert sind.\n\nGesendet am: ${new Date().toLocaleString('de-DE')}`,
    tenantId,
  });
}

/**
 * Verify email provider connection
 */
export async function verifyEmailProvider(tenantId: string): Promise<boolean> {
  // Clear cache first
  clearProviderCache(tenantId);

  // Get tenant configuration
  // Note: emailProvider, emailConfig, emailFromAddress, emailFromName are new fields
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  }) as {
    emailProvider?: string | null;
    emailConfig?: unknown;
    emailFromAddress?: string | null;
    emailFromName?: string | null;
  } | null;

  const provider = getCachedProvider(tenantId, {
    provider: tenant?.emailProvider as 'smtp' | 'sendgrid' | 'ses' | null,
    config: tenant?.emailConfig as string | null,
    fromAddress: tenant?.emailFromAddress || null,
    fromName: tenant?.emailFromName || null,
  });

  if (!provider) {
    return false;
  }

  return provider.verify();
}
