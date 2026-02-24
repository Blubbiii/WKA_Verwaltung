/**
 * Email Worker - Verarbeitet Jobs aus der "email" Queue
 *
 * Dieser Worker ist verantwortlich für das Versenden von E-Mails
 * unter Verwendung der Email-Provider-Abstraktion.
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { emailLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

/**
 * Job-Daten für E-Mail-Versand
 */
export interface EmailJobData {
  /** Eindeutige Job-ID für Tracking */
  jobId: string;
  /** E-Mail-Typ für unterschiedliche Templates */
  type:
    | "welcome"
    | "password-reset"
    | "invoice"
    | "notification"
    | "vote-invitation"
    | "vote-reminder"
    | "settlement-report"
    | "new-invoice"
    | "vote-result"
    | "document-shared"
    | "news-announcement"
    | "service-event";
  /** Empfänger-E-Mail-Adresse */
  to: string;
  /** CC-Empfänger (optional) */
  cc?: string[];
  /** BCC-Empfänger (optional) */
  bcc?: string[];
  /** E-Mail-Betreff */
  subject: string;
  /** Template-Variablen */
  templateData: Record<string, unknown>;
  /** Anhaenge (optional) */
  attachments?: Array<{
    filename: string;
    content: string; // Base64-encoded
    contentType: string;
  }>;
  /** Tenant-ID für Multi-Tenancy */
  tenantId: string;
  /** Prioritaet (1 = hoechste) */
  priority?: number;
}

/**
 * Ergebnis nach E-Mail-Versand
 */
export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt?: Date;
}

// =============================================================================
// Logger
// =============================================================================

const logger = emailLogger.child({ component: "email-worker" });

function log(level: "info" | "warn" | "error", jobId: string, message: string, meta?: Record<string, unknown>): void {
  const logData = { jobId, ...meta };
  if (level === "error") {
    logger.error(logData, message);
  } else if (level === "warn") {
    logger.warn(logData, message);
  } else {
    logger.info(logData, message);
  }
}

// =============================================================================
// Email Sending (Real Implementation)
// =============================================================================

/**
 * Sendet eine E-Mail unter Verwendung der Email-Provider-Abstraktion
 */
async function sendEmail(data: EmailJobData): Promise<EmailJobResult> {
  log("info", data.jobId, `Sending email to ${data.to}`, {
    type: data.type,
    subject: data.subject,
    hasAttachments: !!data.attachments?.length,
  });

  try {
    // Dynamischer Import um zirkulaere Abhaengigkeiten zu vermeiden
    const { renderEmail } = await import("@/lib/email/renderer");
    const { getCachedProvider } = await import("@/lib/email/provider");
    const { prisma } = await import("@/lib/prisma");

    // Hole Tenant-Konfiguration
    // Note: emailProvider, emailConfig, emailFromAddress, emailFromName are new fields
    const tenant = await prisma.tenant.findUnique({
      where: { id: data.tenantId },
    }) as {
      emailProvider?: string | null;
      emailConfig?: unknown;
      emailFromAddress?: string | null;
      emailFromName?: string | null;
    } | null;

    // Provider holen
    const provider = getCachedProvider(data.tenantId, {
      provider: tenant?.emailProvider as "smtp" | "sendgrid" | "ses" | null,
      config: tenant?.emailConfig as string | null,
      fromAddress: tenant?.emailFromAddress || null,
      fromName: tenant?.emailFromName || null,
    });

    if (!provider) {
      throw new Error("Kein E-Mail-Provider konfiguriert");
    }

    // Template rendern (wenn es ein bekanntes Template ist)
    let html = "";
    let text = "";

    const knownTemplates: string[] = [
      "welcome", "password-reset", "new-invoice", "vote-invitation",
      "tenant-admin-invitation", "portal-invitation", "vote-reminder",
      "vote-result", "document-shared", "settlement-notification",
      "news-announcement", "service-event", "report-ready",
    ];

    if (knownTemplates.includes(data.type)) {
      const rendered = await renderEmail(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.type as any,
        data.templateData as unknown as Parameters<typeof renderEmail>[1],
        data.tenantId
      );
      html = rendered.html;
      text = rendered.text;
    } else {
      // Fallback: Einfaches HTML aus templateData
      html = (data.templateData.html as string) || `<p>${data.subject}</p>`;
      text = (data.templateData.text as string) || data.subject;
    }

    // E-Mail senden
    const result = await provider.send({
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      html,
      text,
      attachments: data.attachments?.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType,
      })),
    });

    if (!result.success) {
      throw new Error(result.error || "E-Mail-Versand fehlgeschlagen");
    }

    log("info", data.jobId, `Email sent successfully`, {
      messageId: result.messageId,
      to: data.to,
      provider: result.provider,
    });

    return {
      success: true,
      messageId: result.messageId,
      sentAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log("error", data.jobId, `Email sending failed`, { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// =============================================================================
// Job Processor
// =============================================================================

/**
 * Verarbeitet einen E-Mail-Job
 */
async function processEmailJob(job: Job<EmailJobData, EmailJobResult>): Promise<EmailJobResult> {
  const { data } = job;
  const jobId = data.jobId || job.id || "unknown";

  log("info", jobId, `Processing email job`, {
    type: data.type,
    to: data.to,
    attempt: job.attemptsMade + 1,
  });

  try {
    // Validiere Pflichtfelder
    if (!data.to || !data.subject) {
      throw new Error("Missing required fields: to, subject");
    }

    // E-Mail validieren (einfache Prüfung)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.to)) {
      throw new Error(`Invalid email address: ${data.to}`);
    }

    // E-Mail senden
    const result = await sendEmail(data);

    if (!result.success) {
      throw new Error(result.error || "Unknown email sending error");
    }

    log("info", jobId, `Email job completed successfully`, {
      messageId: result.messageId,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    log("error", jobId, `Email job failed`, {
      error: errorMessage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 3,
    });

    // Re-throw für BullMQ Retry-Logik
    throw error;
  }
}

// =============================================================================
// Worker Instance
// =============================================================================

let emailWorker: Worker<EmailJobData, EmailJobResult> | null = null;

/**
 * Startet den E-Mail-Worker
 */
export function startEmailWorker(): Worker<EmailJobData, EmailJobResult> {
  if (emailWorker) {
    logger.info("Email worker already running");
    return emailWorker;
  }

  const connection = getRedisConnection();

  emailWorker = new Worker<EmailJobData, EmailJobResult>("email", processEmailJob, {
    connection,
    concurrency: 5,
    // Kein Sandbox-Modus für Next.js Kompatibilitaet
    useWorkerThreads: false,
    // Retry-Einstellungen
    limiter: {
      max: 100,
      duration: 60000, // Max 100 E-Mails pro Minute
    },
  });

  // Event-Handler
  emailWorker.on("completed", (job, result) => {
    log("info", job.data.jobId || job.id || "unknown", "Job completed", {
      messageId: result.messageId,
    });
  });

  emailWorker.on("failed", (job, error) => {
    const jobId = job?.data?.jobId || job?.id || "unknown";
    log("error", jobId, "Job failed permanently", {
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  emailWorker.on("error", (error) => {
    logger.error({ err: error }, "Email worker error");
  });

  emailWorker.on("stalled", (jobId) => {
    log("warn", jobId, "Job stalled - will be retried");
  });

  logger.info({ concurrency: 5 }, "Email worker started");

  return emailWorker;
}

/**
 * Stoppt den E-Mail-Worker gracefully
 */
export async function stopEmailWorker(): Promise<void> {
  if (!emailWorker) {
    logger.info("No email worker running");
    return;
  }

  logger.info("Stopping email worker...");

  try {
    await emailWorker.close();
    emailWorker = null;
    logger.info("Email worker stopped gracefully");
  } catch (error) {
    logger.error({ err: error }, "Error stopping email worker");
    throw error;
  }
}

/**
 * Prueft ob der Worker läuft
 */
export function isEmailWorkerRunning(): boolean {
  return emailWorker !== null && emailWorker.isRunning();
}

/**
 * Gibt den Worker zurück (für Health-Checks)
 */
export function getEmailWorker(): Worker<EmailJobData, EmailJobResult> | null {
  return emailWorker;
}
