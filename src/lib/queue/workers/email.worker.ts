/**
 * Email Worker - Verarbeitet Jobs aus der "email" Queue
 *
 * Dieser Worker ist verantwortlich für das Versenden von E-Mails
 * unter Verwendung der Email-Provider-Abstraktion.
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { emailLogger } from "@/lib/logger";
import { EMAIL_REGEX } from "@/lib/validation/patterns";

// =============================================================================
// Types
// =============================================================================

// F3: Der Job-Vertrag liegt im Queue-Modul (single source of truth). Vorher
// definierte dieser Worker eine eigene, mit den Producern unvereinbare Version
// desselben Namens — gleicher Typname, anderes Datenmodell, kein Import
// dazwischen, also fuer TypeScript unsichtbar.
import type { EmailJobData } from "../queues/email.queue";

export type { EmailJobData, EmailTemplate } from "../queues/email.queue";

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

/** Mask email addresses in log output to protect PII */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

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
async function sendEmail(data: EmailJobData, jobId: string): Promise<EmailJobResult> {
  log("info", jobId, `Sending email to ${maskEmail(data.to)}`, {
    template: data.template,
    subject: data.subject,
    hasAttachments: !!data.attachments?.length,
  });

  try {
    // Dynamischer Import um zirkulaere Abhaengigkeiten zu vermeiden
    const { renderEmail, isSupportedTemplate } = await import("@/lib/email/renderer");
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

    // Template rendern. Die Liste der renderbaren Templates kommt aus dem
    // Renderer selbst (isSupportedTemplate) — vorher stand sie hier ein
    // zweites Mal von Hand und war falsch: 'invoice-reminder' fehlte, also
    // ging ausgerechnet die Mahnung in den Fallback-Zweig.
    let html = "";
    let text = "";

    if (data.template && isSupportedTemplate(data.template)) {
      const rendered = await renderEmail(
        data.template,
        data.data as unknown as Parameters<typeof renderEmail>[1],
        data.tenantId
      );
      html = rendered.html;
      text = rendered.text;
    } else {
      // Ohne Template: einfache HTML-Mail aus den Job-Daten. Der optionale
      // Zugriff schuetzt zusaetzlich gegen Alt-Jobs, die noch mit dem
      // kaputten Schema in der Queue liegen (dort fehlt `data` ganz).
      const payload = (data.data ?? {}) as Record<string, unknown>;
      if (data.template) {
        // Template gesetzt, aber nicht renderbar -> Alt-Job oder Tippfehler.
        log("warn", jobId, "Unknown email template — sending plain HTML instead", {
          template: data.template,
        });
      }
      html = (payload.html as string) || `<p>${data.subject}</p>`;
      text = (payload.text as string) || data.subject;
    }

    // E-Mail senden
    const result = await provider.send({
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      html,
      text,
      // Durchreichen statt umkodieren: EmailAttachment akzeptiert genau diese
      // Form. Das frühere Buffer.from(att.content, "base64") setzte voraus,
      // dass jeder Producer base64 liefert, und warf bei fehlendem content.
      attachments: data.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        path: att.path,
        contentType: att.contentType,
        encoding: att.content ? ("base64" as const) : undefined,
      })),
    });

    if (!result.success) {
      throw new Error(result.error || "E-Mail-Versand fehlgeschlagen");
    }

    log("info", jobId, `Email sent successfully`, {
      messageId: result.messageId,
      to: maskEmail(data.to),
      provider: result.provider,
    });

    return {
      success: true,
      messageId: result.messageId,
      sentAt: new Date(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log("error", jobId, `Email sending failed`, { error: errorMessage });

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
 * Verarbeitet einen E-Mail-Job.
 *
 * Läuft innerhalb eines Request-Context damit alle Logger im Call-Stack
 * automatisch jobId/tenantId als correlation-IDs mitloggen — bei Bugs
 * in Produktion kann man requestId aus Sentry direkt in Logs suchen.
 */
async function processEmailJob(job: Job<EmailJobData, EmailJobResult>): Promise<EmailJobResult> {
  const { withRequestContext, generateRequestId } = await import("@/lib/request-context");
  return withRequestContext(
    {
      requestId: generateRequestId(),
      tenantId: job.data.tenantId,
      jobId: job.data.jobId || job.id || undefined,
      queueName: "email",
    },
    () => processEmailJobInner(job),
  );
}

async function processEmailJobInner(job: Job<EmailJobData, EmailJobResult>): Promise<EmailJobResult> {
  const { data } = job;
  const jobId = data.jobId || job.id || "unknown";

  log("info", jobId, `Processing email job`, {
    template: data.template,
    to: maskEmail(data.to),
    attempt: job.attemptsMade + 1,
  });

  try {
    // Validiere Pflichtfelder
    if (!data.to || !data.subject) {
      throw new Error("Missing required fields: to, subject");
    }

    // E-Mail validieren (einfache Prüfung)
    if (!EMAIL_REGEX.test(data.to)) {
      throw new Error(`Invalid email address: ${maskEmail(data.to)}`);
    }

    // E-Mail senden
    const result = await sendEmail(data, jobId);

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
    // F18: DLQ-Persistenz haengt zentral in der Worker-Registry.
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
