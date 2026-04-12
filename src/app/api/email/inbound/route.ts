/**
 * API Route: /api/email/inbound
 * POST: Inbound email webhook — receives parsed emails from n8n
 *
 * Auth: INBOUND_EMAIL_API_KEY (Bearer token)
 */

import crypto from "crypto";
import { apiError } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { apiLogger as logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const attachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  content: z.string(), // base64 encoded
  size: z.number().optional(),
});

const inboundEmailSchema = z.object({
  from: z.string().email(),
  to: z.string(), // full email address
  subject: z.string().optional().default(""),
  textBody: z.string().optional().default(""),
  htmlBody: z.string().optional().default(""),
  date: z.string().optional(),
  attachments: z.array(attachmentSchema).optional().default([]),
});

// ---------------------------------------------------------------------------
// POST /api/email/inbound
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ── Auth: validate INBOUND_EMAIL_API_KEY ────────────────────────────
    const apiKey = process.env.INBOUND_EMAIL_API_KEY;
    if (!apiKey) {
      logger.error("INBOUND_EMAIL_API_KEY not configured");
      return apiError("INTERNAL_ERROR", 503, { message: "Not configured" });
    }

    const authHeader = request.headers.get("authorization");
    let providedKey: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      providedKey = authHeader.slice(7).trim();
    }
    if (!providedKey) {
      providedKey = request.headers.get("x-api-key");
    }

    const isValid =
      providedKey !== null &&
      providedKey.length === apiKey.length &&
      crypto.timingSafeEqual(
        Buffer.from(providedKey, "utf8"),
        Buffer.from(apiKey, "utf8"),
      );

    if (!isValid) {
      return apiError("UNAUTHORIZED", 401, { message: "Unauthorized" });
    }

    // ── Parse & validate body ───────────────────────────────────────────
    const body = await request.json();
    const result = inboundEmailSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Invalid input", details: result.error.flatten().fieldErrors });
    }
    const data = result.data;

    // ── Route lookup ────────────────────────────────────────────────────
    // Extract email prefix (e.g. "windpark-nord" from "windpark-nord@domain.de")
    const toPrefix = data.to.split("@")[0]?.toLowerCase().trim();

    const route = await prisma.emailRoute.findFirst({
      where: { address: toPrefix, isActive: true },
    });

    // Determine tenant — from route or fallback to first active tenant
    let tenantId: string;
    if (route) {
      tenantId = route.tenantId;
    } else {
      const defaultTenant = await prisma.tenant.findFirst({
        where: { status: "ACTIVE" },
      });
      if (!defaultTenant) {
        return apiError("INTERNAL_ERROR", 500, { message: "No active tenant" });
      }
      tenantId = defaultTenant.id;
    }

    // ── Create InboundEmail record ──────────────────────────────────────
    const inboundEmail = await prisma.inboundEmail.create({
      data: {
        fromAddress: data.from,
        toAddress: data.to,
        subject: data.subject || null,
        textBody: data.textBody || null,
        htmlBody: data.htmlBody || null,
        receivedAt: data.date ? new Date(data.date) : new Date(),
        status: "RECEIVED",
        routeId: route?.id || null,
        targetType: route?.targetType || null,
        targetId: route?.targetId || null,
        attachmentCount: data.attachments.length,
        tenantId,
      },
    });

    // ── Determine action ────────────────────────────────────────────────
    const action = route?.autoAction || "INBOX";

    if (action === "IGNORE") {
      await prisma.inboundEmail.update({
        where: { id: inboundEmail.id },
        data: { status: "IGNORED" },
      });
      return NextResponse.json({ status: "ignored", id: inboundEmail.id });
    }

    // ── Process attachments ─────────────────────────────────────────────
    const results: { filename: string; action: string; id?: string }[] = [];

    for (const attachment of data.attachments) {
      const buffer = Buffer.from(attachment.content, "base64");
      const isPdf =
        attachment.contentType === "application/pdf" ||
        attachment.filename.toLowerCase().endsWith(".pdf");

      // Heuristic: does this look like an invoice?
      const subjectLower = (data.subject || "").toLowerCase();
      const filenameLower = attachment.filename.toLowerCase();
      const isInvoice =
        isPdf &&
        (subjectLower.includes("rechnung") ||
          subjectLower.includes("invoice") ||
          subjectLower.includes("gutschrift") ||
          filenameLower.includes("rechnung") ||
          filenameLower.includes("invoice"));

      // Upload to S3
      const fileKey = await uploadFile(
        buffer,
        attachment.filename,
        attachment.contentType,
        tenantId,
      );

      if (isInvoice && action !== "DOCUMENT") {
        // Create IncomingInvoice (goes to Inbox for review)
        const invoice = await prisma.incomingInvoice.create({
          data: {
            tenantId,
            invoiceType: "INVOICE",
            status: "INBOX",
            fileUrl: fileKey,
            fileName: attachment.filename,
            fileSizeBytes: buffer.length,
            mimeType: attachment.contentType,
            ocrStatus: "PENDING",
            vendorNameFallback: data.from,
            notes: `Automatisch empfangen von ${data.from}: ${data.subject || "Ohne Betreff"}`,
            recipientFundId:
              route?.targetType === "FUND" ? route.targetId : null,
            createdById: "system",
          },
        });
        results.push({
          filename: attachment.filename,
          action: "inbox",
          id: invoice.id,
        });
      } else {
        // Create Document
        const doc = await prisma.document.create({
          data: {
            title: attachment.filename,
            description: `E-Mail von ${data.from}: ${data.subject || "Ohne Betreff"}`,
            category: "CORRESPONDENCE",
            fileName: attachment.filename,
            fileUrl: fileKey,
            fileSizeBytes: buffer.length,
            mimeType: attachment.contentType,
            tenantId,
            parkId: route?.targetType === "PARK" ? route.targetId : null,
            fundId: route?.targetType === "FUND" ? route.targetId : null,
            uploadedById: null,
          },
        });
        results.push({
          filename: attachment.filename,
          action: "document",
          id: doc.id,
        });
      }
    }

    // ── Update status ───────────────────────────────────────────────────
    await prisma.inboundEmail.update({
      where: { id: inboundEmail.id },
      data: {
        status: "PROCESSED",
        processingNotes: `${results.length} Anhänge verarbeitet: ${results.map((r) => `${r.filename} → ${r.action}`).join(", ")}`,
      },
    });

    logger.info(
      {
        inboundEmailId: inboundEmail.id,
        from: data.from,
        to: data.to,
        attachments: results.length,
      },
      "Inbound email processed",
    );

    return NextResponse.json({
      status: "processed",
      id: inboundEmail.id,
      results,
    });
  } catch (error) {
    logger.error({ err: error }, "Inbound email processing failed");
    return apiError("INTERNAL_ERROR", 500, { message: "Processing failed" });
  }
}
