import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { apiError } from "@/lib/api-errors";

// Keys reserved for system templates. CRM templates must not collide with
// these because the EmailTemplate table has a unique (tenantId, name) index.
const RESERVED_TEMPLATE_KEYS = new Set([
  "welcome",
  "password-reset",
  "new-invoice",
  "vote-invitation",
  "tenant-admin-invitation",
  "portal-invitation",
  "vote-reminder",
  "vote-result",
  "document-shared",
  "settlement-notification",
  "news-announcement",
  "service-event",
  "report-ready",
]);

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => !RESERVED_TEMPLATE_KEYS.has(v.toLowerCase()), {
      message: "Dieser Name ist für System-Vorlagen reserviert",
    }),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
});

// GET /api/crm/email-templates
export async function GET() {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const templates = await prisma.emailTemplate.findMany({
      where: { tenantId: check.tenantId!, category: "CRM" },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(serializePrisma(templates));
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM email templates");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Templates" });
  }
}

// POST /api/crm/email-templates
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("crm:create");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const template = await prisma.emailTemplate.create({
      data: {
        tenantId: check.tenantId!,
        name: parsed.data.name,
        subject: parsed.data.subject,
        htmlContent: parsed.data.body,
        category: "CRM",
      },
    });
    return NextResponse.json(serializePrisma(template), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating CRM email template");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen" });
  }
}
