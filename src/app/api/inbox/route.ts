import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { uploadFile } from "@/lib/storage";
import { enqueueInboxOcrJob } from "@/lib/queue/queues/inbox-ocr.queue";

async function checkInbox(tenantId: string) {
  if (!await getConfigBoolean("inbox.enabled", tenantId, false)) {
    return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
  }
  return null;
}

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/tiff"];

// GET /api/inbox
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("inbox:read");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const invoiceType = searchParams.get("type");
    const vendorId = searchParams.get("vendorId");
    const recipientFundId = searchParams.get("recipientFundId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      tenantId: check.tenantId!,
      deletedAt: null,
    };
    if (status) where.status = status;
    if (invoiceType) where.invoiceType = invoiceType;
    if (vendorId) where.vendorId = vendorId;
    if (recipientFundId) where.recipientFundId = recipientFundId;
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }

    const [invoices, total] = await Promise.all([
      prisma.incomingInvoice.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true } },
          recipientFund: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.incomingInvoice.count({ where }),
    ]);

    return NextResponse.json({ data: serializePrisma(invoices), total, page, limit });
  } catch (error) {
    logger.error({ err: error }, "Error listing inbox invoices");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

// POST /api/inbox  (multipart upload)
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("inbox:create");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Keine Datei im Request" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Nur PDF und Bilddateien (JPEG, PNG, TIFF) erlaubt" },
        { status: 400 }
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Datei zu groß (max. 50 MB)" }, { status: 400 });
    }

    // Optional metadata from form
    const invoiceType = (formData.get("invoiceType") as string) || "INVOICE";
    const vendorId = (formData.get("vendorId") as string) || null;
    const recipientFundId = (formData.get("recipientFundId") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    const tenantId = check.tenantId!;

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileUrl = await uploadFile(buffer, file.name, file.type, tenantId);

    // Create DB record
    const invoice = await prisma.incomingInvoice.create({
      data: {
        tenantId,
        invoiceType: invoiceType as "INVOICE" | "CREDIT_NOTE",
        status: "INBOX",
        ocrStatus: "PENDING",
        fileUrl,
        fileName: file.name,
        fileSizeBytes: BigInt(file.size),
        mimeType: file.type,
        vendorId,
        recipientFundId,
        notes,
        createdById: check.userId!,
      },
    });

    // Enqueue OCR job
    await enqueueInboxOcrJob({
      invoiceId: invoice.id,
      tenantId,
      fileUrl,
    });

    return NextResponse.json(serializePrisma(invoice), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error uploading inbox invoice");
    return NextResponse.json({ error: "Fehler beim Hochladen" }, { status: 500 });
  }
}
