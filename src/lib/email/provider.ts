/**
 * Email Provider Abstraction
 *
 * Provides a unified interface for sending emails across different providers:
 * - SMTP (via Nodemailer)
 * - SendGrid (optional)
 * - AWS SES (optional)
 */

import nodemailer from 'nodemailer';
import type { Transporter, SentMessageInfo } from 'nodemailer';
import {
  EmailProviderType,
  EmailSendResult,
  SendEmailOptions,
  SmtpConfig,
  SendGridConfig,
  SesConfig,
} from './types';
import { decryptConfig, isEncrypted } from './encryption';
import { emailLogger as logger } from "@/lib/logger";

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Email provider interface
 * All email providers must implement this interface
 */
export interface EmailProvider {
  /** Provider type identifier */
  type: EmailProviderType;

  /**
   * Send an email
   * @param options - Email sending options
   * @returns Promise resolving to send result
   */
  send(options: Omit<SendEmailOptions, 'tenantId'>): Promise<EmailSendResult>;

  /**
   * Verify the provider configuration is valid
   * @returns Promise resolving to true if valid
   */
  verify(): Promise<boolean>;

  /**
   * Close/cleanup the provider connection
   */
  close(): Promise<void>;
}

// =============================================================================
// SMTP Provider
// =============================================================================

/**
 * SMTP Email Provider using Nodemailer
 */
export class SmtpProvider implements EmailProvider {
  type: EmailProviderType = 'smtp';
  private transporter: Transporter<SentMessageInfo>;
  private fromAddress: string;
  private fromName: string;

  constructor(config: SmtpConfig, fromAddress: string, fromName: string) {
    this.fromAddress = fromAddress;
    this.fromName = fromName;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure, // true for 465, false for other ports
      auth: {
        user: config.user,
        pass: config.password,
      },
      // Timeouts
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 30000, // 30 seconds
    });
  }

  async send(options: Omit<SendEmailOptions, 'tenantId'>): Promise<EmailSendResult> {
    try {
      const mailOptions = {
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc.join(', ')
            : options.cc
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc.join(', ')
            : options.bcc
          : undefined,
        replyTo: options.replyTo,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          path: att.path,
          contentType: att.contentType,
          encoding: att.encoding as BufferEncoding | undefined,
        })),
        headers: options.headers,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown SMTP error';
      logger.error({ err: errorMessage }, '[SmtpProvider] Send failed');

      return {
        success: false,
        error: errorMessage,
        provider: 'smtp',
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error({ err: error }, '[SmtpProvider] Verification failed');
      return false;
    }
  }

  async close(): Promise<void> {
    this.transporter.close();
  }
}

// =============================================================================
// SendGrid Provider (Optional)
// =============================================================================

/**
 * SendGrid Email Provider
 * Uses SendGrid's Web API for email delivery
 */
export class SendGridProvider implements EmailProvider {
  type: EmailProviderType = 'sendgrid';
  private apiKey: string;
  private fromAddress: string;
  private fromName: string;

  constructor(config: SendGridConfig, fromAddress: string, fromName: string) {
    this.apiKey = config.apiKey;
    this.fromAddress = fromAddress;
    this.fromName = fromName;
  }

  async send(options: Omit<SendEmailOptions, 'tenantId'>): Promise<EmailSendResult> {
    try {
      const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

      const payload = {
        personalizations: [
          {
            to: toAddresses.map((email) => ({ email })),
            cc: options.cc
              ? (Array.isArray(options.cc) ? options.cc : [options.cc]).map((email) => ({
                  email,
                }))
              : undefined,
            bcc: options.bcc
              ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).map((email) => ({
                  email,
                }))
              : undefined,
          },
        ],
        from: { email: this.fromAddress, name: this.fromName },
        reply_to: options.replyTo ? { email: options.replyTo } : undefined,
        subject: options.subject,
        content: [
          ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
          { type: 'text/html', value: options.html },
        ],
        attachments: options.attachments?.map((att) => ({
          content:
            typeof att.content === 'string'
              ? att.content
              : att.content
                ? Buffer.from(att.content).toString('base64')
                : undefined,
          filename: att.filename,
          type: att.contentType,
          disposition: 'attachment',
        })),
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
      }

      const messageId = response.headers.get('X-Message-Id') || `sendgrid-${Date.now()}`;

      return {
        success: true,
        messageId,
        provider: 'sendgrid',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown SendGrid error';
      logger.error({ err: errorMessage }, '[SendGridProvider] Send failed');

      return {
        success: false,
        error: errorMessage,
        provider: 'sendgrid',
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      // SendGrid doesn't have a verify endpoint, so we check the API key format
      // and make a simple API call
      const response = await fetch('https://api.sendgrid.com/v3/scopes', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for SendGrid
  }
}

// =============================================================================
// AWS SES Provider (Optional)
// =============================================================================

/**
 * AWS SES Email Provider
 * Uses AWS SDK v3 for email delivery
 */
export class SesProvider implements EmailProvider {
  type: EmailProviderType = 'ses';
  private config: SesConfig;
  private fromAddress: string;
  private fromName: string;

  constructor(config: SesConfig, fromAddress: string, fromName: string) {
    this.config = config;
    this.fromAddress = fromAddress;
    this.fromName = fromName;
  }

  async send(options: Omit<SendEmailOptions, 'tenantId'>): Promise<EmailSendResult> {
    try {
      // Dynamic import to avoid bundling AWS SDK if not used
      // Using a string variable to prevent TypeScript from analyzing the import
      const moduleName = '@aws-sdk/client-ses';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let awsSes: any;
      try {
        awsSes = await import(/* webpackIgnore: true */ moduleName);
      } catch {
        return {
          success: false,
          error: 'AWS SES SDK not installed. Run: npm install @aws-sdk/client-ses',
          provider: 'ses',
        };
      }

      const { SESClient, SendEmailCommand } = awsSes;

      const client = new SESClient({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });

      const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

      const command = new SendEmailCommand({
        Source: `"${this.fromName}" <${this.fromAddress}>`,
        Destination: {
          ToAddresses: toAddresses,
          CcAddresses: options.cc
            ? Array.isArray(options.cc)
              ? options.cc
              : [options.cc]
            : undefined,
          BccAddresses: options.bcc
            ? Array.isArray(options.bcc)
              ? options.bcc
              : [options.bcc]
            : undefined,
        },
        Message: {
          Subject: { Data: options.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: options.html, Charset: 'UTF-8' },
            Text: options.text ? { Data: options.text, Charset: 'UTF-8' } : undefined,
          },
        },
        ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
      });

      const response = await client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
        provider: 'ses',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown SES error';
      logger.error({ err: errorMessage }, '[SesProvider] Send failed');

      return {
        success: false,
        error: errorMessage,
        provider: 'ses',
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      // Dynamic import to avoid bundling AWS SDK if not used
      const moduleName = '@aws-sdk/client-ses';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let awsSes: any;
      try {
        awsSes = await import(/* webpackIgnore: true */ moduleName);
      } catch {
        return false;
      }

      const { SESClient, GetAccountSendingEnabledCommand } = awsSes;

      const client = new SESClient({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });

      const command = new GetAccountSendingEnabledCommand({});
      await client.send(command);

      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for SES
  }
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Get default SMTP configuration from environment variables
 */
export function getDefaultSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;

  if (!host || !port || !user || !password) {
    return null;
  }

  return {
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    user,
    password,
  };
}

/**
 * Get default email sender info from environment variables
 */
export function getDefaultSenderInfo(): { fromAddress: string; fromName: string } {
  return {
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@windparkmanager.de',
    fromName: process.env.EMAIL_FROM_NAME || 'WindparkManager',
  };
}

/**
 * Create an email provider based on configuration
 *
 * @param providerType - The provider type ('smtp', 'sendgrid', 'ses')
 * @param config - Provider configuration (may be encrypted)
 * @param fromAddress - Sender email address
 * @param fromName - Sender name
 * @returns EmailProvider instance or null if configuration is invalid
 */
export function createProvider(
  providerType: EmailProviderType,
  config: string | Record<string, unknown>,
  fromAddress: string,
  fromName: string
): EmailProvider | null {
  try {
    // Decrypt config if it's an encrypted string
    let parsedConfig: Record<string, unknown>;

    if (typeof config === 'string') {
      if (isEncrypted(config)) {
        parsedConfig = decryptConfig(config);
      } else {
        parsedConfig = JSON.parse(config);
      }
    } else {
      parsedConfig = config;
    }

    switch (providerType) {
      case 'smtp':
        return new SmtpProvider(parsedConfig as unknown as SmtpConfig, fromAddress, fromName);

      case 'sendgrid':
        return new SendGridProvider(parsedConfig as unknown as SendGridConfig, fromAddress, fromName);

      case 'ses':
        return new SesProvider(parsedConfig as unknown as SesConfig, fromAddress, fromName);

      default:
        logger.error(`[EmailProvider] Unknown provider type: ${providerType}`);
        return null;
    }
  } catch (error) {
    logger.error({ err: error }, '[EmailProvider] Failed to create provider');
    return null;
  }
}

/**
 * Get a provider for a tenant, falling back to environment variables
 *
 * @param tenantConfig - Optional tenant-specific configuration
 * @returns EmailProvider instance
 */
export function getProvider(tenantConfig?: {
  provider: EmailProviderType | null;
  config: string | null;
  fromAddress: string | null;
  fromName: string | null;
}): EmailProvider | null {
  // Try tenant-specific configuration first
  if (tenantConfig?.provider && tenantConfig?.config) {
    const provider = createProvider(
      tenantConfig.provider,
      tenantConfig.config,
      tenantConfig.fromAddress || getDefaultSenderInfo().fromAddress,
      tenantConfig.fromName || getDefaultSenderInfo().fromName
    );

    if (provider) {
      return provider;
    }
  }

  // Fall back to environment variables (SMTP only)
  const smtpConfig = getDefaultSmtpConfig();

  if (smtpConfig) {
    const senderInfo = getDefaultSenderInfo();
    return new SmtpProvider(smtpConfig, senderInfo.fromAddress, senderInfo.fromName);
  }

  logger.warn(
    '[EmailProvider] No email configuration available. ' +
      'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables or configure tenant email settings.'
  );

  return null;
}

// Provider instance cache for reuse
const providerCache = new Map<string, EmailProvider>();

/**
 * Get or create a cached provider for a tenant
 */
export function getCachedProvider(
  tenantId: string,
  tenantConfig?: {
    provider: EmailProviderType | null;
    config: string | null;
    fromAddress: string | null;
    fromName: string | null;
  }
): EmailProvider | null {
  const cacheKey = tenantConfig?.provider
    ? `${tenantId}-${tenantConfig.provider}`
    : `${tenantId}-env`;

  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey)!;
  }

  const provider = getProvider(tenantConfig);

  if (provider) {
    providerCache.set(cacheKey, provider);
  }

  return provider;
}

/**
 * Clear the provider cache (useful after config changes)
 */
export function clearProviderCache(tenantId?: string): void {
  if (tenantId) {
    // Clear only entries for this tenant
    for (const key of providerCache.keys()) {
      if (key.startsWith(tenantId)) {
        providerCache.delete(key);
      }
    }
  } else {
    providerCache.clear();
  }
}
