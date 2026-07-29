/**
 * Inbox OCR Worker - BullMQ Worker for incoming invoice text extraction
 *
 * Two-stage strategy:
 * 1. pdfjs-dist: extract text from digital PDFs (covers >80% of invoices)
 * 2. tesseract.js: OCR fallback for scanned/image-only PDFs
 *
 * Extracted text is parsed with invoice-extractor.ts regex patterns.
 */

import { Worker, Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import { getRedisConnection } from "../connection";
import { jobLogger as logger } from "@/lib/logger";
import { getFileBuffer } from "@/lib/storage";
import { extractInvoiceFields } from "@/lib/ocr/invoice-extractor";
import type { InboxOcrJobData, InboxOcrJobResult } from "../queues/inbox-ocr.queue";
import { INBOX_OCR_QUEUE_NAME } from "../queues/inbox-ocr.queue";

// Lazy import to avoid loading heavy libs at startup
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: { str?: string }) => (item.str ?? ""))
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n");
}

async function extractTextWithTesseract(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Tesseract = require("tesseract.js");
  const worker = await Tesseract.createWorker("deu");
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function processInboxOcrJob(
  job: Job<InboxOcrJobData, InboxOcrJobResult>
): Promise<InboxOcrJobResult> {
  const { invoiceId, fileUrl } = job.data;

  // Lazy prisma import to avoid edge runtime issues
  const { prisma } = await import("@/lib/prisma");

  logger.info({ jobId: job.id, invoiceId }, "[InboxOcr Worker] Starting OCR");

  await prisma.incomingInvoice.update({
    where: { id: invoiceId },
    data: { ocrStatus: "PROCESSING", status: "OCR_PROCESSING" },
  });

  let rawText = "";

  // F16: Die Fehlerklassifikation war invertiert — JEDER Fehler, auch ein
  // S3-Timeout beim Laden, fuehrte zu `return {success:false}` und damit zu
  // KEINEM Retry, plus ocrStatus hart auf FAILED. Ein Netzwerkschluckauf
  // machte die Rechnung dauerhaft unlesbar.
  //
  // Deshalb getrennt: eine Datei, die sich nicht LADEN laesst, ist ein
  // Infrastrukturproblem (transient -> throw, BullMQ wiederholt). Eine Datei,
  // die sich nicht PARSEN laesst, ist ein Datenproblem (permanent -> FAILED).
  // ACHTUNG, bewusst anders gezaehlt als in lib/queue/dead-letter.ts:
  // hier laufen wir INNERHALB des Prozessors, `attemptsMade` ist fuer den
  // laufenden Versuch noch nicht hochgezaehlt (BullMQ macht das erst in
  // moveToFailed) — deshalb `+ 1`. Im `failed`-Event ist es bereits gezaehlt.
  const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await getFileBuffer(fileUrl);
  } catch (err) {
    logger.error(
      { err, invoiceId, attempt: job.attemptsMade + 1, isFinalAttempt },
      "[InboxOcr Worker] Datei konnte nicht geladen werden (transient)",
    );

    // Erst wenn kein Versuch mehr folgt, den Datensatz festschreiben — sonst
    // bliebe er bei PROCESSING haengen, wenn alle Versuche scheitern.
    if (isFinalAttempt) {
      await prisma.incomingInvoice.update({
        where: { id: invoiceId },
        data: { ocrStatus: "FAILED", status: "REVIEW" },
      });
    }

    // Werfen statt zurueckgeben: nur so retryt BullMQ und nur so landet der
    // endgueltige Fehlschlag in der Dead-Letter-Queue.
    throw err instanceof Error ? err : new Error(String(err));
  }

  try {
    // Stage 1: Try pdfjs-dist for digital text
    rawText = await extractTextFromPdf(fileBuffer);

    // Stage 2: If too little text found, fall back to Tesseract OCR
    const wordCount = rawText.trim().split(/\s+/).length;
    if (wordCount < 20) {
      logger.info(
        { invoiceId, wordCount },
        "[InboxOcr Worker] Low word count, falling back to Tesseract"
      );
      rawText = await extractTextWithTesseract(fileBuffer);
    }
  } catch (err) {
    // Parse-Fehler sind dateibezogen und permanent — ein Retry liest dieselben
    // Bytes noch dreimal. Zur manuellen Sichtung in REVIEW geben.
    logger.error({ err, invoiceId }, "[InboxOcr Worker] Text extraction failed");

    await prisma.incomingInvoice.update({
      where: { id: invoiceId },
      data: { ocrStatus: "FAILED", status: "REVIEW" },
    });

    return { success: false, error: String(err) };
  }

  // Parse extracted text for invoice fields
  const fields = extractInvoiceFields(rawText);

  // Count non-null fields extracted
  const fieldsExtracted = Object.values(fields).filter((v) => v !== null).length;

  // Build update data from extracted fields
  const updateData: Record<string, unknown> = {
    ocrStatus: "DONE",
    ocrRawText: rawText.slice(0, 100000), // limit storage
    status: "REVIEW",
  };

  if (fields.invoiceNumber) updateData.invoiceNumber = fields.invoiceNumber;
  if (fields.invoiceDate) updateData.invoiceDate = fields.invoiceDate;
  if (fields.dueDate) updateData.dueDate = fields.dueDate;
  if (fields.grossAmount !== null) updateData.grossAmount = fields.grossAmount;
  if (fields.netAmount !== null) updateData.netAmount = fields.netAmount;
  if (fields.vatAmount !== null) updateData.vatAmount = fields.vatAmount;
  if (fields.vatRate !== null) updateData.vatRate = fields.vatRate;
  if (fields.iban) updateData.iban = fields.iban;
  if (fields.bic) updateData.bic = fields.bic;
  if (fields.paymentReference) updateData.paymentReference = fields.paymentReference;

  await prisma.incomingInvoice.update({
    where: { id: invoiceId },
    data: updateData as Prisma.IncomingInvoiceUpdateInput,
  });

  logger.info(
    { invoiceId, fieldsExtracted },
    "[InboxOcr Worker] OCR complete"
  );

  return { success: true, fieldsExtracted };
}

let inboxOcrWorker: Worker | null = null;

export const startInboxOcrWorker = (): Worker => {
  if (inboxOcrWorker) return inboxOcrWorker;

  const connection = getRedisConnection();

  inboxOcrWorker = new Worker<InboxOcrJobData, InboxOcrJobResult>(
    INBOX_OCR_QUEUE_NAME,
    processInboxOcrJob,
    {
      connection,
      concurrency: 2, // OCR is CPU-intensive, limit concurrency
    }
  );

  inboxOcrWorker.on("completed", (job, result) => {
    logger.info(
      { jobId: job.id, result },
      `[Worker:${INBOX_OCR_QUEUE_NAME}] Job completed`
    );
  });

  inboxOcrWorker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      `[Worker:${INBOX_OCR_QUEUE_NAME}] Job failed`
    );
  });

  logger.info(`[Worker:${INBOX_OCR_QUEUE_NAME}] Started`);
  return inboxOcrWorker;
};

export const stopInboxOcrWorker = async (): Promise<void> => {
  if (inboxOcrWorker) {
    await inboxOcrWorker.close();
    inboxOcrWorker = null;
    logger.info(`[Worker:${INBOX_OCR_QUEUE_NAME}] Stopped`);
  }
};

export function isInboxOcrWorkerRunning(): boolean {
  return inboxOcrWorker !== null;
}

export function getInboxOcrWorker(): Worker | null {
  return inboxOcrWorker;
}
