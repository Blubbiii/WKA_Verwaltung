/**
 * Email Template Renderer
 *
 * Renders React Email components to HTML strings for sending.
 */

import { render } from '@react-email/components';
import * as React from 'react';
import { prisma } from '@/lib/prisma';
import type {
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
  BaseTemplateProps,
} from './types';
import { WelcomeEmail } from './templates/welcome';
import { PasswordResetEmail } from './templates/password-reset';
import { NewInvoiceEmail } from './templates/new-invoice';
import { VoteInvitationEmail } from './templates/vote-invitation';
import { TenantAdminInvitationEmail } from './templates/tenant-admin-invitation';
import { PortalInvitationEmail } from './templates/portal-invitation';
import { VoteReminderEmail } from './templates/vote-reminder';
import { VoteResultEmail } from './templates/vote-result';
import { DocumentSharedEmail } from './templates/document-shared';
import { SettlementNotificationEmail } from './templates/settlement-notification';
import { NewsAnnouncementEmail } from './templates/news-announcement';
import { ServiceEventEmail } from './templates/service-event';
import { ReportReadyEmail } from './templates/report-ready';
import { emailLogger as logger } from "@/lib/logger";

// =============================================================================
// Template Mapping
// =============================================================================

// Only the templates we have implemented
export type SupportedTemplateName =
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

type TemplatePropsMap = {
  welcome: WelcomeEmailProps;
  'password-reset': PasswordResetEmailProps;
  'new-invoice': NewInvoiceEmailProps;
  'vote-invitation': VoteInvitationEmailProps;
  'tenant-admin-invitation': TenantAdminInvitationEmailProps;
  'portal-invitation': PortalInvitationEmailProps;
  'vote-reminder': VoteReminderEmailProps;
  'vote-result': VoteResultEmailProps;
  'document-shared': DocumentSharedEmailProps;
  'settlement-notification': SettlementNotificationEmailProps;
  'news-announcement': NewsAnnouncementEmailProps;
  'service-event': ServiceEventEmailProps;
  'report-ready': ReportReadyEmailProps;
};

type TemplateComponentMap = {
  [K in SupportedTemplateName]: React.FC<TemplatePropsMap[K]>;
};

const templateComponents: TemplateComponentMap = {
  welcome: WelcomeEmail,
  'password-reset': PasswordResetEmail,
  'new-invoice': NewInvoiceEmail,
  'vote-invitation': VoteInvitationEmail,
  'tenant-admin-invitation': TenantAdminInvitationEmail,
  'portal-invitation': PortalInvitationEmail,
  'vote-reminder': VoteReminderEmail,
  'vote-result': VoteResultEmail,
  'document-shared': DocumentSharedEmail,
  'settlement-notification': SettlementNotificationEmail,
  'news-announcement': NewsAnnouncementEmail,
  'service-event': ServiceEventEmail,
  'report-ready': ReportReadyEmail,
};

// =============================================================================
// Base Props Helper
// =============================================================================

/**
 * Get base template props from tenant
 */
export async function getBaseTemplateProps(
  tenantId: string
): Promise<BaseTemplateProps> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      logoUrl: true,
      primaryColor: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  // App name from env, defaults to "WindparkManager"
  const appName = process.env.APP_NAME || 'WindparkManager';

  return {
    tenantName: tenant.name,
    appName,
    tenantLogoUrl: tenant.logoUrl || undefined,
    primaryColor: tenant.primaryColor,
    currentYear: new Date().getFullYear(),
    // unsubscribeUrl will be added per-user if needed
  };
}

// =============================================================================
// Placeholder Replacement
// =============================================================================

/**
 * Replace placeholders in a string
 * Supports {{variable}} syntax
 */
export function replacePlaceholders(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    if (value === undefined || value === null) {
      logger.warn(`[EmailRenderer] Missing placeholder value for: ${key}`);
      return match;
    }
    return String(value);
  });
}

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Render result containing both HTML and plain text versions
 */
export interface RenderResult {
  html: string;
  text: string;
  subject: string;
}

/**
 * Render a built-in template to HTML
 */
export async function renderTemplate<T extends SupportedTemplateName>(
  templateName: T,
  props: TemplatePropsMap[T],
  tenantId: string
): Promise<RenderResult> {
  // Get base props from tenant
  const baseProps = await getBaseTemplateProps(tenantId);

  // Merge with provided props
  const fullProps = { ...baseProps, ...props } as TemplatePropsMap[T];

  // Get the component
  const Component = templateComponents[templateName] as React.FC<TemplatePropsMap[T]>;

  if (!Component) {
    throw new Error(`Unknown template: ${templateName}`);
  }

  // Render to HTML
  const element = React.createElement(Component, fullProps);
  const html = await render(element, { pretty: true });
  const text = await render(element, { plainText: true });

  // Generate subject based on template
  const subject = getDefaultSubject(templateName, fullProps as unknown as Record<string, unknown>);

  return { html, text, subject };
}

/**
 * Get default subject for a template
 */
function getDefaultSubject(
  templateName: EmailTemplateName,
  props: Record<string, unknown>
): string {
  const tenantName = (props.tenantName as string) || 'WindparkManager';

  switch (templateName) {
    case 'welcome':
      return `Willkommen bei ${tenantName}`;
    case 'password-reset':
      return `Passwort zuruecksetzen - ${tenantName}`;
    case 'new-invoice':
      return `Neue Rechnung ${props.invoiceNumber || ''} - ${tenantName}`;
    case 'vote-invitation':
      return `Neue Abstimmung: ${props.voteName || 'Abstimmung'} - ${tenantName}`;
    case 'tenant-admin-invitation':
      return `Einladung als Administrator - ${tenantName}`;
    case 'portal-invitation':
      return `Ihr Portal-Zugang - ${tenantName}`;
    case 'vote-reminder':
      return `Erinnerung: ${props.voteName || 'Abstimmung'} - ${tenantName}`;
    case 'vote-result':
      return `Abstimmungsergebnis: ${props.voteName || 'Abstimmung'} - ${tenantName}`;
    case 'document-shared':
      return `Neues Dokument: ${props.documentTitle || 'Dokument'} - ${tenantName}`;
    case 'settlement-notification':
      return `Pachtabrechnung ${props.settlementPeriod || ''} - ${tenantName}`;
    case 'news-announcement':
      return `${props.newsTitle || 'Neuigkeiten'} - ${tenantName}`;
    case 'service-event':
      return `Service-Meldung: ${props.title || ''} - ${tenantName}`;
    case 'report-ready':
      return `Bericht: ${props.reportName || 'Bericht'} - ${tenantName}`;
    default:
      return `Mitteilung von ${tenantName}`;
  }
}

/**
 * Render a custom template from database
 */
export async function renderCustomTemplate(
  tenantId: string,
  templateName: string,
  data: Record<string, unknown>
): Promise<RenderResult | null> {
  // Fetch template from database
  // Note: emailTemplate is a new model, will be available after prisma generate
  // For now, we use raw query or skip if model doesn't exist
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const template = await (prisma as any).emailTemplate?.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: templateName,
        },
      },
    });

    if (!template || !template.isActive) {
      return null;
    }

    // Get base props for placeholders
    const baseProps = await getBaseTemplateProps(tenantId);
    const allData = { ...baseProps, ...data };

    // Replace placeholders
    const html = replacePlaceholders(template.htmlContent, allData);
    const text = template.textContent
      ? replacePlaceholders(template.textContent, allData)
      : htmlToPlainText(html);
    const subject = replacePlaceholders(template.subject, allData);

    return { html, text, subject };
  } catch {
    // Model doesn't exist yet, return null to fall back to built-in templates
    return null;
  }
}

/**
 * Render an email, checking for custom template first, then falling back to built-in
 */
export async function renderEmail<T extends SupportedTemplateName>(
  templateName: T,
  props: TemplatePropsMap[T],
  tenantId: string
): Promise<RenderResult> {
  // Try custom template first
  const customResult = await renderCustomTemplate(
    tenantId,
    templateName,
    props as unknown as Record<string, unknown>
  );

  if (customResult) {
    return customResult;
  }

  // Fall back to built-in template
  return renderTemplate(templateName, props, tenantId);
}

/**
 * Simple HTML to plain text conversion
 */
export function htmlToPlainText(html: string): string {
  return html
    // Remove style and script tags with content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Replace common block elements with newlines
    .replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =============================================================================
// Template Preview
// =============================================================================

/**
 * Generate a preview of a template with sample data
 */
export async function previewTemplate(
  templateName: SupportedTemplateName,
  tenantId: string
): Promise<RenderResult> {
  const sampleData = getSampleData(templateName);

  return renderEmail(
    templateName,
    sampleData as unknown as TemplatePropsMap[typeof templateName],
    tenantId
  );
}

/**
 * Get sample data for template preview
 */
export function getSampleData(templateName: SupportedTemplateName): Record<string, unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com';

  switch (templateName) {
    case 'welcome':
      return {
        userName: 'Max Mustermann',
        loginUrl: `${baseUrl}/login`,
      };
    case 'password-reset':
      return {
        userName: 'Max Mustermann',
        resetUrl: `${baseUrl}/reset-password?token=sample-token`,
        expiresIn: '24 Stunden',
      };
    case 'new-invoice':
      return {
        recipientName: 'Max Mustermann',
        invoiceNumber: 'RG-2026-0001',
        amount: '1.234,56 EUR',
        dueDate: '15.03.2026',
        downloadUrl: `${baseUrl}/invoices/sample-invoice.pdf`,
      };
    case 'vote-invitation':
      return {
        shareholderName: 'Max Mustermann',
        voteName: 'Jahresabschluss 2025',
        voteDescription:
          'Abstimmung ueber die Feststellung des Jahresabschlusses 2025 und die Verwendung des Ergebnisses.',
        deadline: '31.03.2026, 18:00 Uhr',
        voteUrl: `${baseUrl}/portal/votes/sample-vote`,
      };
    case 'tenant-admin-invitation':
      return {
        userName: 'Max Mustermann',
        invitationUrl: `${baseUrl}/reset-password?token=sample-token`,
        expiresIn: '7 Tagen',
      };
    case 'portal-invitation':
      return {
        userName: 'Max Mustermann',
        email: 'max.mustermann@example.com',
        temporaryPassword: 'Abc123XyZ_temp',
        loginUrl: `${baseUrl}/login`,
      };
    case 'vote-reminder':
      return {
        shareholderName: 'Max Mustermann',
        voteName: 'Jahresabschluss 2025',
        voteDescription: 'Abstimmung ueber die Feststellung des Jahresabschlusses 2025.',
        deadline: '31.03.2026, 18:00 Uhr',
        voteUrl: `${baseUrl}/portal/votes/sample-vote`,
      };
    case 'vote-result':
      return {
        shareholderName: 'Max Mustermann',
        voteName: 'Jahresabschluss 2025',
        result: 'Angenommen (85% Zustimmung)',
        resultUrl: `${baseUrl}/portal/votes/sample-vote`,
      };
    case 'document-shared':
      return {
        recipientName: 'Max Mustermann',
        documentTitle: 'Jahresbericht 2025',
        documentCategory: 'Berichte',
        sharedBy: 'Windpark-Verwaltung',
        documentUrl: `${baseUrl}/portal/documents/sample-doc`,
      };
    case 'settlement-notification':
      return {
        recipientName: 'Max Mustermann',
        settlementPeriod: 'Q4 2025',
        parkName: 'Windpark Musterstadt',
        totalAmount: '12.345,67 EUR',
        settlementUrl: `${baseUrl}/leases/settlements/sample`,
      };
    case 'news-announcement':
      return {
        recipientName: 'Max Mustermann',
        newsTitle: 'Wartungsarbeiten im Januar',
        newsExcerpt: 'Im Januar finden planmaessige Wartungsarbeiten an den Windenergieanlagen statt.',
        newsUrl: `${baseUrl}/portal/news/sample`,
        publishedAt: '15.01.2026',
      };
    case 'service-event':
      return {
        title: 'Leistungsabfall erkannt',
        message: 'Bei 3 Anlagen im Windpark Musterstadt wurde ein Leistungsabfall erkannt.',
        anomalyCount: 5,
        criticalCount: 2,
        warningCount: 3,
        link: `${baseUrl}/energy/scada/anomalies`,
      };
    case 'report-ready':
      return {
        reportName: 'Monatsbericht Januar 2026',
        reportTitle: 'Windpark Musterstadt - Produktionsbericht',
        generatedAt: '01.02.2026, 06:00 Uhr',
        downloadUrl: `${baseUrl}/reports/archive?reportId=sample`,
      };
    default:
      return {};
  }
}
