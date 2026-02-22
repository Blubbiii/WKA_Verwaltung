/**
 * Scheduled Report Service
 *
 * Handles automatic generation and delivery of scheduled reports.
 * Called by the BullMQ report worker on a daily cron schedule.
 */

import { prisma } from "@/lib/prisma";
import { ScheduledReportSchedule, ScheduledReportType, ReportFormat } from "@prisma/client";
import { logger } from "@/lib/logger";
import { saveGeneratedReport, mapReportTypeToEnum } from "@/lib/reports/archive";
import { generateMonthlyReportPdf } from "@/lib/pdf/generators/monthlyReportPdf";
import { generateAnnualReportPdf } from "@/lib/pdf/generators/annualReportPdf";
import { enqueueEmail } from "@/lib/queue";

// ===========================================
// TYPES
// ===========================================

interface ScheduledReportConfig {
  parkId?: string;
  fundId?: string;
  modules?: string[];
  format?: string;
}

interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ reportId: string; reportName: string; error: string }>;
}

// ===========================================
// MAIN PROCESSING FUNCTION
// ===========================================

/**
 * Process all due scheduled reports.
 *
 * This is the main entry point called by the cron job worker.
 * It queries all enabled scheduled reports where nextRunAt <= now(),
 * generates each report, stores it in the archive, sends email
 * notifications to recipients, and updates scheduling timestamps.
 */
export async function processScheduledReports(): Promise<ProcessResult> {
  const now = new Date();
  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  logger.info("[ScheduledReports] Starting scheduled report processing...");

  // Find all enabled reports that are due
  const dueReports = await prisma.scheduledReport.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
    },
    include: {
      tenant: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  if (dueReports.length === 0) {
    logger.info("[ScheduledReports] No due reports found.");
    return result;
  }

  logger.info(
    { count: dueReports.length },
    `[ScheduledReports] Found ${dueReports.length} due report(s) to process.`
  );

  // Process each report sequentially to avoid overwhelming resources
  for (const scheduledReport of dueReports) {
    result.processed++;

    try {
      logger.info(
        { reportId: scheduledReport.id, name: scheduledReport.name },
        `[ScheduledReports] Processing: ${scheduledReport.name}`
      );

      const config = scheduledReport.config as ScheduledReportConfig;

      // Generate the report PDF
      const { pdfBuffer, title, filename } = await generateReportByType(
        scheduledReport.reportType,
        config,
        scheduledReport.tenantId
      );

      // Store as GeneratedReport in archive
      const generatedReport = await saveGeneratedReport({
        title: `[Geplant] ${title}`,
        reportType: mapScheduledTypeToReportType(scheduledReport.reportType),
        format: ReportFormat.PDF,
        fileBuffer: pdfBuffer,
        fileName: filename,
        mimeType: "application/pdf",
        tenantId: scheduledReport.tenantId,
        generatedById: scheduledReport.createdById,
        parameters: {
          scheduledReportId: scheduledReport.id,
          scheduledReportName: scheduledReport.name,
          ...config,
        },
      });

      // Send email notifications to all recipients
      if (scheduledReport.recipients.length > 0) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const downloadUrl = `${appUrl}/reports/archive?reportId=${generatedReport.id}`;

        for (const recipientEmail of scheduledReport.recipients) {
          try {
            await enqueueEmail({
              to: recipientEmail,
              subject: `Geplanter Bericht: ${scheduledReport.name}`,
              template: "report-ready",
              data: {
                reportName: scheduledReport.name,
                reportTitle: title,
                tenantName: scheduledReport.tenant.name,
                downloadUrl,
                generatedAt: now.toISOString(),
              },
              tenantId: scheduledReport.tenantId,
            });
          } catch (emailError) {
            logger.error(
              { err: emailError, recipient: recipientEmail, reportId: scheduledReport.id },
              `[ScheduledReports] Failed to enqueue email for ${recipientEmail}`
            );
            // Continue with other recipients even if one fails
          }
        }
      }

      // Update scheduling: set lastRunAt and calculate nextRunAt
      const nextRun = calculateNextRun(scheduledReport.schedule, now);

      await prisma.scheduledReport.update({
        where: { id: scheduledReport.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRun,
        },
      });

      result.succeeded++;

      logger.info(
        {
          reportId: scheduledReport.id,
          name: scheduledReport.name,
          nextRunAt: nextRun.toISOString(),
        },
        `[ScheduledReports] Completed: ${scheduledReport.name}. Next run: ${nextRun.toISOString()}`
      );
    } catch (error) {
      result.failed++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      result.errors.push({
        reportId: scheduledReport.id,
        reportName: scheduledReport.name,
        error: errorMessage,
      });

      logger.error(
        { err: error, reportId: scheduledReport.id, name: scheduledReport.name },
        `[ScheduledReports] Failed to process: ${scheduledReport.name}`
      );

      // Still update nextRunAt so we don't keep retrying a broken report every minute
      try {
        const nextRun = calculateNextRun(scheduledReport.schedule, now);
        await prisma.scheduledReport.update({
          where: { id: scheduledReport.id },
          data: {
            nextRunAt: nextRun,
          },
        });
      } catch {
        // If even the update fails, just log and move on
        logger.error(
          { reportId: scheduledReport.id },
          "[ScheduledReports] Failed to update nextRunAt after error"
        );
      }
    }
  }

  logger.info(
    {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    },
    `[ScheduledReports] Processing complete: ${result.succeeded}/${result.processed} succeeded, ${result.failed} failed.`
  );

  return result;
}

// ===========================================
// REPORT GENERATION BY TYPE
// ===========================================

/**
 * Generate the actual report based on the scheduled report type.
 * Reuses existing PDF generation logic from the pdf/generators module.
 */
async function generateReportByType(
  reportType: ScheduledReportType,
  config: ScheduledReportConfig,
  tenantId: string
): Promise<{ pdfBuffer: Buffer; title: string; filename: string }> {
  const now = new Date();

  switch (reportType) {
    case "MONTHLY_PRODUCTION": {
      // Default to previous month if not specified
      const targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() - 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      if (!config.parkId) {
        throw new Error("parkId is required for MONTHLY_PRODUCTION report");
      }

      const park = await prisma.park.findFirst({
        where: { id: config.parkId, tenantId },
        select: { name: true },
      });

      if (!park) {
        throw new Error(`Park not found: ${config.parkId}`);
      }

      const pdfBuffer = await generateMonthlyReportPdf(
        config.parkId,
        year,
        month,
        tenantId
      );

      const monthNames = [
        "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
      ];

      return {
        pdfBuffer,
        title: `Monatsbericht ${park.name} - ${monthNames[month - 1]} ${year}`,
        filename: `Monatsbericht_${park.name.replace(/\s+/g, "_")}_${year}_${String(month).padStart(2, "0")}.pdf`,
      };
    }

    case "QUARTERLY_FINANCIAL": {
      // Determine previous quarter
      const targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() - 3);
      const year = targetDate.getFullYear();
      const quarter = Math.floor(targetDate.getMonth() / 3) + 1;

      if (!config.parkId) {
        throw new Error("parkId is required for QUARTERLY_FINANCIAL report");
      }

      const park = await prisma.park.findFirst({
        where: { id: config.parkId, tenantId },
        select: { name: true },
      });

      if (!park) {
        throw new Error(`Park not found: ${config.parkId}`);
      }

      // Generate a monthly report for the last month of the quarter as a summary
      // (Quarterly reports use the same PDF generator with the quarter's last month)
      const lastMonthOfQuarter = quarter * 3;
      const pdfBuffer = await generateMonthlyReportPdf(
        config.parkId,
        year,
        lastMonthOfQuarter,
        tenantId
      );

      return {
        pdfBuffer,
        title: `Quartalsbericht ${park.name} - Q${quarter} ${year}`,
        filename: `Quartalsbericht_${park.name.replace(/\s+/g, "_")}_${year}_Q${quarter}.pdf`,
      };
    }

    case "ANNUAL_SUMMARY": {
      // Default to previous year
      const year = now.getFullYear() - 1;

      if (!config.parkId) {
        throw new Error("parkId is required for ANNUAL_SUMMARY report");
      }

      const park = await prisma.park.findFirst({
        where: { id: config.parkId, tenantId },
        select: { name: true },
      });

      if (!park) {
        throw new Error(`Park not found: ${config.parkId}`);
      }

      const pdfBuffer = await generateAnnualReportPdf(
        config.parkId,
        year,
        tenantId
      );

      return {
        pdfBuffer,
        title: `Jahresbericht ${park.name} - ${year}`,
        filename: `Jahresbericht_${park.name.replace(/\s+/g, "_")}_${year}.pdf`,
      };
    }

    case "CUSTOM": {
      // For custom reports, fall back to monthly production as default
      if (!config.parkId) {
        throw new Error("parkId is required for CUSTOM report");
      }

      const targetDate = new Date(now);
      targetDate.setMonth(targetDate.getMonth() - 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      const park = await prisma.park.findFirst({
        where: { id: config.parkId, tenantId },
        select: { name: true },
      });

      if (!park) {
        throw new Error(`Park not found: ${config.parkId}`);
      }

      const pdfBuffer = await generateMonthlyReportPdf(
        config.parkId,
        year,
        month,
        tenantId
      );

      return {
        pdfBuffer,
        title: `Benutzerdefinierter Bericht ${park.name} - ${month}/${year}`,
        filename: `Bericht_${park.name.replace(/\s+/g, "_")}_${year}_${String(month).padStart(2, "0")}.pdf`,
      };
    }

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

// ===========================================
// SCHEDULING HELPERS
// ===========================================

/**
 * Calculate the next run date based on schedule type and a reference date.
 *
 * @param schedule - MONTHLY, QUARTERLY, or ANNUALLY
 * @param fromDate - Reference date (usually the current date or last run)
 * @returns Next scheduled run date (always at 06:00 UTC)
 */
export function calculateNextRun(
  schedule: ScheduledReportSchedule,
  fromDate: Date = new Date()
): Date {
  const next = new Date(fromDate);

  switch (schedule) {
    case "MONTHLY":
      // Run on the 1st of next month at 06:00
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      break;

    case "QUARTERLY":
      // Run on the 1st of the next quarter at 06:00
      const currentQuarter = Math.floor(next.getMonth() / 3);
      const nextQuarterMonth = (currentQuarter + 1) * 3;
      if (nextQuarterMonth >= 12) {
        next.setFullYear(next.getFullYear() + 1);
        next.setMonth(0);
      } else {
        next.setMonth(nextQuarterMonth);
      }
      next.setDate(1);
      break;

    case "ANNUALLY":
      // Run on January 1st of next year at 06:00
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(0);
      next.setDate(1);
      break;

    default:
      // Fallback: next month
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      break;
  }

  // Always run at 06:00 UTC
  next.setHours(6, 0, 0, 0);

  return next;
}

/**
 * Calculate the initial nextRunAt for a newly created scheduled report.
 * This is similar to calculateNextRun but considers the current date
 * to determine the very first execution.
 */
export function calculateInitialNextRun(
  schedule: ScheduledReportSchedule
): Date {
  return calculateNextRun(schedule, new Date());
}

// ===========================================
// TYPE MAPPING HELPERS
// ===========================================

/**
 * Map ScheduledReportType to the existing ReportType enum
 * used by the GeneratedReport archive system.
 */
function mapScheduledTypeToReportType(type: ScheduledReportType) {
  return mapReportTypeToEnum(
    type === "MONTHLY_PRODUCTION"
      ? "monthly"
      : type === "QUARTERLY_FINANCIAL"
        ? "monthly" // Quarterly uses monthly template for now
        : type === "ANNUAL_SUMMARY"
          ? "annual"
          : "custom"
  );
}
