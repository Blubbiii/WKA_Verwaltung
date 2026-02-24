/**
 * PDF Worker - Verarbeitet Jobs aus der "pdf" Queue
 *
 * Dieser Worker generiert verschiedene PDF-Dokumente:
 * - Rechnungen (invoice)
 * - Abstimmungsergebnisse (vote-result)
 * - Settlement Reports (settlement-report)
 */

import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../connection";
import { uploadFile } from "@/lib/storage";
import { generateInvoicePdf } from "@/lib/pdf/generators/invoicePdf";
import { generateVoteResultPdf } from "@/lib/pdf/generators/voteResultPdf";
import { generateSettlementReportPdf } from "@/lib/pdf/generators/settlementReportPdf";
import { jobLogger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

/**
 * PDF-Typen die generiert werden können
 */
export type PdfType = "invoice" | "vote-result" | "settlement-report";

/**
 * Basis-Interface für alle PDF-Jobs
 */
interface BasePdfJobData {
  /** Eindeutige Job-ID für Tracking */
  jobId: string;
  /** Typ des zu generierenden PDFs */
  type: PdfType;
  /** Tenant-ID für Multi-Tenancy */
  tenantId: string;
  /** Ob das PDF gespeichert werden soll */
  saveToStorage?: boolean;
  /** Optionaler Dateiname (ohne Extension) */
  filename?: string;
}

/**
 * Job-Daten für Rechnungs-PDF
 */
export interface InvoicePdfJobData extends BasePdfJobData {
  type: "invoice";
  /** ID der Rechnung */
  invoiceId: string;
}

/**
 * Job-Daten für Abstimmungsergebnis-PDF
 */
export interface VoteResultPdfJobData extends BasePdfJobData {
  type: "vote-result";
  /** ID der Abstimmung */
  voteId: string;
  /** Ob Unterschriftszeile angezeigt werden soll */
  showSignatureLine?: boolean;
}

/**
 * Job-Daten für Settlement Report PDF
 */
export interface SettlementReportPdfJobData extends BasePdfJobData {
  type: "settlement-report";
  /** ID der Abrechnungsperiode */
  periodId: string;
}

/**
 * Union-Typ für alle PDF-Job-Daten
 */
export type PdfJobData = InvoicePdfJobData | VoteResultPdfJobData | SettlementReportPdfJobData;

/**
 * Ergebnis nach PDF-Generierung
 */
export interface PdfJobResult {
  success: boolean;
  /** S3-Key wenn gespeichert */
  storageKey?: string;
  /** Base64-kodiertes PDF wenn nicht gespeichert */
  pdfBase64?: string;
  /** Dateigröße in Bytes */
  fileSizeBytes?: number;
  /** Fehler wenn fehlgeschlagen */
  error?: string;
  /** Zeitpunkt der Generierung */
  generatedAt?: Date;
}

// =============================================================================
// Logger
// =============================================================================

const logger = jobLogger.child({ component: "pdf-worker" });

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
// PDF Generators
// =============================================================================

/**
 * Generiert ein Rechnungs-PDF
 */
async function generateInvoice(data: InvoicePdfJobData): Promise<Buffer> {
  log("info", data.jobId, `Generating invoice PDF`, { invoiceId: data.invoiceId });

  const buffer = await generateInvoicePdf(data.invoiceId);

  log("info", data.jobId, `Invoice PDF generated`, {
    invoiceId: data.invoiceId,
    sizeBytes: buffer.length,
  });

  return buffer;
}

/**
 * Generiert ein Abstimmungsergebnis-PDF
 */
async function generateVoteResult(data: VoteResultPdfJobData): Promise<Buffer> {
  log("info", data.jobId, `Generating vote result PDF`, { voteId: data.voteId });

  const buffer = await generateVoteResultPdf(data.voteId, {
    showSignatureLine: data.showSignatureLine ?? true,
  });

  log("info", data.jobId, `Vote result PDF generated`, {
    voteId: data.voteId,
    sizeBytes: buffer.length,
  });

  return buffer;
}

/**
 * Generiert ein Settlement Report PDF
 */
async function generateSettlementReport(data: SettlementReportPdfJobData): Promise<Buffer> {
  log("info", data.jobId, `Generating settlement report PDF`, { periodId: data.periodId });

  const buffer = await generateSettlementReportPdf(data.periodId, data.tenantId);

  log("info", data.jobId, `Settlement report PDF generated`, {
    periodId: data.periodId,
    sizeBytes: buffer.length,
  });

  return buffer;
}

// =============================================================================
// Job Processor
// =============================================================================

/**
 * Verarbeitet einen PDF-Job
 */
async function processPdfJob(job: Job<PdfJobData, PdfJobResult>): Promise<PdfJobResult> {
  const { data } = job;
  const jobId = data.jobId || job.id || "unknown";

  log("info", jobId, `Processing PDF job`, {
    type: data.type,
    tenantId: data.tenantId,
    attempt: job.attemptsMade + 1,
  });

  try {
    let pdfBuffer: Buffer;
    let defaultFilename: string;

    // PDF basierend auf Typ generieren
    switch (data.type) {
      case "invoice": {
        const invoiceData = data as InvoicePdfJobData;
        if (!invoiceData.invoiceId) {
          throw new Error("Missing required field: invoiceId");
        }
        pdfBuffer = await generateInvoice(invoiceData);
        defaultFilename = `invoice_${invoiceData.invoiceId}`;
        break;
      }

      case "vote-result": {
        const voteData = data as VoteResultPdfJobData;
        if (!voteData.voteId) {
          throw new Error("Missing required field: voteId");
        }
        pdfBuffer = await generateVoteResult(voteData);
        defaultFilename = `vote_result_${voteData.voteId}`;
        break;
      }

      case "settlement-report": {
        const settlementData = data as SettlementReportPdfJobData;
        if (!settlementData.periodId) {
          throw new Error("Missing required field: periodId");
        }
        pdfBuffer = await generateSettlementReport(settlementData);
        defaultFilename = `settlement_report_${settlementData.periodId}`;
        break;
      }

      default: {
        // TypeScript exhaustive check
        const exhaustiveCheck: never = data;
        throw new Error(`Unknown PDF type: ${(exhaustiveCheck as PdfJobData).type}`);
      }
    }

    const result: PdfJobResult = {
      success: true,
      fileSizeBytes: pdfBuffer.length,
      generatedAt: new Date(),
    };

    // PDF speichern wenn gewuenscht
    if (data.saveToStorage !== false) {
      const filename = `${data.filename || defaultFilename}.pdf`;

      log("info", jobId, `Saving PDF to storage`, { filename });

      const storageKey = await uploadFile(pdfBuffer, filename, "application/pdf", data.tenantId);

      result.storageKey = storageKey;

      log("info", jobId, `PDF saved to storage`, {
        storageKey,
        fileSizeBytes: pdfBuffer.length,
      });
    } else {
      // PDF als Base64 zurückgeben
      result.pdfBase64 = pdfBuffer.toString("base64");
    }

    log("info", jobId, `PDF job completed successfully`, {
      type: data.type,
      storageKey: result.storageKey,
      fileSizeBytes: result.fileSizeBytes,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    log("error", jobId, `PDF job failed`, {
      type: data.type,
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

let pdfWorker: Worker<PdfJobData, PdfJobResult> | null = null;

/**
 * Startet den PDF-Worker
 */
export function startPdfWorker(): Worker<PdfJobData, PdfJobResult> {
  if (pdfWorker) {
    logger.info("PDF worker already running");
    return pdfWorker;
  }

  const connection = getRedisConnection();

  pdfWorker = new Worker<PdfJobData, PdfJobResult>("pdf", processPdfJob, {
    connection,
    concurrency: 5,
    // Kein Sandbox-Modus für Next.js Kompatibilitaet
    useWorkerThreads: false,
    // PDF-Generierung kann laenger dauern
    lockDuration: 120000, // 2 Minuten
  });

  // Event-Handler
  pdfWorker.on("completed", (job, result) => {
    log("info", job.data.jobId || job.id || "unknown", "Job completed", {
      type: job.data.type,
      storageKey: result.storageKey,
      fileSizeBytes: result.fileSizeBytes,
    });
  });

  pdfWorker.on("failed", (job, error) => {
    const jobId = job?.data?.jobId || job?.id || "unknown";
    log("error", jobId, "Job failed permanently", {
      type: job?.data?.type,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  });

  pdfWorker.on("error", (error) => {
    logger.error({ err: error }, "PDF worker error");
  });

  pdfWorker.on("stalled", (jobId) => {
    log("warn", jobId, "Job stalled - will be retried");
  });

  pdfWorker.on("progress", (job, progress) => {
    log("info", job.data.jobId || job.id || "unknown", `Job progress: ${progress}%`);
  });

  logger.info({ concurrency: 5 }, "PDF worker started");

  return pdfWorker;
}

/**
 * Stoppt den PDF-Worker gracefully
 */
export async function stopPdfWorker(): Promise<void> {
  if (!pdfWorker) {
    logger.info("No PDF worker running");
    return;
  }

  logger.info("Stopping PDF worker...");

  try {
    await pdfWorker.close();
    pdfWorker = null;
    logger.info("PDF worker stopped gracefully");
  } catch (error) {
    logger.error({ err: error }, "Error stopping PDF worker");
    throw error;
  }
}

/**
 * Prueft ob der Worker läuft
 */
export function isPdfWorkerRunning(): boolean {
  return pdfWorker !== null && pdfWorker.isRunning();
}

/**
 * Gibt den Worker zurück (für Health-Checks)
 */
export function getPdfWorker(): Worker<PdfJobData, PdfJobResult> | null {
  return pdfWorker;
}
